import { describe, expect, it } from "vitest"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createServer } from "../src/server.ts"
import { NOTEBOOK_UI } from "../src/app.ts"
import { NotebookStore } from "../src/notebook.ts"
import {
  CONFLICT_META,
  NOTEBOOK_META,
  notebookOf,
  notebookSchema,
  type NotebookDocument,
} from "../src/notebook-document.ts"

const fixture: NotebookDocument = {
  id: "test-notebook",
  title: "Test notebook",
  revision: 0,
  cells: [
    { id: "settings", type: "music", source: "set tempo 92" },
    { id: "progression", type: "music", source: "play piano: chords Am F|C G" },
    { id: "groove", type: "music", source: "play block { kick: x 7*- x 7*- }" },
  ],
}

describe("host-owned notebook", () => {
  it("preserves stable IDs and rejects stale edits atomically", () => {
    const store = new NotebookStore({
      id: "test",
      title: "Test",
      revision: 0,
      cells: [
        { id: "definition", type: "music", source: "pattern beat = { kick: x--- }" },
        { id: "play", type: "music", source: "play beat" },
      ],
    })
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
      // The notebook goes to the app in _meta; the model gets where it is, not its source
      expect(JSON.stringify(opened.structuredContent)).not.toContain("chords Am F")
      expect(JSON.stringify(opened.content)).not.toContain("chords Am F")
      const before = notebookSchema.parse(notebookOf(CallToolResultSchema.parse(opened)))
      const edited = await second.callTool({
        name: "update_music_cell",
        arguments: {
          cellId: "groove",
          source:
            "play block {\n kick: x 7*- x 7*-,\n snare: 4*- x 7*- x 3*-,\n hat: x 3*- x 3*- x 3*- x 3*-\n}",
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
      expect(after.cells[2].source).toContain("hat: x 3*- x 3*- x 3*- x 3*-")
    } finally {
      await first.close()
      await second.close()
    }
  })
})

describe("the assistant's writes", () => {
  const connect = async (store: NotebookStore) => {
    const [a, b] = InMemoryTransport.createLinkedPair()
    await createServer({ notebook: store }).connect(b)
    const client = new Client({ name: "notebook-test", version: "1" })
    await client.connect(a)
    return client
  }
  const textOf = (result: unknown) =>
    CallToolResultSchema.parse(result)
      .content.map((item) => (item.type === "text" ? item.text : ""))
      .join("\n")

  it("appends in one call: no revision, the parse report back, the notebook for the app only", async () => {
    const store = new NotebookStore(fixture)
    const client = await connect(store)
    try {
      const added = await client.callTool({
        name: "add_music_cell",
        arguments: { source: "play piano: chords 1 4|5 1" },
      })
      expect(added.isError).toBeFalsy()
      expect(textOf(added)).toContain('Added cell 4 to "Test notebook"')
      expect(textOf(added)).toContain("No errors.")
      expect(textOf(added)).toContain("chords bar 1: C (C E G) · F (F A C)")
      // What the cells above set reaches the report
      expect(textOf(added)).toContain("tempo 92")
      expect(added.structuredContent).toMatchObject({ revision: 1, cellCount: 4, cellNumber: 4 })
      expect(JSON.stringify([added.content, added.structuredContent])).not.toContain("Am F")
      expect(notebookSchema.parse(added._meta?.[NOTEBOOK_META]).cells).toHaveLength(4)
    } finally {
      await client.close()
    }
  })
  it("saves nothing when the cell has errors, and says them", async () => {
    const store = new NotebookStore(fixture)
    const client = await connect(store)
    try {
      const added = await client.callTool({
        name: "add_music_cell",
        arguments: { source: "piano: Am F" },
      })
      expect(added.isError).toBe(true)
      expect(textOf(added)).toContain("Not saved.")
      expect(textOf(added)).toContain("line 1")
      expect(store.read()).toEqual(fixture)
    } finally {
      await client.close()
    }
  })
  it("writes beside a draft the user left unfinished", async () => {
    const store = new NotebookStore({
      ...fixture,
      cells: [...fixture.cells, { id: "draft", type: "music", source: "pattern unfinished = {" }],
    })
    const client = await connect(store)
    try {
      const added = await client.callTool({
        name: "add_music_cell",
        arguments: { source: "play piano: chords 1" },
      })
      expect(added.isError).toBeFalsy()
      const updated = await client.callTool({
        name: "update_music_cell",
        arguments: {
          cellId: "progression",
          source: "play piano: chords 6 4|1 5",
          expectedRevision: 1,
        },
      })
      expect(updated.isError).toBeFalsy()
      expect(store.read().cells.find((c) => c.id === "draft")?.source).toBe(
        "pattern unfinished = {",
      )
    } finally {
      await client.close()
    }
  })
  it("names the cells below that an edit broke, and marks a stale revision as a conflict", async () => {
    const store = new NotebookStore({
      id: "test",
      title: "Test",
      revision: 0,
      cells: [
        { id: "definition", type: "music", source: "pattern beat = { kick: x--- }" },
        { id: "play", type: "music", source: "play beat" },
      ],
    })
    const client = await connect(store)
    try {
      const updated = await client.callTool({
        name: "update_music_cell",
        arguments: {
          cellId: "definition",
          source: "pattern pulse = { kick: x--- }",
          expectedRevision: 0,
        },
      })
      expect(updated.isError).toBeFalsy()
      expect(textOf(updated)).toContain("Cell 2 now has errors")
      const stale = await client.callTool({
        name: "update_music_cell",
        arguments: { cellId: "definition", source: "set tempo 90", expectedRevision: 0 },
      })
      expect(stale.isError).toBe(true)
      expect(stale._meta?.[CONFLICT_META]).toBe(true)
      const revision = await client.callTool({ name: "notebook_revision", arguments: {} })
      expect(revision.structuredContent).toEqual({ notebookId: "test", revision: 1 })
      const renamed = await client.callTool({
        name: "rename_notebook",
        arguments: { title: "  Sketches  " },
      })
      expect(renamed.structuredContent).toEqual({ id: "test", title: "Sketches", revision: 1 })
      expect(store.read().cells).toHaveLength(2)
      const emptied = await client.callTool({ name: "rename_notebook", arguments: { title: " " } })
      expect(emptied.structuredContent).toMatchObject({ title: "Untitled" })
      const saved = await client.callTool({
        name: "save_notebook",
        arguments: { cells: store.read().cells, expectedRevision: 1 },
      })
      expect(saved.structuredContent).toEqual({ notebookId: "test", revision: 2 })
    } finally {
      await client.close()
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
      first.save([{ id: "draft", type: "music", source: "pattern unfinished = {" }], saved.revision)
      expect(() => second.save(fixture.cells, saved.revision)).toThrow("changed")
      expect(second.read().cells[0].source).toBe("pattern unfinished = {")
    } finally {
      rmSync(directory, { recursive: true })
    }
  })
})
