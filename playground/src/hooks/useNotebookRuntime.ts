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

  // Running prepares the output. Playback starts only from the player's Play button.
  const runCell = React.useCallback(
    async (id: string) => {
      const c = cells.find((x) => x.id === id)
      if (!c) return
      if (c.type === "text") {
        setEditingId((e) => (e === id ? null : e))
        return
      }
      hostRef.current?.onRun?.(cells.map(({ type, source }) => ({ type, source })))
      playback.stopCell(id)
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
            output: parsed.prints.length
              ? { kind: "printed", parsed }
              : { kind: "info", message: "Executed" },
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
      }
    },
    [cells, runCounter, updateCell, playback, setEditingId],
  )

  // --- Run queue: array queue with sequential processing ------------------
  const queueRef = React.useRef<string[]>([])
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
      const id = queueRef.current.shift()
      if (!id) continue
      await new Promise<void>((resolve) => {
        skipRef.current = resolve
        runCellRef.current(id).then(resolve, resolve)
      })
      skipRef.current = null
    }
    processingRef.current = false
    setKernelStatus("idle")
  }, [])

  const queuedRunCell = React.useCallback(
    (id: string) => {
      playback.stopCell(id)
      updateCell(id, { status: "waiting", output: null, runCount: null })
      setKernelStatus("busy")
      queueRef.current.push(id)
      processQueue()
    },
    [updateCell, processQueue, playback],
  )

  // The cell's own Run button and Shift+Enter: render it, and leave playing to its player
  const runCellNow = React.useCallback(
    (id: string) => {
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
        queueRef.current = queueRef.current.filter((queuedId) => queuedId !== id)
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
    // Clear entire queue
    const waiting = [...queueRef.current]
    queueRef.current = []
    waiting.forEach((id) => updateCell(id, { status: "idle" }))
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
    for (const id of ids) queuedRunCell(id)
  }, [cells, playback, queuedRunCell])

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
    onPlaybackFinished: playback.onPlaybackFinished,
    togglePlayback: playback.togglePlayback,
    stopAll,
    renderAll,
  }
}
export type NotebookRuntime = ReturnType<typeof useNotebookRuntime>
