/* Chord names and Roman numerals → voiced chords. Pure (no audio), so the parser, the
   renderer and the tests can all share it. */
import { Chord, Note, Interval } from "tonal"

// A key: its root and mode, where its tonic is (as a pitch class, and in semitones up from C
// as its octave counts it), its scale, and its signature (sharps, negative for flats)
export type Key = {
  name: string
  root: string
  mode: string
  tonicPc: number
  tonicSemis: number
  scale: readonly number[]
  sharps: number
  flats: boolean
}
// A chord as it sounds: its name as written, its root, its bass and notes, and their names.
// On a guitar the audio plays it as a shape on the neck, and marks it so.
export type Voiced = {
  input: string
  label: string
  rootPc: number
  bassMidi: number
  notesMidi: number[]
  noteNames: string[]
  bassName: string
  fromGuitarPosition?: boolean
}

export const NOTE_TO_PC: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
  "B#": 0,
  Fb: 4,
  "E#": 5,
}
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

export function midiToName(m: number, flats = false): string {
  const pc = ((m % 12) + 12) % 12
  const oct = Math.floor(m / 12) - 1
  return (flats ? FLAT_NAMES : SHARP_NAMES)[pc] + oct
}

// Semitones from a root to a degree of a scale, major unless another is given, moved by b
// or # in front: in major 3 is 4 semitones and b3 is 3; in minor 3 is 3. Shared by a chord's
// numeral and a note written as a degree.
export function degreeSemitones(
  degree: number,
  acc = "",
  scale: readonly number[] = MODE_SCALES.major,
): number {
  return scale[degree - 1] + (acc === "#" ? 1 : acc === "b" ? -1 : 0)
}

