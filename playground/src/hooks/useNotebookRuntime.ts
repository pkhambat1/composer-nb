/* Shared execution state: parsing, render queue and playback. No storage or host SDK. */
import React from "react"
import * as MusicEngine from "composer-nb/engine"
import type { Host, KernelStatus } from "../shared/types.ts"
import type { useCellManager } from "./useCellManager.ts"
import { usePlayback } from "./usePlayback.ts"

export function useNotebookRuntime(
  manager: ReturnType<typeof useCellManager>,
  host: Host | null = null,
) {
  const { cells, updateCell, setEditingId } = manager
  const hostRef = React.useRef(host)
  hostRef.current = host
  const [kernelStatus, setKernelStatus] = React.useState<KernelStatus>("idle")
  const [activeCellId, setActiveCellId] = React.useState<string | null>(null)
  const [runCounter, setRunCounter] = React.useState(0)
  const abortRef = React.useRef<symbol | null>(null)
  const playback = usePlayback()

  // Play all: every music cell renders, then they play one after another.
  const playAllRef = React.useRef<{ ids: string[]; rendered: Set<string>; pending: number } | null>(
    null,
  )

  // Renders a cell, and plays it when asked (the cell's own button and Shift+Enter).
  const runCell = React.useCallback(
    async (id: string, play = false) => {
      const c = cells.find((x) => x.id === id)
      if (!c) return
      if (c.type === "text") {
        setEditingId((e) => (e === id ? null : e))
        return
      }
      hostRef.current?.onRun?.(cells.map(({ type, source }) => ({ type, source })))
      // Running a cell starts it over: a cell that is playing plays its new audio from the
      // start, as the first run of it would
      setKernelStatus("busy")
      setActiveCellId(id)
      updateCell(id, { status: "running", output: null })
      const runId = Symbol()
      abortRef.current = runId
      try {
        // Settings and names carry on from the music cells above, like variables in Jupyter,
        // and in a host page from the source the page says comes before them.
        let inherited = MusicEngine.initialState()
        const after = hostRef.current?.after
        if (after) inherited = MusicEngine.parseSource(after, inherited).state
        for (const prev of cells.slice(0, cells.indexOf(c))) {
          if (prev.type === "music")
            inherited = MusicEngine.parseSource(prev.source, inherited).state
        }
        const parsed = MusicEngine.parseSource(c.source, inherited)
        if (abortRef.current !== runId) return
        if (parsed.errors && parsed.errors.length > 0) {
          const lines = parsed.errors.map((e) => `Line ${e.line}: ${e.msg}`).join("\n")
          playback.stopCell(id)
          updateCell(id, {
            status: "idle",
            output: {
              kind: "error",
              error: lines,
              lines: parsed.errors.map((e) => e.line),
              source: c.source,
            },
          })
          return
        }
        if (parsed.events.length === 0 && parsed.drumEvents.length === 0) {
          playback.stopCell(id)
          setRunCounter(runCounter + 1)
          updateCell(id, {
            status: "idle",
            runCount: runCounter + 1,
            output: { kind: "info", message: "Executed" },
          })
          return
        }
        const nextCount = runCounter + 1
        setRunCounter(nextCount)
        updateCell(id, {
          status: "rendering",
          runCount: nextCount,
          output: { kind: "rendering", parsed, duration: parsed.totalSec },
        })
        // Yield so React can paint chord chips before the render blocks the main thread
        await new Promise((r) => setTimeout(r, 0))
        if (abortRef.current !== runId) return
        const buffer = await MusicEngine.renderToBuffer(parsed)
        if (abortRef.current !== runId) return
        const dur = MusicEngine.bufferDuration(buffer) || parsed.totalSec || 0
        updateCell(id, {
          status: "idle",
          output: { kind: "rendered", buffer, parsed, duration: dur },
        })
        playAllRef.current?.rendered.add(id)
        if (play) playback.playCell(id)
      } catch (e) {
        if (abortRef.current !== runId) return
        playback.stopCell(id)
        updateCell(id, {
          status: "idle",
          output: { kind: "error", error: e instanceof Error ? e.message : String(e) },
        })
      } finally {
        if (abortRef.current === runId) {
          abortRef.current = null
          setActiveCellId(null)
          setKernelStatus("idle")
        }
        // The last of a play-all's renders starts the playing
        const pa = playAllRef.current
        if (pa && pa.ids.includes(id) && --pa.pending === 0) {
          const first = pa.ids.find((i) => pa.rendered.has(i))
          if (first) playback.playCell(first)
          else playAllRef.current = null
        }
      }
    },
    [cells, runCounter, updateCell, playback, setEditingId],
  )

  // --- Run queue: array queue with sequential processing ------------------
  const queueRef = React.useRef<{ id: string; play: boolean }[]>([])
  const processingRef = React.useRef(false)
  const skipRef = React.useRef<(() => void) | null>(null) // resolve fn to immediately unblock queue
  const runCellRef = React.useRef(runCell)
  React.useEffect(() => {
    runCellRef.current = runCell
  }, [runCell])

  const processQueue = React.useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    while (queueRef.current.length > 0) {
      const queued = queueRef.current.shift()
      if (!queued) continue
      const { id, play } = queued
      await new Promise<void>((resolve) => {
        skipRef.current = resolve
        runCellRef.current(id, play).then(resolve, resolve)
      })
      skipRef.current = null
    }
    processingRef.current = false
    setKernelStatus("idle")
  }, [])

  const queuedRunCell = React.useCallback(
    (id: string, play = false) => {
      updateCell(id, { status: "waiting", output: null, runCount: null })
      setKernelStatus("busy")
      queueRef.current.push({ id, play })
      processQueue()
    },
    [updateCell, processQueue],
  )

  // The cell's own Run button and Shift+Enter: render it, and leave playing to its player
  const runCellNow = React.useCallback(
    (id: string) => {
      playAllRef.current = null
      queuedRunCell(id)
    },
    [queuedRunCell],
  )

  const interruptCell = React.useCallback(
    (id: string) => {
      const c = cells.find((x) => x.id === id)
      if (!c) return
      if (c.status === "waiting") {
        // Just remove from queue, don't touch anything else
        queueRef.current = queueRef.current.filter((q) => q.id !== id)
        updateCell(id, { status: "idle" })
        if (queueRef.current.length === 0 && !activeCellId) {
          setKernelStatus("idle")
        }
      } else {
        // Running cell — abort and immediately unblock queue
        abortRef.current = null
        setActiveCellId(null)
        updateCell(id, { status: "idle", output: null })
        if (skipRef.current) skipRef.current()
      }
    },
    [updateCell, cells, activeCellId],
  )

  const stopAll = React.useCallback(() => {
    playAllRef.current = null
    // Clear entire queue
    const waiting = [...queueRef.current]
    queueRef.current = []
    waiting.forEach(({ id }) => updateCell(id, { status: "idle" }))
    // Reset any running/rendering cells
    cells.forEach((c) => {
      if (c.status === "running" || c.status === "rendering") {
        updateCell(c.id, { status: "idle", output: null })
      }
    })
    // Abort active cell and unblock queue loop
    abortRef.current = null
    setActiveCellId(null)
    if (skipRef.current) skipRef.current()
    setKernelStatus("idle")
  }, [updateCell, cells])

  const queuedRunAll = React.useCallback(() => {
    playback.stopAll()
    const ids = cells.filter((c) => c.type === "music").map((c) => c.id)
    playAllRef.current = { ids, rendered: new Set<string>(), pending: ids.length }
    for (const id of ids) queuedRunCell(id)
  }, [cells, playback, queuedRunCell])

  // When a cell finishes in a play-all, the next rendered one plays
  const onPlaybackFinished = React.useCallback(
    (id: string) => {
      playback.onPlaybackFinished(id)
      const pa = playAllRef.current
      if (!pa) return
      const list = pa.ids.filter((i) => pa.rendered.has(i))
      const k = list.indexOf(id)
      if (k >= 0 && k + 1 < list.length) playback.playCell(list[k + 1])
      else playAllRef.current = null
    },
    [playback],
  )
  // Pressing play on a cell by hand ends a play-all
  const togglePlayback = React.useCallback(
    (id: string) => {
      playAllRef.current = null
      return playback.togglePlayback(id)
    },
    [playback],
  )

  // A host page's cells render as they open, and wait for Play.
  const renderAll = React.useCallback(() => {
    for (const c of cells) if (c.type === "music") queuedRunCell(c.id)
  }, [cells, queuedRunCell])
  const renderAllRef = React.useRef(renderAll)
  React.useEffect(() => {
    renderAllRef.current = renderAll
  }, [renderAll])
  React.useEffect(() => {
    if (hostRef.current) renderAllRef.current()
  }, [])

  return {
    kernelStatus,
    activeCellId,
    playback,
    runCellNow,
    interruptCell,
    queuedRunAll,
    onPlaybackFinished,
    togglePlayback,
    stopAll,
    renderAll,
  }
}
export type NotebookRuntime = ReturnType<typeof useNotebookRuntime>
