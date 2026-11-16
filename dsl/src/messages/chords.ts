/* What the engine says about chords: a chart of them, and what isn't one. */

// A degree or numeral past the key's scale
const pastScale = (mode: string, degrees: number) =>
  `${mode} has ${degrees} degrees per octave, so vii isn't in its first octave. Use ${degrees + 1} for the next tonic`

export const CHORD_MESSAGES = {
  // A chord, and what isn't one
  "chord.unknown": ({ chord }: { chord: string }) => `"${chord}" isn't a chord I know`,
  "chord.upperNumeral": ({ tok, lower, base }: { tok: string; lower: string; base: string }) =>
    `"${tok}": numerals are lowercase, and the mode makes the chord major or minor: ${lower}. To say a chord outright, write its quality after it: ${base}M, ${base}m`,
  "chord.dimNumeral": ({ tok, written }: { tok: string; written: string }) =>
    `"${tok}": a diminished numeral takes dim, as a chord does: ${written} (viidim, viidim7, or viim7b5 for half-diminished)`,
  "chord.pastScale": ({ tok, mode, degrees }: { tok: string; mode: string; degrees: number }) =>
    `"${tok}": ${pastScale(mode, degrees)}`,
  "scale.pastOctave": ({ mode, degrees }: { mode: string; degrees: number }) =>
    pastScale(mode, degrees),
  "chord.isNotes": ({ tok, part, notes }: { tok: string; part: string; notes: string }) =>
    `"${tok}" is notes, and this line says chords. A line of notes says notes in front: ${part}: notes ${notes}`,
  "chord.undefinedAbove": ({ tok }: { tok: string }) =>
    `"${tok}" isn't defined above. Name it first: chords ${tok} = Am F|C G`,

  // A chart
  "chord.firstBar": () => "% repeats the bar before it, but this is the first bar",
  "chord.percentAlone": () =>
    "% stands for a whole bar, so it goes between bar lines on its own: Am F|%",
  "chord.percentInCall": () =>
    "% inside an interval function needs a preceding bar inside that function",
  "chord.callEnds": () => "A chord interval call ends at its closing ): fifth(1)",
  "chord.splitEvenly": ({ time, slots }: { time: string; slots: number }) =>
    `A ${time} bar can't be split evenly into ${slots}. ` +
    "Use - to hold a chord for another slot, e.g. Am - F G",
  "chord.needsChords": ({ part }: { part: string }) =>
    `chords needs the chords after it: ${part}: chords Am F|C G`,
  "chord.startsWithHold": () => "This line starts with - but there's no chord to hold yet",
  "chord.repeats": ({ part, chart, again }: { part: string; chart: string; again: string }) =>
    `${part}: chords ${chart} repeats ${again}. ` +
    `Write ${part}: chords ${again}: a pattern repeats it`,
} as const
