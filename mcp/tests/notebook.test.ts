import { describe, expect, it } from "vitest"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createServer } from "../src/server.ts"
import { NOTEBOOK_UI } from "../src/app.ts"
import { NotebookStore } from "../src/notebook.ts"
import { notebookSchema, type NotebookDocument } from "../src/notebook-document.ts"

const fixture: NotebookDocument = {
  id: "test-notebook",
  title: "Test notebook",
  revision: 0,
  cells: [
    { id: "settings", type: "music", source: "set tempo 92" },
    { id: "progression", type: "music", source: "play piano: chords Am F|C G" },
    { id: "groove", type: "music", source: "play block { kick: 1 3 }" },
  ],
}

describe("host-owned notebook", () => {
  it("preserves stable IDs and rejects stale or dependent-invalid edits atomically", () => {
    const store = new NotebookStore({
      id: "test",
      title: "Test",
      revision: 0,
      cells: [
        { id: "definition", type: "music", source: "pattern beat = { kick: x--- }" },
        { id: "play", type: "music", source: "play beat" },
      ],
    })
    expect(() => store.save([{ id: "play", type: "music", source: "play beat" }], 0)).toThrow()
    expect(store.read().revision).toBe(0)
    const original = store.read()
    store.save(original.cells, 0)
    expect(() => store.save(original.cells, 0)).toThrow("changed")
    expect(store.read().cells.map((cell) => cell.id)).toEqual(["definition", "play"])
    expect(() => store.save([original.cells[0], original.cells[0]], 1)).toThrow("unique")
    expect(store.read().revision).toBe(1)
  })
  it("opens and edits the same document across independent MCP clients", async () => {
    const store = new NotebookStore(fixture)
    const connect = async () => {
      const [a, b] = InMemoryTransport.createLinkedPair()
      await createServer({ notebook: store }).connect(b)
      const client = new Client({ name: "notebook-test", version: "1" })
      await client.connect(a)
      return client
    }
    const first = await connect()
    const second = await connect()
    try {
      const { tools } = await first.listTools()
      expect(tools.find((tool) => tool.name === "open_notebook")?.annotations?.readOnlyHint).toBe(
        true,
      )
      expect(tools.find((tool) => tool.name === "get_notebook")?.annotations?.readOnlyHint).toBe(
        true,
      )
      expect(tools.find((tool) => tool.name === "save_notebook")?._meta).toMatchObject({
        ui: { visibility: ["app"] },
      })
      const resource = await first.readResource({ uri: NOTEBOOK_UI })
      expect(resource.contents[0]._meta).toMatchObject({
        "openai/ui": { availableDisplayModes: ["fullscreen"] },
      })
      const opened = await first.callTool({ name: "open_notebook", arguments: {} })
      const before = notebookSchema.parse(
        CallToolResultSchema.parse(opened).structuredContent?.notebook,
      )
      const edited = await second.callTool({
        name: "update_music_cell",
        arguments: {
          cellId: "groove",
          source: "play block {\n kick: 1 3\n snare: 2 4\n hat: 1 2 3 4\n}",
          expectedRevision: before.revision,
        },
      })
      expect(edited.isError).toBeFalsy()
      const read = await first.callTool({ name: "get_notebook", arguments: {} })
      const after = notebookSchema.parse(
        CallToolResultSchema.parse(read).structuredContent?.notebook,
      )
      expect(after.revision).toBe(before.revision + 1)
      expect(after.cells.slice(0, 2)).toEqual(before.cells.slice(0, 2))
      expect(after.cells[2].source).toContain("hat: 1 2 3 4")
    } finally {
      await first.close()
      await second.close()
    }
  })
})

describe("saved notebooks", () => {
  it("survives reopening, rejects stale edits and preserves unfinished editor drafts", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const { FileNotebookStore } = await import("../src/notebook-file.ts")
    const directory = mkdtempSync(join(tmpdir(), "composer-notebook-test-"))
    try {
      const path = join(directory, "song.json")
      const first = new FileNotebookStore(path)
      expect(first.read().cells).toEqual([])
      const saved = first.save(fixture.cells, 0)
      const second = new FileNotebookStore(path)
      expect(second.read()).toEqual(saved)
      first.save(
        [{ id: "draft", type: "music", source: "pattern unfinished = {" }],
        saved.revision,
        { validate: false },
      )
      expect(() => second.save(fixture.cells, saved.revision)).toThrow("changed")
      expect(second.read().cells[0].source).toBe("pattern unfinished = {")
    } finally {
      rmSync(directory, { recursive: true })
    }
  })
})
