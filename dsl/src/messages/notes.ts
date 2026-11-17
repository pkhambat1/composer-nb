/* What the engine says about notes: an instrument's line of them, what isn't one, their
   repeats and layers, and the interval functions that move them. */

const NOTE_HELP =
  "Notes are A to G, with # or b after them and an octave when it's needed (F, F#, Bb, E2), or signed scale degrees (1, b3, 8, -1, -7). Negative degrees count down from the tonic. Lowercase Roman numerals also work"

export const NOTE_MESSAGES = {
  // A note, and what isn't one
  "note.notANote": ({ tok }: { tok: string }) => `"${tok}" isn't a note. ${NOTE_HELP}`,
  "note.notANoteIn": ({ tok, via }: { tok: string; via: string }) =>
    `"${tok}" (in ${via}) isn't a note. ${NOTE_HELP}`,
  "note.touch": ({ run, spaced }: { run: string; spaced: string }) =>
    `"${run}": notes don't touch, so put a space between them: ${spaced}`,
  "note.octaves": ({ tok }: { tok: string }) => `"${tok}": octaves run from 0 to 8`,
  "note.degrees": ({ tok }: { tok: string }) =>
    `"${tok}": degrees are nonzero integers from -128 to 128; positive degrees start at the tonic and negative degrees count down from it`,
  "note.drumSteps": ({ tok, inst }: { tok: string; inst: string }) =>
    `"${tok}" is a drum's steps. On ${inst} a step is a note: ${inst}: notes F---G---`,
  "note.accentPlace": ({ tok }: { tok: string }) =>
    `"${tok}": ^ and ~ go in front of a note: ^F, ~G`,
  "note.capitals": ({ tok, inst }: { tok: string; inst: string }) =>
    `"${tok}": notes are capital letters, A to G: ${inst}: notes F---G---`,
  "note.undefinedAbove": ({ tok }: { tok: string }) =>
    `"${tok}" isn't defined above. Name it first: notes ${tok} = F---G---`,
  "note.isChord": ({ tok, chart }: { tok: string; chart: string }) =>
    `"${tok}" is a chord, and these are notes. For chords, write ${chart}`,
  "note.chordName": ({ tok, inst }: { tok: string; inst: string }) =>
    `"${tok}": chord names don't go on the steps. Chords are written in a chart, ` +
    `where _ leaves a slot silent: ${inst}: chords _ Am _ Am`,
  "note.outsideMidi": ({ tok }: { tok: string | undefined }) =>
    `"${tok}" goes outside playable MIDI notes 0 to 127. Change octave or use octave(value, -1)`,
  "note.outsideMidiPrinted": ({ tok }: { tok: string | undefined }) =>
    `"${tok}" goes outside playable MIDI notes 0 to 127`,
  "octave.apostrophe": () =>
    "Octave apostrophes are no longer supported. Use octave(1) to move up, octave(1, -1) to move down, or a higher degree such as 8 or 15",

  // A line of notes
  "note.lengthWord": () =>
    "Notes use step words and * repeats: 1 7*- holds degree 1 for eight steps; 8*_ is eight silent steps",
  "note.needsWord": () => "A repeat needs a note word or group: 4*1- or 2*(1--- 3---)",
  "note.silence": () => "A silent note step is _. Repeat silence with 8*_ or fill with ..._",
  "note.spaceAfterCall": ({ call }: { call: string }) =>
    `Put a space after ${call}(...); only note holds and rests can touch its closing )`,
  "note.callOpen": ({ call }: { call: string }) =>
    `${call} takes notes with a length of their own; put ... outside the function`,
  "note.repeatCount": () => "A repeat count is an integer of at least 2: 7*- or 2*(1--- 3---)",
  "note.nested": () => "Note repeats can nest at most 32 levels",
  "note.repeatUnclosed": () => "A note repeat's ( is missing its )",
  "note.repeatEmpty": () => "A note repeat's parentheses need at least one word",
  "note.repeatStray": () => "This ) doesn't close a note repeat",
  "note.parens": () => "Parentheses in notes need a repeat count: 2*(1--- 3---)",
  "note.tooLong": ({ max }: { max: number }) => `A note sequence can be at most ${max} bars long`,
  "note.commas": () =>
    "Notes separate words with spaces: 1 7*- 3 7*-. Commas separate brace entries or function arguments",
  "note.fillOne": () => "... takes one note, - to sustain, or _ for silence: ...1, ...-, ..._",
  "note.afterFill": () => "... is the rest of the block, so nothing goes after it",
  "note.spaceBetween": () => "Put a space between note words and repeats: 1 7*- 2*(3--- 5---)",
  "note.repeats": ({ head, value, short }: { head: string; value: string; short: string }) =>
    `${head}${value} repeats ${short}. Write ${head}${short}: a pattern repeats it. Use a block to play a finite sequence once`,
  "note.barLineChords": ({
    problem,
    part,
    text,
  }: {
    problem: string
    part: string
    text: string
  }) => `${problem}. For chords, put chords in front: ${part}: chords ${text}`,
  "note.blockBeside": ({ part }: { part: string }) =>
    `A block is everything ${part} plays, so nothing goes beside it: ${part}: { ... }`,
  "note.splitEvenly": ({ time, slots }: { time: string; slots: number }) =>
    `A ${time} bar can't be split evenly into ${slots}. ` +
    "Use - to hold a note for another slot, e.g. 1 - 3 5, or every for fixed-step timing",
  "note.saysWhich": ({
    part,
    chart,
    text,
    notes,
  }: {
    part: string
    chart: boolean
    text: string
    notes: string
  }) =>
    `${part} takes notes or chords, and says which: ` +
    (chart ? `${part}: chords ${text}` : `${part}: notes ${notes}`),

  // A block of notes and its layers
  "note.layerInstrument": ({ part, text }: { part: string; text: string }) =>
    `A block after ${part}: holds what ${part} plays, one layer a line. ${text} is an instrument's line, which goes in a pattern`,
  "note.layerRuns": ({ hits, length }: { hits: string; length: string }) =>
    `A layer's notes run ${hits} before its ..., and the block is only ${length} long`,

  // Interval functions
  "interval.nested": () => "Music functions can nest at most 32 levels",
  "interval.unknown": ({ name }: { name: string }) =>
    `"${name}" isn't an interval function. Use second(...), third(...), fourth(...), fifth(...), or octave(...)`,
  "interval.unclosed": ({ name }: { name: string }) => `${name}(...) is missing its closing )`,
  "interval.arguments": ({ name }: { name: string }) =>
    `${name} takes a value and an optional integer count: ${name}(phrase, 2)`,
  "interval.needsValue": ({ name }: { name: string }) =>
    `${name} needs notes or chords inside its parentheses: ${name}(1)`,
  "interval.count": ({ name }: { name: string }) =>
    `${name}'s count is an integer from -64 to 64: ${name}(phrase, -1)`,
} as const
