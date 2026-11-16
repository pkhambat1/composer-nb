// Mistakes the syntax highlighter used to paint on its own, now reported by the engine
import type { Case } from "./cases.ts"

export const CASES: Case[] = [
  // Braces say their type
  { cell: "play ⟦{⟧ kick: x--- }" },
  { cell: "play (⟦{⟧ kick: x--- })" },
  { cell: "play block {\n  ⟦{⟧ kick: x--- }\n}" },
  { cell: "play block {\n  4 bars ⟦{⟧ kick: x--- }\n}" },
  { cell: "play (\n  ⟦{⟧ kick: x--- }\n)" },
  // A notes line holds step words and repeats
  { cell: "play piano: notes 2 ⟦beats⟧ 1" },
  { cell: "play piano: notes ⟦rest⟧" },
  { cell: "play piano: notes 1⟦,⟧ 3" },
  { cell: "play piano: notes ⟦(⟧1 3)" },
  { cell: "play piano: notes ⟦-2⟧*1" },
  { cell: "play piano: notes ⟦2.5⟧*1" },
  { cell: "play piano: notes ⟦foo⟧*1" },
  // of is retired
  { cell: "notes 5 ⟦of⟧ 5" },
  { cell: "chords 5 ⟦of⟧ 5" },
  { cell: "print(chords fifth(5 ⟦of⟧ 5))" },
  // A kit line holds step words and repeats
  { cell: "play block { kick: ⟦rest⟧ }" },
  { cell: "play block { kick: ⟦2⟧ 4 }" },
  { cell: "play block { kick: 2 ⟦beats⟧ x- }" },
  { cell: "play block { kick: x-, ⟦--⟧ }" },
  { cell: "play block { kick: ...⟦rest⟧ }" },
  { cell: "play block { kick: ⟦1⟧*x- }" },
  { cell: "play block { kick: ⟦(⟧x- --^) }" },
  // Placement follows its value, and every counts beats
  { cell: "play block { ⟦bar⟧ 2 { kick: x } }" },
  { cell: "play every ⟦2 steps⟧ { kick: x }" },
]
