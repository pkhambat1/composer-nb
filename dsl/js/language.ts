/* The music-cell language. A cell is a script, read top to bottom. Every line starts by
   saying what it is:
     set tempo 90             a setting: set, then the setting and its value (set time
                              7 over 8, set key D, set mode dorian), from its line to the
                              end of the cell and into later cells. Only at the top.
     with octave 2 { }        settings for a block only, restored at its }: with key E,
                              mode minor { ... }. At the top it holds statements; inside a
                              play or a pattern it is a block, played with those settings.
     steps pair = ^-x-        a name, with its type in front. There are four types:
     notes riff = E---F# E-E--  steps (a drum's hits), notes, chords, and pattern (lines
     chords verse = Am E7|G D   in braces that play together). A name only ever holds
     pattern groove = { }       its type, and only goes where that type goes.
     kick: x--x---            inside braces, an instrument and what it plays. The colon
     guitar: E---F# E-E--     only ever means this. A drum takes steps (or beats: 1 2& 3).
     piano: chords Am F|C G   A pitched instrument takes notes, drawn on the same steps
                              with the note where a drum has its x (two notes never
                              touch: F# E), or a chart of chords with chords in front.
                              A note is a letter (E2) or a degree of the key, counted
                              on the major scale of its root (1 2 b3, 1' an octave up).
                              Lines play together, so two drums on
                              one step is two lines. Each instrument has one line in a
                              block; to layer it, its line takes a block of its own.
     play { }                 plays what's after it, a pattern or one line, and gives one
                              output with a player and a drum grid. Nothing plays unless
                              it's inside a play.
     bar 2 { }                what plays in bar 2 of what it's in, and nowhere else. One
                              line needs no braces (bar 2 crash: 1), and bar 3 to 4 { }
                              takes a run of bars.
     every 3 steps { }        what plays at that pace: inside, one step lasts 3 steps. A step
                              is a 16th note otherwise. every 1/3 beats { } is triplets.
   A pattern is a loop: everything in it repeats until the pattern ends, and without a
   length it lasts until its lines line up again. A play is a timeline: its own lines play
   once, and a pattern on a line of its own repeats until the play ends. Braces hold what
   plays together and brackets what plays in order: (intro { snare: ---- dddd } 2 bars verse)
   plays them one after another, and two things on one line outside brackets are a
   mistake. A length goes in front of what it measures,
   and a pattern given a length repeats for that long: pattern groove = 3 bars {,
   play 6 bars groove. Anything that repeats has to fit what it's in a whole number of
   times, and a value written as the same figure twice is a mistake (x-x- is x-), since
   the pattern repeats it. A line that starts with | continues the line above.
   On a drum's line a length measures rest or steps, in steps, beats or bars, and on a
   pitched instrument's it holds one note; commas separate the line's parts:
   2 beats rest, dd, 1 beats rest · 3 beats C2, 1 beats rest. The length ... is
   what's left of the block the line is in: -xx, ...rest plays those hits once each time
   through and then nothing, -xx, ...x- plays them and then x- to the end, and either
   way the line has no length of its own, so the other lines decide how long the block
   is. Lengths are always
   plural (1 bars), so bars only ever says how long and bar only ever says which.
   Every number is arithmetic: (1+2) bars groove, set tempo 60*2. So * and / only ever do
   arithmetic, and a time is two numbers (7 over 8), not a fraction.
   { } is a block: what's in it evaluates to one value, played together. Usually that's a
   pattern; after a drum's colon it's that drum's steps, one layer a line, which repeat
   until they line up again, and after a pitched instrument's colon it's what that
   instrument plays at once. In a block, where two lines hit the same drum at the same
   moment, the lower line wins, and a rest never does.
   What's named inside braces stays inside, and a with's settings stay inside its block.
   // starts a comment. Blank lines and indentation mean nothing. Settings set at the top,
   and names, carry on into later cells.
   Pure (no audio), so the notebook can also use it to pass state from cell to cell.

   This module is the language's public face: parseCell (cell.ts) and the words, times and
   state that code outside the engine imports from here. */

export { parseCell, type GridBlock, type Output, type Parsed } from "./cell.ts"
export { keyName } from "./settings.ts"
export { initialState, type State } from "./state.ts"
export { TPQ, barQuarters, lastCount, timeLabel } from "./time.ts"
export {
  DRUMS,
  KEYWORDS,
  KITS,
  LANES,
  MODES,
  PARTS,
  PITCHED,
  SETTINGS,
  SOUNDS,
  SPLIT,
  TYPES,
  UNITS,
  VARIATIONS,
} from "./vocab.ts"
