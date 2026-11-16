/* The music-cell language. Top-level statements use newlines; every brace block uses
   commas between entries, with an optional trailing comma. Newlines in braces are layout.
   Typed values: steps, notes, chords, pattern (repeat together), block (play once).
   Kit and note lines use step words, n*w and n*(words). - is the only drum silence;
   notes use - to sustain and _ to stop. A final ... fills the containing block.
   value on bar n [to m] adds a typed value at a position. every takes beats only and
   changes the step from its default quarter beat. Settings and names carry into later
   cells; with and declarations inside blocks stay scoped to those blocks.
   Numeric degrees continue through the mode across octaves; negative degrees count
   downward from the tonic, skipping zero. Interval functions move every note/chord tone
   through that scale. Signed degrees and octave(...) replace apostrophe notation.
   Chord suffixes compose after the entire numeric root: 15sus2add11#5/4.
   Pure (no audio). Public exports for the engine, notebook, tools and editors. */

export { parseCell, type GridBlock, type Output, type Parsed } from "./cell.ts"
export {
  printedItems,
  printedMeaning,
  printLayout,
  printPartText,
  printRowText,
  type PrintOutput,
  type PrintPart,
  type PrintRow,
  type PrintedValue,
  type PrintedItem,
} from "./print.ts"
export { keyName } from "./settings.ts"
export { initialState, type State } from "./state.ts"
export { TPQ, barQuarters, lastCount, timeLabel } from "./time.ts"
export {
  DRUMS,
  INTERVALS,
  KEYWORDS,
  KITS,
  LANES,
  MODES,
  PARTS,
  PITCHED,
  SETTINGS,
  SOUNDS,
  SPLIT,
  SWING,
  TYPES,
  UNITS,
  VARIATIONS,
} from "./vocab.ts"
