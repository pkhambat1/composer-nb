// How braces and commas are put together, found by the parser
import type { Case } from "./cases.ts"

export const CASES: Case[] = [
  { cell: "play block { kick: x--- ⟦snare:⟧ ----x--- }" },
  { cell: "play block { kick: x---⟦;⟧ snare: ----x--- }" },
  { cell: "set tempo 90\n⟦}⟧" },
]