// The modes a key can be in: semitones above the tonic. major and minor are the two common
// ones, and the other five go by their modal names. A key is its root, and its mode a
// setting of its own (set key E, set mode minor).
export const MODE_SCALES: Record<string, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
}
// How far round the circle of fifths a mode's tonic sits from the major key with the same
// notes: D dorian has C major's notes, two fifths down from D.
const MODE_FIFTHS: Record<string, number> = {
  major: 0,
  lydian: -1,
  mixolydian: 1,
  dorian: 2,
  minor: 3,
  phrygian: 4,
  locrian: 5,
}
const LETTER_FIFTHS: Record<string, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 }
const DEGREE: Record<string, number> = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 }
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const ROMAN_RE = /^([#b]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/

// A root ("E", "F#", "Bb") in a mode ("minor") → the key: its root, mode and scale, the
// sharps in its signature (negative for flats) and whether its black keys are spelt with
// flats. null when the root isn't a note or the mode isn't one.
export function parseKey(root: unknown, mode = "major"): Key | null {
  const m = /^([A-G])([#b]?)$/.exec(String(root || "").trim())
  if (!m || !MODE_SCALES[mode]) return null
  const [, letter, acc] = m
  let sharps = LETTER_FIFTHS[letter] + (acc === "#" ? 7 : acc === "b" ? -7 : 0) - MODE_FIFTHS[mode]
  if (sharps > 7) sharps -= 12
  if (sharps < -7) sharps += 12
  return {
    name: `${letter + acc} ${mode}`,
    root: letter + acc,
    mode,
    tonicPc: NOTE_TO_PC[letter + acc],
    // Semitones from C up to the root as its octave counts it: Cb4 is just below C4, so -1
    tonicSemis: LETTER_PC[letter] + (acc === "#" ? 1 : acc === "b" ? -1 : 0),
    scale: MODE_SCALES[mode],
    sharps,
    flats: sharps < 0,
  }
}

const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"]

// The accidental a key's signature puts on each letter: F → ^ in G major, B → _ in F.
export function keySignature(key: Key): Map<string, string> {
  const marks = new Map<string, string>()
  if (key.sharps > 0) for (const l of SHARP_ORDER.slice(0, key.sharps)) marks.set(l, "^")
  if (key.sharps < 0)
    for (const l of [...SHARP_ORDER].reverse().slice(0, -key.sharps)) marks.set(l, "_")
  return marks
}

// The key as ABC writes it in its K: field: D, Am, D dor.
export function abcKey(key: Key): string {
  const short: Record<string, string> = {
    dorian: " dor",
    phrygian: " phr",
    lydian: " lyd",
    mixolydian: " mix",
    locrian: " loc",
    minor: "m",
  }
  return key.root + (short[key.mode] || "")
}

// Strict check: a numeral plus chord-suffix characters only, so words like "intro" or
// "vibe" aren't mistaken for i and vi chords.
const ROMAN_TOKEN_RE =
  /^[#b]?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(?:6\/9|maj|min|sus|add|dim|aug|M|m|b|#|\+|\d)*$/

export function isRoman(token: string): boolean {
  return ROMAN_TOKEN_RE.test(chordParts(token)[0])
}

// A chord's name split into the chord and its bass, as split("/") would, except that a 6/9
// chord is written as on a lead sheet, C6/9 or Cm6/9, so the / in it is the chord's own:
// C6/9/E is C6/9 over E. More than one bass gives a third part, which no chord has.
export function chordParts(token: string): string[] {
  const at = token.indexOf("6/9")
  const cut = at < 0 ? 0 : at + 3
  const [rest, ...more] = token.slice(cut).split("/")
  return [token.slice(0, cut) + rest, ...more]
}

// The name tonal knows a chord by: it has a minor 6/9 as m69, not m6/9.
export const tonalName = (head: string) => head.replace(/m6\/9$/, "m69")

// A degree, 1 to 7, counted on the key's own scale, its mode's: in D minor 3 is F, and in D
// dorian 6 is B. b and # in front move it a semitone. Shared by a chord's numeral and a note
// written as a degree.
export function degreePc(key: Key, degree: number, acc = ""): number {
  return (key.tonicPc + degreeSemitones(degree, acc, key.scale) + 12) % 12
}

// A degree's name: the letter of its place in the scale, counted from the key's root, raised
// or lowered to its pitch. So #7 in G minor is F#, not Gb, the 3rd of C# major is E#, and
// VII in A minor is G.
const LETTERS = "CDEFGAB"
export function degreeName(key: Key, degree: number, acc = ""): string {
  const letter = LETTERS[(LETTERS.indexOf(key.root[0]) + degree - 1) % 7]
  const alter = ((((degreePc(key, degree, acc) - LETTER_PC[letter]) % 12) + 18) % 12) - 6
  return letter + (alter > 0 ? "#".repeat(alter) : "b".repeat(-alter))
}

// Case sets the third: V is major and v minor. A plain lowercase numeral takes the scale's own
// fifth too, so vii is diminished in major and iv in lydian, without saying so. What follows
// is the quality, written as it is after a chord's root: V7, ii7, IVmaj7, viidim, viim7b5.
// The degree is counted on the key's own scale, so in A minor VII is G and III is C.
function romanToSymbol(main: string, key: Key): string | null {
  const m = ROMAN_RE.exec(main)
  if (!m) return null
  const [, acc, numeral, rest] = m
  const root = degreeName(key, DEGREE[numeral.toLowerCase()] + 1, acc)
  let quality: string
  const degree = DEGREE[numeral.toLowerCase()]
  // The fifth the scale has above this degree: a flat one makes a plain lowercase numeral dim
  const flatFifth =
    !acc && key.scale[(degree + 4) % 7] + (degree + 4 >= 7 ? 12 : 0) - key.scale[degree] === 6
  if (!rest && numeral === numeral.toLowerCase() && flatFifth) quality = "dim"
  else if (/^(dim|m7b5)/.test(rest)) quality = rest
  else if (numeral === numeral.toUpperCase() || rest.startsWith("sus")) quality = rest
  else quality = rest.startsWith("maj") ? "mMaj" + rest.slice(3) : "m" + rest
  return root + quality
}

// A digit, 1 to 7, is the scale's own chord on that degree: in D lydian 4 is G#dim and in D
// dorian it's G. This is how a chart follows the mode, where a numeral's case sets its third
// whatever the mode is. A chord off the scale is a numeral with a b or # in front.
const DEGREE_CHORD_RE = /^[1-7]$/
function degreeChord(main: string, key: Key): { symbol: string; fromKey: number } | null {
  if (!DEGREE_CHORD_RE.test(main)) return null
  const d = Number(main) - 1
  const at = (k: number) => key.scale[(d + k) % 7] + (d + k >= 7 ? 12 : 0) - key.scale[d]
  const [third, fifth] = [at(2), at(4)]
  const quality = third === 3 ? (fifth === 6 ? "dim" : "m") : fifth === 8 ? "aug" : ""
  return {
    symbol: degreeName(key, d + 1) + quality,
    fromKey: degreeSemitones(d + 1, "", key.scale),
  }
}

// A chord token ("Cmaj7", "C/E", "ii7", "bVII", 4) → voicing, or null if it isn't a chord.
export function buildChord(
  token: string,
  key?: Key | null,
  octave = 3,
  degrees = false,
): Voiced | null {
  if (!token) return null
  const [main, bassStr, extra] = chordParts(token)
  if (extra !== undefined) return null
  let symbol: string | null
  let fromKey: number | null = null // a numeral's root, in semitones up from the key's root
  const numeral = ROMAN_RE.exec(main)
  // A digit is only a chord in a chart: anywhere else it's a number
  const digit =
    degrees && DEGREE_CHORD_RE.test(main) ? degreeChord(main, key || parseKey("C")!) : null
  if (digit) {
    key = key || parseKey("C")!
    symbol = digit.symbol
    fromKey = digit.fromKey
  } else if (numeral) {
    key = key || parseKey("C")!
    symbol = romanToSymbol(main, key)
    fromKey = degreeSemitones(DEGREE[numeral[2].toLowerCase()] + 1, numeral[1], key.scale)
  } else if (/^[A-G][#b]?/.test(main)) symbol = main
  else return null
  if (!symbol) return null
  // A 6/9 has one spelling, 6/9 or m6/9, never 69, 6add9 or maj6/9, which tonal also reads
  const quality = symbol.replace(/^[A-G][#b]*/, "")
  const sixNine = /^m?6\/9$/.test(quality)
  if (/69|6add9/.test(quality) || (quality.includes("6/9") && !sixNine)) return null

  const ch = Chord.get(tonalName(symbol.replace(/sus(?![24])/, "sus4")))
  if (ch.empty || !ch.intervals.length || !ch.tonic) return null
  const tonicPc = Note.chroma(ch.tonic)
  if (tonicPc == null || isNaN(tonicPc)) return null

  let bassPc = tonicPc
  if (bassStr !== undefined) {
    if (!/^[A-G][#b]?$/.test(bassStr)) return null
    bassPc = Note.chroma(bassStr)
  }

  // A numeral's root counts up from the key's root in the octave, as a degree does, so a
  // progression keeps its shape in every key: in E, I vi IV V is E3 C#4 A3 B3, as in C it's
  // C3 A3 F3 G3. A symbol's root is in the octave counted from C. The bass is an octave
  // below the root, or a bass note counted up from an octave below the key's root or C.
  const rootMidi =
    fromKey === null ? (octave + 1) * 12 + tonicPc : (octave + 1) * 12 + key!.tonicSemis + fromKey
  let bass = rootMidi - 12
  if (bassStr !== undefined) {
    bass =
      fromKey === null
        ? octave * 12 + bassPc
        : octave * 12 + key!.tonicSemis + ((bassPc - key!.tonicPc + 12) % 12)
  }
  const voicing = ch.intervals.map((iv) => rootMidi + Interval.semitones(iv))
  // The notes are spelt from the symbol, as a musician would: A C# E, not A Db E. B# and Cb
  // sit across an octave number from the pitch they sound (B#2 is C3), so the octave counts
  // from the tonic's own spelling.
  let tonicOctave = octave
  while (Note.midi(ch.tonic + tonicOctave)! > rootMidi) tonicOctave--
  while (Note.midi(ch.tonic + tonicOctave)! < rootMidi) tonicOctave++
  const names = ch.intervals.map((iv) => Note.transpose(ch.tonic! + tonicOctave, iv))
  while (voicing.length > 1 && voicing[voicing.length - 1] - voicing[0] > 24) {
    voicing.pop()
    names.pop()
  }

  return {
    input: token,
    label: (sixNine ? symbol : ch.symbol) + (bassStr ? "/" + bassStr : ""),
    rootPc: tonicPc,
    bassMidi: bass,
    notesMidi: voicing,
    noteNames: names.map((n, i) => (Note.midi(n) === voicing[i] ? n : midiToName(voicing[i]))),
    bassName: spellLike({ noteNames: [bassStr || ch.tonic] }, bass),
  }
}

// A midi number named the way `chord` spells its notes: C# in A, Db in Bbm. For a note
// the chord doesn't have, the sharp name.
export function spellLike(chord: { noteNames: string[] }, midi: number): string {
  const pc = ((midi % 12) + 12) % 12
  const name = chord.noteNames
    .map((n) => n.replace(/-?\d+$/, ""))
    .find((n) => Note.chroma(n) === pc)
  if (!name) return midiToName(midi)
  const octave = Math.floor(midi / 12) - 1
  return name + (name === "B#" ? octave - 1 : name === "Cb" ? octave + 1 : octave)
}

// Moves a chord's sounding pitches by `semis`, up or down (set transpose). The label is left
// alone, so the chart, the chips and a guitar's diagrams keep the chord as written, the shape
// you finger, while playback and note names are the pitches that sound.
export function applyTranspose(chord: Voiced, semis: number): Voiced {
  if (!semis) return chord
  chord.notesMidi = chord.notesMidi.map((m) => m + semis)
  chord.bassMidi = chord.bassMidi + semis
  chord.noteNames = chord.notesMidi.map((m) => midiToName(m))
  chord.bassName = midiToName(chord.bassMidi)
  return chord
}
