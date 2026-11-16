/* The accounts a case starts from. IDs are fixed so runs can be compared. */
import type { AccountState, StateName } from "./types.ts"

const CYCLE = "5b0c7f6e-1d2a-4c3b-8e9f-000000000002"
const SCRATCH = "5b0c7f6e-1d2a-4c3b-8e9f-000000000003"

export const CYCLE_CELL = `set key A
set mode minor

chords pair = 1m7 fourth(1m7)
chords cycle = pair|second(pair, -1)|second(pair, -2)|5dom7 -

play piano: chords cycle`

export const BROKEN_CELL = "play piano: Am F"

export const STATES: Record<StateName, AccountState> = {
  empty: { notebooks: [] },
  cycle: {
    notebooks: [
      {
        id: CYCLE,
        title: "Minor cycle",
        revision: 2,
        cells: [{ id: "cycle-chords", type: "music", source: CYCLE_CELL }],
      },
    ],
    open: { notebookId: CYCLE, cellId: "cycle-chords" },
  },
  broken: {
    notebooks: [
      {
        id: SCRATCH,
        title: "Scratch",
        revision: 1,
        cells: [{ id: "scratch-broken", type: "music", source: BROKEN_CELL }],
      },
    ],
    open: { notebookId: SCRATCH, cellId: "scratch-broken" },
  },
}
