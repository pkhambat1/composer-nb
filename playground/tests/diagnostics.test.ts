import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { parseHTML } from "linkedom"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useCellManager } from "../src/hooks/useCellManager.ts"
import { useNotebookRuntime } from "../src/hooks/useNotebookRuntime.ts"
import * as Engine from "composer-nb/engine"

vi.mock("composer-nb/engine", async () => {
  const language = await import("composer-nb/language")
  return {
    initialState: language.initialState,
    parseSource: language.parseCell,
    renderToBuffer: vi.fn(),
    bufferDuration: () => 1,
  }
})

let root: Root
let runtime: ReturnType<typeof useNotebookRuntime>
let manager: ReturnType<typeof useCellManager>
beforeEach(async () => {
  const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>")
  vi.stubGlobal("window", window)
  vi.stubGlobal("document", document)
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  function Notebook() {
    manager = useCellManager([
      { id: "setting", type: "music", source: "set mode major" },
      { id: "notes", type: "music", source: "play piano: notes vii---" },
      { id: "text", type: "text", source: "not music" },
    ])
    runtime = useNotebookRuntime(manager)
    return null
  }
  root = createRoot(document.getElementById("root")!)
  await act(async () => root.render(React.createElement(Notebook)))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it("checks edits and affected later cells without running or rendering audio", async () => {
  expect(runtime.diagnostics.get("notes")?.errors).toEqual([])
  expect(runtime.diagnostics.has("text")).toBe(false)
  await act(async () => manager.updateCell("setting", { source: "set mode wholeTone" }))
  expect(runtime.diagnostics.get("notes")?.errors).toHaveLength(1)
  expect(runtime.diagnostics.get("notes")?.source).toBe("play piano: notes vii---")
  expect(manager.cells.every((c) => c.status === "idle")).toBe(true)
  expect(Engine.renderToBuffer).not.toHaveBeenCalled()
  await act(async () => manager.updateCell("setting", { source: "set mode major" }))
  expect(runtime.diagnostics.get("notes")?.errors).toEqual([])
})

it("clears a corrected cell's diagnostics and carries the matching source", async () => {
  await act(async () => manager.updateCell("setting", { source: "set tempo fast" }))
  expect(runtime.diagnostics.get("setting")?.errors).toMatchObject([{ col: 10, endCol: 14 }])
  await act(async () => manager.updateCell("setting", { source: "set tempo 90" }))
  expect(runtime.diagnostics.get("setting")).toEqual({ source: "set tempo 90", errors: [] })
})
