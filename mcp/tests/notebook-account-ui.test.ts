import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { parseHTML } from "linkedom"
import { afterEach, expect, it, vi } from "vitest"
import type { App } from "@modelcontextprotocol/ext-apps"
import type { NotebookSnapshot } from "../../playground/src/notebook/index.ts"
import NotebookTitle from "../../playground/src/components/NotebookTitle.tsx"
import { NotebookApp } from "../app/NotebookApp.tsx"

const mock = vi.hoisted(() => ({ snapshot: null as null | ((value: NotebookSnapshot) => void) }))
vi.mock("../../playground/src/notebook/index.ts", () => ({
  NotebookEditor: (props: { onSnapshot: (value: NotebookSnapshot) => void; subtitle: string }) => {
    mock.snapshot = props.onSnapshot
    return React.createElement(NotebookTitle, {
      title: "Chosen",
      subtitle: props.subtitle,
      menu: null,
    })
  },
}))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  mock.snapshot = null
})

import { CONFLICT_META, type NotebookDocument } from "../src/notebook-document.ts"

// The server's side of the app's three calls, over one notebook.
function fakeServer(initial: NotebookDocument) {
  let saved = structuredClone(initial)
  const callServerTool = vi.fn(
    async ({ name, arguments: args }: { name: string; arguments: Record<string, unknown> }) => {
      expect(args.notebookId).toBe(initial.id)
      if (name === "get_notebook") return { content: [], structuredContent: { notebook: saved } }
      if (name === "save_notebook") {
        if (args.expectedRevision !== saved.revision)
          return {
            isError: true,
            content: [{ type: "text", text: "The notebook changed." }],
            _meta: { [CONFLICT_META]: true },
          }
        saved = {
          ...saved,
          revision: saved.revision + 1,
          cells: args.cells as NotebookDocument["cells"],
        }
      }
      return {
        content: [],
        structuredContent: { notebookId: saved.id, revision: saved.revision },
      }
    },
  )
  return {
    callServerTool,
    read: () => saved,
    // A write from elsewhere: the assistant's, or the website's
    write: (cells: NotebookDocument["cells"]) => {
      saved = { ...saved, revision: saved.revision + 1, cells }
    },
    calls: (name: string) => callServerTool.mock.calls.filter(([call]) => call.name === name),
  }
}
async function mount(initial: NotebookDocument, callServerTool?: App["callServerTool"]) {
  vi.useFakeTimers()
  const { document, window } = parseHTML("<html><body><div id='root'></div></body></html>")
  vi.stubGlobal("window", window)
  vi.stubGlobal("document", document)
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const server = fakeServer(initial)
  const updateModelContext = vi.fn(async () => ({}))
  const app = {
    callServerTool: callServerTool ?? server.callServerTool,
    updateModelContext,
    getHostCapabilities: () => ({ updateModelContext: {} }),
  } as unknown as App
  const root = createRoot(document.getElementById("root")!)
  await act(async () => {
    root.render(React.createElement(NotebookApp, { app, initial, theme: "light" }))
  })
  const type = (cells: NotebookDocument["cells"], selectedId: string | null = null) =>
    mock.snapshot!({ cells, selectedId, selection: null } as NotebookSnapshot)
  return { server, updateModelContext, root, type, document }
}
const initial: NotebookDocument = {
  id: "chosen-notebook",
  title: "Chosen",
  revision: 7,
  cells: [
    { id: "stable-cell", type: "music", source: "" },
    { id: "other-cell", type: "music", source: "play piano: chords 6 4|1 5" },
  ],
}

it("saves the cells against its revision, polls the revision alone and tells the model the selected cell", async () => {
  const { server, updateModelContext, root, type } = await mount(initial)
  try {
    const cells = [{ ...initial.cells[0], source: "play piano: chords 1" }, initial.cells[1]]
    await act(async () => {
      type(cells, "stable-cell")
      await vi.advanceTimersByTimeAsync(601)
    })
    expect(server.callServerTool).toHaveBeenCalledWith({
      name: "save_notebook",
      arguments: { notebookId: initial.id, expectedRevision: 7, cells },
    })
    const context = JSON.stringify(updateModelContext.mock.calls)
    expect(context).toContain("Notebook ID: chosen-notebook")
    expect(context).toContain("play piano: chords 1")
    expect(context).not.toContain("chords 6 4")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(server.calls("notebook_revision").length).toBeGreaterThanOrEqual(2)
    // Nothing changed elsewhere, so the notebook is never read, and saved once
    expect(server.calls("get_notebook")).toHaveLength(0)
    expect(server.calls("save_notebook")).toHaveLength(1)
  } finally {
    await act(async () => root.unmount())
  }
})

