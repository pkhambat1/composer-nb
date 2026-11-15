import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { parseHTML } from "linkedom"
import { afterEach, expect, it, vi } from "vitest"
import type { App } from "@modelcontextprotocol/ext-apps"
import type { NotebookSnapshot } from "../../playground/src/notebook/index.ts"
import { NotebookApp } from "../app/NotebookApp.tsx"

const mock = vi.hoisted(() => ({ snapshot: null as null | ((value: NotebookSnapshot) => void) }))
vi.mock("../../playground/src/notebook/index.ts", () => ({
  NotebookEditor: (props: { onSnapshot: (value: NotebookSnapshot) => void }) => {
    mock.snapshot = props.onSnapshot
    return null
  },
}))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  mock.snapshot = null
})

it("binds autosave, polling and selection context to this notebook's ID", async () => {
  vi.useFakeTimers()
  const { document, window } = parseHTML("<html><body><div id='root'></div></body></html>")
  vi.stubGlobal("window", window)
  vi.stubGlobal("document", document)
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const initial = {
    id: "chosen-notebook",
    title: "Chosen",
    revision: 7,
    cells: [{ id: "stable-cell", type: "music" as const, source: "" }],
  }
  let saved = initial
  const callServerTool = vi.fn(
    async ({ name, arguments: args }: { name: string; arguments: Record<string, unknown> }) => {
      expect(args.notebookId).toBe(initial.id)
      if (name === "save_notebook")
        saved = {
          ...saved,
          revision: saved.revision + 1,
          cells: args.cells as typeof initial.cells,
        }
      return { content: [], structuredContent: { notebook: saved } }
    },
  )
  const updateModelContext = vi.fn(async () => ({}))
  const app = {
    callServerTool,
    updateModelContext,
    getHostCapabilities: () => ({ updateModelContext: {} }),
  } as unknown as App
  const root = createRoot(document.getElementById("root")!)
  try {
    await act(async () => {
      root.render(React.createElement(NotebookApp, { app, initial, theme: "light" }))
    })
    const changed = {
      cells: [{ ...initial.cells[0], source: "play piano: chords 1" }],
      selectedId: "stable-cell",
      selection: null,
    } as NotebookSnapshot
    await act(async () => {
      mock.snapshot!(changed)
      await vi.advanceTimersByTimeAsync(601)
    })
    expect(callServerTool).toHaveBeenCalledWith({
      name: "save_notebook",
      arguments: { notebookId: initial.id, expectedRevision: 7, cells: changed.cells },
    })
    expect(JSON.stringify(updateModelContext.mock.calls)).toContain("Notebook ID: chosen-notebook")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(callServerTool).toHaveBeenCalledWith({
      name: "get_notebook",
      arguments: { notebookId: initial.id },
    })
  } finally {
    await act(async () => root.unmount())
  }
})
