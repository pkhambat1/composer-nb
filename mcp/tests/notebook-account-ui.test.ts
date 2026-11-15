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
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(callServerTool).toHaveBeenCalledWith({
      name: "get_notebook",
      arguments: { notebookId: initial.id },
    })
  } finally {
    await act(async () => root.unmount())
  }
})

it("keeps saved work marked Saved during a read failure, backs off, and recovers without a new revision", async () => {
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
  const callServerTool = vi
    .fn()
    .mockRejectedValueOnce(new Error("MCP error -32000: Failed to fetch"))
    .mockResolvedValue({ content: [], structuredContent: { notebook: initial } })
  const app = { callServerTool, getHostCapabilities: () => ({}) } as unknown as App
  const root = createRoot(document.getElementById("root")!)
  try {
    await act(async () => {
      root.render(React.createElement(NotebookApp, { app, initial, theme: "light" }))
    })
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

it("a late read failure cannot hide unsaved edits or a failed write", async () => {
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
  let rejectRead: (error: Error) => void = () => {}
  const callServerTool = vi.fn(({ name }: { name: string }) =>
    name === "get_notebook"
      ? new Promise((_, reject) => {
          rejectRead = reject
        })
      : Promise.reject(new Error("Write unavailable")),
  )
  const app = { callServerTool, getHostCapabilities: () => ({}) } as unknown as App
  const root = createRoot(document.getElementById("root")!)
  try {
    await act(async () => {
      root.render(React.createElement(NotebookApp, { app, initial, theme: "light" }))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await act(async () => {
      mock.snapshot!({
        cells: [{ ...initial.cells[0], source: "play piano: chords 1" }],
        selectedId: "stable-cell",
        selection: null,
      } as NotebookSnapshot)
      await vi.advanceTimersByTimeAsync(601)
    })
    await act(async () => {
      rejectRead(new Error("Failed to fetch"))
    })
    expect(document.querySelector(".save-indicator")?.textContent).toContain("Unsaved changes")
    expect(document.querySelector(".save-indicator")?.getAttribute("title")).toContain(
      "Write unavailable",
    )
    expect(document.body.textContent).toContain("Couldn’t check for updates")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(callServerTool).toHaveBeenCalledTimes(2)
  } finally {
    await act(async () => root.unmount())
  }
})