it("merges a save the notebook moved under, and goes on saving after it", async () => {
  const { server, root, type } = await mount(initial)
  try {
    const appended = {
      id: "assistant-cell",
      type: "music" as const,
      source: "play piano: chords 2 5|1",
    }
    server.write([...initial.cells, appended])
    const mine = [{ ...initial.cells[0], source: "set tempo 90" }, initial.cells[1]]
    await act(async () => {
      type(mine, "stable-cell")
      await vi.advanceTimersByTimeAsync(601)
    })
    // Refused at revision 7, read, merged, saved at 8: the user's edit and the new cell
    expect(server.read()).toEqual({ ...initial, revision: 9, cells: [...mine, appended] })
    const next = [{ ...mine[0], source: "set tempo 100" }, mine[1], appended]
    await act(async () => {
      type(next, "stable-cell")
      await vi.advanceTimersByTimeAsync(601)
    })
    expect(server.read()).toEqual({ ...initial, revision: 10, cells: next })
  } finally {
    await act(async () => root.unmount())
  }
})

it("shows what changed elsewhere when the user has nothing unsaved", async () => {
  const { server, root } = await mount(initial)
  try {
    server.write([initial.cells[1]])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5001)
    })
    expect(server.calls("get_notebook")).toHaveLength(1)
    expect(server.calls("save_notebook")).toHaveLength(0)
  } finally {
    await act(async () => root.unmount())
  }
})

it("keeps saved work marked Saved during a failed check, backs off, and recovers", async () => {
  const callServerTool = vi
    .fn()
    .mockRejectedValueOnce(new Error("MCP error -32000: Failed to fetch"))
    .mockResolvedValue({
      content: [],
      structuredContent: { notebookId: initial.id, revision: initial.revision },
    })
  const { root, document } = await mount(initial, callServerTool)
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(document.querySelector(".save-indicator")?.textContent).toContain("Saved")
    expect(document.body.textContent).not.toContain("Save failed")
    expect(document.body.textContent).toContain("Couldn’t check for updates. Retrying…")
    expect(document.querySelector('[title="MCP error -32000: Failed to fetch"]')).not.toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999)
    })
    expect(callServerTool).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(callServerTool).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).not.toContain("Couldn’t check for updates")
    expect(document.querySelector(".save-indicator")?.textContent).toContain("Saved")
  } finally {
    await act(async () => root.unmount())
  }
})

it("a late failed check cannot hide unsaved edits or a failed write, which is tried again", async () => {
  let rejectCheck: (error: Error) => void = () => {}
  const callServerTool = vi.fn(({ name }: { name: string }) =>
    name === "notebook_revision"
      ? new Promise((_, reject) => {
          rejectCheck = reject
        })
      : Promise.reject(new Error("Write unavailable")),
  )
  const { root, type, document } = await mount(
    initial,
    callServerTool as unknown as App["callServerTool"],
  )
  const saves = () => callServerTool.mock.calls.filter(([c]) => c.name === "save_notebook").length
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await act(async () => {
      type([{ ...initial.cells[0], source: "play piano: chords 1" }, initial.cells[1]])
      await vi.advanceTimersByTimeAsync(601)
    })
    await act(async () => {
      rejectCheck(new Error("Failed to fetch"))
    })
    const indicator = () => document.querySelector(".save-indicator")
    expect(indicator()?.textContent).toContain("Unsaved changes")
    expect(indicator()?.getAttribute("title")).toContain("Write unavailable")
    expect(document.body.textContent).toContain("Couldn’t check for updates")
    expect(saves()).toBe(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(saves()).toBeGreaterThan(1)
    expect(indicator()?.textContent).toContain("Unsaved changes")
  } finally {
    await act(async () => root.unmount())
  }
})
