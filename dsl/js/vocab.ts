/* Every word the language knows, listed once: the types, the kit pieces and instruments,
   the settings and what they take. Each list is a value the engine reads and, through
   `as const`, a type the compiler checks, so a misspelt "stpes" is a compile error. The
   highlighter, the Python completer (dsl/python/composer_nb/completer.py) and the docs
   site's grammar (docs/languages/composer-nb.json) keep copies; tests/js/vocab.test.js and
   tests/python/test_completer.py fail when a copy drifts from this file. */

// The types a name can have. Its type goes in front of it: steps pair = ^-x-
export const TYPES = ["steps", "sticking", "notes", "chords", "pattern"] as const
export type Type = (typeof TYPES)[number]

// Words with a meaning of their own, which can't be names
export const KEYWORDS: readonly string[] = [
  ...TYPES,
  "play",
  "set",
  "with",
  "of",
  "bars",
  "beats",
  "bar",
  "to",
  "every",
  "rest",
  "over",
  "in",
]

export const DRUMS = ["crash", "ride", "hat", "tom", "snare", "kick"] as const
export type Drum = (typeof DRUMS)[number]
// A drum's other sounds are lines of their own, written drum.variation (ride.bell).
// snare.ghost plays the snare's ghost notes, so they can go under its main line.
export const VARIATIONS: Readonly<Partial<Record<Drum, readonly string[]>>> = {
  ride: ["bell"],
  hat: ["open", "pedal"],
  tom: ["high", "low", "floor"],
  snare: ["ghost", "rim", "cross"],
}
// Drums that are only their variations, with no line of their own: tom is three drums.
export const SPLIT: readonly Drum[] = ["tom"]
// Every drum line name, in the order the drum grid draws them.
export const LANES: readonly string[] = DRUMS.flatMap((d) => [
  ...(SPLIT.includes(d) ? [] : [d]),
  ...(VARIATIONS[d] || []).map((v) => `${d}.${v}`),
])
// Instruments that play notes and chords, each on a line of its own like a drum. A second
// sound is written the way a drum's is: guitar.electric.
export const PITCHED = [
  "guitar",
  "guitar.electric",
  "piano",
  "piano.electric",
  "organ",
  "pad",
  "bass",
] as const
export type Pitched = (typeof PITCHED)[number]
export const PARTS: readonly string[] = [...PITCHED, ...LANES]

export const SETTINGS = [
  "time",
  "tempo",
  "swing",
  "key",
  "mode",
  "transpose",
  "octave",
  "kit",
] as const
export type Setting = (typeof SETTINGS)[number]
// A value each setting takes, for an error that shows one: set tempo 90
export const SETTING_EXAMPLE: Readonly<Record<Setting, string>> = {
  time: "7 over 8",
  tempo: "90",
  swing: "60",
  key: "E",
  mode: "minor",
  transpose: "2",
  octave: "3",
  kit: "rock",
}
export const KITS = ["rock", "synth"] as const
// The modes a key can be in, set on their own: set key D, set mode dorian. Major and minor
// have one name each.
export const MODES = [
  "major",
  "minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "locrian",
] as const
// Instruments with more than one sound. Naming the instrument and a sound is a setting,
// like kit: set guitar.electric muted. The first sound is the one it has until then.
export const SOUNDS: Readonly<Partial<Record<Pitched, readonly string[]>>> = {
  "guitar.electric": ["clean", "muted"],
}

// What steps can be measured in. Always plural, whatever the number.
export const UNITS = ["steps", "beats", "bars"] as const
