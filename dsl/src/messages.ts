/* Every message the engine says when a cell is wrong, by code. Each message is written here
   once, with what it needs to say passed in, so the wording of a whole area can be read and
   changed in one place, and tsc checks that a code exists and gets what it needs. The
   messages are written by area in messages/, and merged into one map here. */
import { BLOCK_MESSAGES } from "./messages/blocks.ts"
import { CHORD_MESSAGES } from "./messages/chords.ts"
import { LENGTH_MESSAGES } from "./messages/lengths.ts"
import { LINE_MESSAGES } from "./messages/lines.ts"
import { NAME_MESSAGES } from "./messages/names.ts"
import { NOTE_MESSAGES } from "./messages/notes.ts"
import { SETTING_MESSAGES } from "./messages/settings.ts"
import { STEP_MESSAGES } from "./messages/steps.ts"
import { SYNTAX_MESSAGES } from "./messages/syntax.ts"

export const MESSAGES = {
  ...SETTING_MESSAGES,
  ...SYNTAX_MESSAGES,
  ...NAME_MESSAGES,
  ...LINE_MESSAGES,
  ...BLOCK_MESSAGES,
  ...LENGTH_MESSAGES,
  ...STEP_MESSAGES,
  ...NOTE_MESSAGES,
  ...CHORD_MESSAGES,
} as const
