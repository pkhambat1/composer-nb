/* What the eval's parts pass to each other. A run is one case played once: the host
   (headless Claude Code with the plugin) is given the prompt, calls the test server's
   tools, and leaves the account's notebooks changed or not. The graders read only what
   is here: the notebooks before and after, and the tool calls. */
import type { NotebookDocument } from "../src/notebook-document.ts"

export type StateName = "empty" | "cycle" | "broken"

/** An account a case starts from: its notebooks, and the cell open in the widget */
export type AccountState = {
  notebooks: NotebookDocument[]
  open?: { notebookId: string; cellId: string }
}

/** One tool call and what came back. A server tool's name has no mcp__ prefix
    (add_music_cell); the host's own tools keep theirs (Skill, ToolSearch). */
export type Call = {
  name: string
  input: Record<string, unknown>
  result: string
  isError: boolean
}

export type Run = {
  before: NotebookDocument[]
  after: NotebookDocument[]
  calls: Call[]
  /** The assistant's last message */
  reply: string
}

/** What the account should look like after the run:
    new: one new notebook holding the music · append: one cell added to the open notebook
    edit: the open cell changed in place · empty-cell: one empty cell added to the open notebook
    none: nothing saved or changed */
export type Writes = "new" | "append" | "edit" | "empty-cell" | "none"

export type CaseBase = {
  id: string
  group: "harmony" | "literal" | "drums" | "workflow"
  state: StateName
  /** derive: built from a seed and the language's functions · literal: the user named the
      chords or notes · null: not a pitched-writing case */
  harmony: "derive" | "literal" | null
  writes: Writes
  prompt: string
}

/** Metric id → score. Yes/no metrics are 1 or 0; a metric that doesn't apply to the case
    is left out. */
export type Grade = {
  scores: Record<string, number>
  /** Metric id → why it failed, for whoever reads the transcript */
  explanation: Record<string, string>
  perf: {
    tool_calls: number
    failed_writes: number
    dsl_errors: number
    redundant_calls: number
    lookups: number
    tool_errors: number
  }
}

/** The report's columns (.claude/hillclimb/<flow>/_state.json). pass is the headline. */
export const METRICS = [
  { id: "pass", label: "pass", kind: "binary" },
  { id: "saved", label: "saved", kind: "binary" },
  { id: "fits", label: "fits", kind: "binary" },
  { id: "harmony", label: "harmony", kind: "binary" },
  { id: "first_try", label: "first try", kind: "binary" },
  { id: "typed_ratio", label: "typed ratio", kind: "float", scale: 1, better: "lower" },
] as const

export const PERF_FIELDS = [
  { id: "tool_calls", label: "tool calls" },
  { id: "failed_writes", label: "failed writes" },
  { id: "dsl_errors", label: "DSL errors" },
  { id: "redundant_calls", label: "redundant" },
  { id: "lookups", label: "lookups" },
  { id: "tool_errors", label: "tool errors" },
  { id: "latency_s", label: "latency", unit: "s" },
  { id: "cost_usd", label: "cost", unit: "$" },
] as const

/** A run fails when more than this many writes were refused for language errors */
export const MAX_FAILED_WRITES = 1
