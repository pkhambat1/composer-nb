import type { DrumView, Player, Theme } from "../shared/types.ts"
import type { SavedCell } from "../shared/types.ts"

/** Host-facing document data, without audio buffers or render state. */
export type NotebookSnapshot = {
  cells: (SavedCell & { id: string })[]
  selectedId: string | null
  selection: NotebookSelection | null
}
export type NotebookSelection = {
  cellId: string
  kind: "cell" | "source" | "text" | "brick" | "sheet" | "chord"
  label: string
  fromLine?: number
  toLine?: number
  start?: number
  end?: number
  selectedText?: string
}

export type PlayerProps = {
  focusedCellId: string | null
  isPlaying: boolean
  onTogglePlayback: (id: string) => void
  onStopPlayback: (id: string) => void
  onPlaybackFinished: (id: string) => void
  registerPlayer: (id: string, player: Player) => void
  unregisterPlayer: (id: string) => void
  theme: Theme
  accent: string
  drumView: DrumView
  onSetDrumView: (view: DrumView) => void
  sheetCounts: boolean
  onSetSheetCounts: (counts: boolean) => void
}
