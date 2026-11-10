import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { parseHTML } from "linkedom"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useCellManager } from "../src/hooks/useCellManager.ts"
import { useNotebookRuntime } from "../src/hooks/useNotebookRuntime.ts"

vi.mock("composer-nb/engine", async () => {
  const language = await import("composer-nb/language")
  return {
    initialState: language.initialState,
    parseSource: language.parseCell,
    renderToBuffer: vi.fn(async () => ({ duration: 1 })),
    bufferDuration: () => 1,
  }
})

let root: Root
let runtime: ReturnType<typeof useNotebookRuntime>
let manager: ReturnType<typeof useCellManager>

beforeEach(async () => {
  vi.useFakeTimers()
  const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>")
  vi.stubGlobal("window", window)
  vi.stubGlobal("document", document)
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  function Notebook() {
    manager = useCellManager([
      { id: "first", type: "music", source: "play piano: notes C3---" },
      { id: "second", type: "music", source: "play piano: notes D3---" },
    ])
    runtime = useNotebookRuntime(manager)
    return null
  }
  root = createRoot(document.getElementById("root")!)
  await act(async () => root.render(React.createElement(Notebook)))
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it("renders Run all silently and never advances playback into the next cell", async () => {
  await act(async () => {
    runtime.queuedRunAll()
    await vi.runAllTimersAsync()
  })
  expect(manager.cells.map((cell) => cell.output?.kind)).toEqual(["rendered", "rendered"])
  expect(runtime.playback.focusedCellId).toBeNull()
  expect(runtime.playback.isPlaying).toBe(false)
  await act(async () => runtime.togglePlayback("first"))
  expect(runtime.playback.isPlaying).toBe(true)
  await act(async () => runtime.onPlaybackFinished("first"))
  expect(runtime.playback.focusedCellId).toBeNull()
  expect(runtime.playback.isPlaying).toBe(false)
})

it("keeps the paused position, while Stop resets the player and clears its focus", async () => {
  let time = 3
  const stop = vi.fn(() => { time = 0 })
  runtime.playback.registerPlayer("first", {
    play: vi.fn(), pause: vi.fn(), stop,
    isPlaying: () => runtime.playback.isPlaying,
    getCurrentTime: () => time,
  })
  await act(async () => runtime.togglePlayback("first"))
  await act(async () => runtime.togglePlayback("first"))
  expect(runtime.playback.isPlaying).toBe(false)
  expect(runtime.playback.focusedCellId).toBe("first")
  expect(time).toBe(3)
  expect(stop).not.toHaveBeenCalled()
  await act(async () => runtime.playback.stopCell("first"))
  expect(stop).toHaveBeenCalledOnce()
  expect(time).toBe(0)
  expect(runtime.playback.focusedCellId).toBeNull()
  await act(async () => runtime.togglePlayback("first"))
  expect(runtime.playback.isPlaying).toBe(true)
  expect(time).toBe(0)
})

it("stops a playing cell when it is rerun and leaves the new output paused", async () => {
  const stop = vi.fn()
  runtime.playback.registerPlayer("first", {
    play: vi.fn(), pause: vi.fn(), stop,
    isPlaying: () => true, getCurrentTime: () => 3,
  })
  await act(async () => runtime.togglePlayback("first"))
  await act(async () => {
    runtime.runCellNow("first")
    await vi.runAllTimersAsync()
  })
  expect(stop).toHaveBeenCalled()
  expect(manager.cells[0].output?.kind).toBe("rendered")
  expect(runtime.playback.isPlaying).toBe(false)
  expect(runtime.playback.focusedCellId).toBeNull()
})
