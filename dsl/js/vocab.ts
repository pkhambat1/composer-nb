/* Every word the language knows, listed once: the types, the kit pieces and instruments,
   the settings and what they take. Each list is a value the engine reads and, through
   `as const`, a type the compiler checks, so a misspelt "stpes" is a compile error. The
   highlighter, the Python completer (dsl/python/composer_nb/completer.py) and the docs
   site's grammar (docs/languages/composer-nb.json) keep copies; tests/js/vocab.test.js and
   tests/python/test_completer.py fail when a copy drifts from this file. */

// The types a name can have. Its type goes in front of it: steps pair = ^-x-
export const TYPES = ["steps", "notes", "chords", "pattern"] as const
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
  swing: "on",
  key: "E",
  mode: "minor",
  transpose: "2",
  octave: "3",
  kit: "rock",
}
export const KITS = ["rock", "synth"] as const
// Swing is on or off. On, the off-beat eighths fall late, as a triplet's third note does
export const SWING = ["on", "off"] as const
// What a mode is: its scale (semitones above the tonic), how far round the circle of fifths
// its tonic sits from the major key with the same notes (D dorian has C major's notes, two
// fifths down from D), how ABC writes it after the key's root, whether the sheet gives it a
// minor signature, and, if its degrees skip a letter, the letter each is spelt on. Major and
// minor have one name each, so there is no ionian or aeolian. Harmonic and melodic minor take
// natural minor's signature, and whole tone major's, with their other notes as accidentals,
// since none of the three is a key signature's scale. Whole tone has six degrees. A mode is
// one entry here: the settings, the sheet, the MIDI and the completer's list follow from it.
export type ModeInfo = {
  scale: readonly number[]
  fifths: number
  abc: string
  minor?: true
  letters?: readonly number[]
}
export const MODE_TABLE = {
  major: { scale: [0, 2, 4, 5, 7, 9, 11], fifths: 0, abc: "" },
  minor: { scale: [0, 2, 3, 5, 7, 8, 10], fifths: 3, abc: "m", minor: true },
  dorian: { scale: [0, 2, 3, 5, 7, 9, 10], fifths: 2, abc: " dor" },
  phrygian: { scale: [0, 1, 3, 5, 7, 8, 10], fifths: 4, abc: " phr" },
  lydian: { scale: [0, 2, 4, 6, 7, 9, 11], fifths: -1, abc: " lyd" },
  mixolydian: { scale: [0, 2, 4, 5, 7, 9, 10], fifths: 1, abc: " mix" },
  locrian: { scale: [0, 1, 3, 5, 6, 8, 10], fifths: 5, abc: " loc" },
  harmonicMinor: { scale: [0, 2, 3, 5, 7, 8, 11], fifths: 3, abc: "m", minor: true },
  melodicMinor: { scale: [0, 2, 3, 5, 7, 9, 11], fifths: 3, abc: "m", minor: true },
  // D E F# G# A# C: the sixth is spelt as a seventh
  wholeTone: {
    scale: [0, 2, 4, 6, 8, 10],
    fifths: 0,
    abc: "",
    letters: [0, 1, 2, 3, 4, 6],
  },
} as const satisfies Record<string, ModeInfo>
// The modes a key can be in, set on their own: set key D, set mode dorian
export const MODES = Object.keys(MODE_TABLE) as (keyof typeof MODE_TABLE)[]
// The mode a word names: the mode itself, or its name all in lowercase (harmonicminor), for now
export const modeNamed = (word: string) => MODES.find((m) => m === word || m.toLowerCase() === word)
// Instruments with more than one sound. Naming the instrument and a sound is a setting,
// like kit: set guitar.electric muted. The first sound is the one it has until then.
export const SOUNDS: Readonly<Partial<Record<Pitched, readonly string[]>>> = {
  "guitar.electric": ["clean", "muted"],
}
// The sounds an instrument can be set to, if it has more than one
export const soundsOf = (name: string) =>
  (SOUNDS as Record<string, readonly string[] | undefined>)[name]

// Whether a word is one of a list's, for any word: a list typed by its words only takes those
export const among = (list: readonly string[], word: string) => list.includes(word)

// What steps can be measured in. Always plural, whatever the number.
export const UNITS = ["steps", "beats", "bars"] as const
