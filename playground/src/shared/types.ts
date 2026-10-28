/* What the playground passes around: cells, what a music cell shows under it, notebooks as
   they're kept, the page's settings, and a page that holds the cells itself. Declared once
   here, so the hooks and the components agree on them. */
import type { Parsed } from "composer-nb/language"
import type { Theme } from "composer-nb/links"
import type { ToneAudioBuffer } from "tone"

export type { Theme }

// A cell as it's kept: music, or text (markdown), and what's written in it
export type CellType = "music" | "text"
export type SavedCell = { type: CellType; source: string }

// What a music cell shows under it once it has run: its mistakes, a note that nothing
// plays, the parse while the audio renders, then the audio
export type CellOutput =
  | { kind: "error"; error: string; lines?: number[]; source?: string }
  | { kind: "info"; message: string }
  | { kind: "rendering"; parsed: Parsed; duration: number }
  | { kind: "rendered"; parsed: Parsed; buffer: ToneAudioBuffer; duration: number }

// Where a cell is in being run: waiting its turn, being read, its audio being rendered
export type CellStatus = "idle" | "waiting" | "running" | "rendering"

// A cell on the page: its id, how many runs it is since the page opened, what it shows,
// and, for a text cell being edited, whether its preview shows beside it
export type NotebookCell = SavedCell & {
  id: string
  runCount: number | null
  output: CellOutput | null
  status: CellStatus
  previewMode?: boolean
}

// A notebook as it's kept on this device. `starters` is the fingerprint of the starter cells
// it was made from, so an unchanged one can be given the current starters.
export type Notebook = {
  id: string
  title: string
  cells: SavedCell[]
  updated: number
  starters?: string
}
// Every notebook on this device, and the one that's open
export type Store = { current: string | null; list: Notebook[] }

// How the page looks: light or dark, the accent everything is tinted with, whether the hits
// are drawn as bricks or as sheet music, and whether the sheet counts the hands' notes
export type DrumView = "bricks" | "sheet"
export type Settings = { theme: Theme; accent: string; drumView: DrumView; sheetCounts: boolean }

// A page that holds the playground's cells itself, as the MCP App does: the cells, the
// source they continue from, its theme, and what hears every cell as it runs
export type Host = {
  cells: SavedCell[]
  after?: string
  theme?: Theme
  onRun?: (cells: SavedCell[]) => void
}

// Whether the page is rendering a cell's audio
export type KernelStatus = "idle" | "busy"

// What a cell's player lets the page do with it
export type Player = {
  play: () => void
  pause: () => void
  stop: () => void
  isPlaying: () => boolean
  getCurrentTime: () => number
}
