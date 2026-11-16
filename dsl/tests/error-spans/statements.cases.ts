// What a statement is and where it goes, found by the cell (cell.ts), the lines in braces
// (lines.ts) and a play's duration (play-duration.ts)
import type { Case } from "./cases.ts"

const GROOVE = "pattern groove = { kick: x--- }"

export const CASES: Case[] = [
  // Braces
  { cell: "pattern groove = ⟦{ }⟧" },
  { cell: "pattern groove = { kick: ⟦{ }⟧ }" },
  { cell: "with key E ⟦{ }⟧" },
  { cell: "play block ⟦{ }⟧" },
  { cell: "play block ⟦{⟧ kick: x---" },
  { cell: "with key E ⟦{⟧\n  play block { piano: chords C }" },
  { cell: "play ⟦{⟧ kick: x--- }" },
  { cell: "print ⟦{ kick: x }⟧" },

  // What goes at the top, and what goes inside braces
  { cell: "play block { ⟦play⟧ groove }", above: GROOVE },
  { cell: "play block { ⟦print⟧(1) }" },
  { cell: "with key E { ⟦set tempo 90⟧ }" },
  { cell: "with key E { ⟦kick: x---⟧ }" },
  { cell: "⟦kick: x---⟧" },
  { cell: "⟦block { kick: x--- }⟧" },
  { cell: "⟦3 bars pattern { kick: x--- }⟧" },
  { cell: "⟦every 1/2 beats { kick: x }⟧" },
  { cell: "⟦fill on bar 2⟧" },
  { cell: "⟦drumsolo⟧" },

  // Names
  { cell: "⟦pattern⟧" },
  { cell: "⟦pattern =⟧ { kick: x }" },
  { cell: "⟦pattern groove⟧ { kick: x--- }" },
  { cell: "⟦block fill⟧ { kick: x--- }" },
  { cell: "play block { ⟦pattern groove⟧ { kick: x } }" },
  { cell: "⟦groove⟧ { kick: x--- }" },
  { cell: "play block { steps ⟦pair⟧ ^-x- }" },
  { cell: "play block { ⟦pattern⟧ }" },

  // play and with
  { cell: "⟦play⟧: groove", above: GROOVE },
  { cell: "⟦play⟧ = groove", above: GROOVE },
  { cell: "⟦play⟧" },
  { cell: "⟦play⟧ for 2 bars" },
  { cell: "⟦with⟧ key E" },
  { cell: "with key E { play block { piano: chords C } } ⟦foo⟧" },

  // Lengths
  { cell: "play ⟦2 bars⟧ block { kick: x--- }" },
  { cell: "play groove ⟦for 2 bars⟧ { kick: x }", above: GROOVE },
  { cell: "play groove ⟦for groovy⟧", above: GROOVE },
  { cell: "play groove ⟦for 2 bars extra⟧", above: GROOVE },
  { cell: "play block { kick: x--- } ⟦2 bars⟧" },
  { cell: "play block { kick: x--- } ⟦for 2000 bars⟧" },
  // A declaration missing its = whose value runs on at a bar line
  { cell: "⟦notes scale scale = 1---2---\n  |3---4---⟧" },
  // A line that starts with a block is marked over what it holds
  { cell: "pattern groove = ⟦{\n  kick: x---,\n  every }1/4 beats piano: notes 1---⟧\n⟦}⟧" },
  { cell: "play block ⟦{ }⟧ ⟦outro⟧" },
  { cell: "play block { kick: x--- } ⟦outro⟧", above: "pattern outro = { snare: x--- }" },
  { cell: "play block {\n  kick: x---\n} ⟦outro⟧", above: "pattern outro = { snare: x--- }" },
  { cell: "pattern groove = { kick: x--- } ⟦4 bars⟧" },
  { cell: "set tempo 20\nset time 8 over 1\n⟦play block { kick: x } for 64 bars⟧" },
  { cell: "play block { ⟦bars⟧ 2 groove }", above: GROOVE },
  { cell: "play block { ⟦bars⟧: 3 }" },

  // Placement
  { cell: "play block { ⟦on bar 2⟧ { crash: x } }" },
  { cell: "play block { crash: x ⟦on bar 2⟧ { kick: x } }" },
  { cell: "play block { ⟦bar⟧ 2 { crash: x } }" },
  { cell: "play block { block { crash: x } ⟦on bar⟧ }" },
  { cell: "play block { block { crash: x } ⟦on bar x⟧ }" },
  { cell: "play block { block { crash: x } ⟦on bar 0⟧ }" },
  { cell: "play block { block { crash: x } ⟦on bar 2 to 99⟧ }" },
  { cell: "play block { block { crash: x } ⟦on bar 3 to 1⟧ }" },
  { cell: "play block { block { crash: x } ⟦on bar 2 foo⟧ }" },
  { cell: "play block { ⟦on bar⟧ 2 }" },

  // A step's pace
  { cell: "play block { every ⟦3 steps⟧ { kick: x } }" },
  { cell: "play block { ⟦every⟧ fast { kick: x } }" },
  { cell: "play block { ⟦every 1/2 beats⟧ }" },
  { cell: "play block { every 1/2 beats ⟦pattern⟧ { kick: x } }" },
  { cell: "play every 1/4 beats { ⟦every 1/4 beats⟧ { kick: x } }" },
  { cell: "play block { every ⟦1/100 beats⟧ { kick: x } }" },

  // Lines that aren't one of the shapes
  { cell: "play block { ⟦|⟧ kick: x }" },
  { cell: "⟦|⟧ kick: x" },
  { cell: "play block { ⟦guitar.electric⟧ muted }" },
  { cell: "play block { piano ⟦bright⟧ }" },
  { cell: "play block { ⟦kick⟧ x--- }" },
  { cell: "⟦kick⟧ x---" },
  { cell: "play block { ⟦chords⟧ Am F }" },
  { cell: "play block { ⟦notes⟧ C---D--- }" },
  { cell: "play block { ⟦tempo⟧ 90 }" },
  { cell: "⟦tempo⟧ 90" },
  { cell: "play block { ⟦tmpo⟧ 90 }" },
  { cell: "play block { ⟦Am F G⟧ }" },
  { cell: "⟦Am F G⟧" },
  { cell: "play block { ⟦C---D---⟧ }" },
  { cell: "play block { ⟦%%⟧ }" },
  { cell: "play block { ⟦tempo⟧: 90 }" },
  { cell: "play block { ⟦kick:⟧ }" },
  { cell: "⟦kick:⟧" },
  { cell: "play block { ⟦kazoo⟧: x--- }" },
  { cell: "play block { kick: ⟦x---⟧ { snare: x } }" },

  // transpose with nothing pitched
  { cell: "set ⟦transpose⟧ 2\nplay block { kick: x--- }" },
  { cell: "with ⟦transpose⟧ 2 { play block { kick: x--- } }" },
]
