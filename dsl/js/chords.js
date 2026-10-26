/* Chord names and Roman numerals → voiced chords. Pure (no audio), so the parser, the
   renderer and the tests can all share it. */
import { Chord, Note, Interval } from "tonal"

export const NOTE_TO_PC = {
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

export function midiToName(m, flats = false) {
  const pc = ((m % 12) + 12) % 12
  const oct = Math.floor(m / 12) - 1
  return (flats ? FLAT_NAMES : SHARP_NAMES)[pc] + oct
}

// Semitones from a root to a degree of its major scale, moved by b or # in front: 3 is 4
// semitones, b3 is 3. Shared by a chord's numeral and a note written as a degree.
export function degreeSemitones(degree, acc = "") {
  return MODE_SCALES.major[degree - 1] + (acc === "#" ? 1 : acc === "b" ? -1 : 0)
}

// The scales a key can be in: semitones above the tonic. A major key is written C and a
// minor one Am; the modes are written by name, D dorian, and ionian and aeolian are the
// modal names of major and minor.
export const MODE_SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
}
// How far round the circle of fifths a mode's tonic sits from the major key with the same
// notes: D dorian has C major's notes, two fifths down from D.
const MODE_FIFTHS = { major: 0, ionian: 0, lydian: -1, mixolydian: 1, dorian: 2, minor: 3, aeolian: 3, phrygian: 4, locrian: 5 }
const LETTER_FIFTHS = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 }
const DEGREE = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 }
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const ROMAN_RE = /^([#b]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/

// "C", "Am", "F#m", "Bb", "D dorian" → the key: its root, mode and scale, the sharps in its
// signature (negative for flats) and whether its black keys are spelt with flats. null when
// it isn't a key.
export function parseKey(str) {
  const m = /^([A-G])([#b]?)(?:(m)|\s+([a-z]+))?$/.exec(String(str || "").trim())
  if (!m) return null
  const [, letter, acc, minor, word] = m
  const mode = minor ? "minor" : word || "major"
  if (!MODE_SCALES[mode] || word === "major" || word === "minor") return null
  const root = letter + acc
  let sharps = LETTER_FIFTHS[letter] + (acc === "#" ? 7 : acc === "b" ? -7 : 0) - MODE_FIFTHS[mode]
  if (sharps > 7) sharps -= 12
  if (sharps < -7) sharps += 12
  return {
    name: root + (minor ? "m" : word ? " " + word : ""),
    root,
    mode,
    tonicPc: NOTE_TO_PC[root],
    // Semitones from C up to the root as its octave counts it: Cb4 is just below C4, so -1
    tonicSemis: LETTER_PC[letter] + (acc === "#" ? 1 : acc === "b" ? -1 : 0),
    scale: MODE_SCALES[mode],
    sharps,
    flats: sharps < 0,
  }
}

const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"]

// The accidental a key's signature puts on each letter: F → ^ in G major, B → _ in F.
export function keySignature(key) {
  const marks = new Map()
  if (key.sharps > 0) for (const l of SHARP_ORDER.slice(0, key.sharps)) marks.set(l, "^")
  if (key.sharps < 0) for (const l of [...SHARP_ORDER].reverse().slice(0, -key.sharps)) marks.set(l, "_")
  return marks
}

// The key as ABC writes it in its K: field: D, Am, D dor.
export function abcKey(key) {
  const short = { dorian: " dor", phrygian: " phr", lydian: " lyd", mixolydian: " mix", locrian: " loc", minor: "m", aeolian: "m" }
  return key.root + (short[key.mode] || "")
}

// Strict check: a numeral plus chord-suffix characters only, so words like "intro" or
// "vibe" aren't mistaken for i and vi chords.
const ROMAN_TOKEN_RE =
  /^[#b]?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(?:maj|min|sus|add|dim|aug|M|m|b|#|\+|\d)*$/

export function isRoman(token) {
  return ROMAN_TOKEN_RE.test(token.split("/")[0])
}

// A degree, 1 to 7, counted on the major scale of the key's root whatever the key's mode,
// which is how a scale is described: natural minor is 1 2 b3 4 5 b6 b7. b and # in front
// move it a semitone. Shared by a chord's numeral and a note written as a degree.
export function degreePc(key, degree, acc = "") {
  return (key.tonicPc + degreeSemitones(degree, acc) + 12) % 12
}

// A degree's name: the letter of its place in the scale, counted from the key's root, raised
// or lowered to its pitch. So the 7th of G minor is F#, not Gb, the 3rd of C# is E#, and
// bVII in A is G.
const LETTERS = "CDEFGAB"
export function degreeName(key, degree, acc = "") {
  const letter = LETTERS[(LETTERS.indexOf(key.root[0]) + degree - 1) % 7]
  const alter = ((((degreePc(key, degree, acc) - LETTER_PC[letter]) % 12) + 18) % 12) - 6
  return letter + (alter > 0 ? "#".repeat(alter) : "b".repeat(-alter))
}

// Case sets the third: V is major and v minor. What follows is the quality, written as it
// is after a chord's root: V7, ii7, IVmaj7, viidim, viidim7, viim7b5. The degree is counted
// on the major scale of the root, so bVII in Am is G and III is C#.
function romanToSymbol(main, key) {
  const m = ROMAN_RE.exec(main)
  if (!m) return null
  const [, acc, numeral, rest] = m
  const root = degreeName(key, DEGREE[numeral.toLowerCase()] + 1, acc)
  let quality
  if (/^(dim|m7b5)/.test(rest)) quality = rest
  else if (numeral === numeral.toUpperCase() || rest.startsWith("sus")) quality = rest
  else quality = rest.startsWith("maj") ? "mMaj" + rest.slice(3) : "m" + rest
  return root + quality
}

// A chord token ("Cmaj7", "C/E", "ii7", "bVII") → voicing, or null if it isn't a chord.
export function buildChord(token, key, octave = 3) {
  if (!token) return null
  const [main, bassStr, extra] = token.split("/")
  if (extra !== undefined) return null
  let symbol
  let fromKey = null // a numeral's root, in semitones up from the key's root
  const numeral = ROMAN_RE.exec(main)
  if (numeral) {
    key = key || parseKey("C")
    symbol = romanToSymbol(main, key)
    fromKey = degreeSemitones(DEGREE[numeral[2].toLowerCase()] + 1, numeral[1])
  } else if (/^[A-G][#b]?/.test(main)) symbol = main
  else return null

  const ch = Chord.get(symbol.replace(/sus(?![24])/, "sus4"))
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
  const rootMidi = fromKey === null ? (octave + 1) * 12 + tonicPc : (octave + 1) * 12 + key.tonicSemis + fromKey
  let bass = rootMidi - 12
  if (bassStr !== undefined) {
    bass = fromKey === null ? octave * 12 + bassPc : octave * 12 + key.tonicSemis + ((bassPc - key.tonicPc + 12) % 12)
  }
  const voicing = ch.intervals.map((iv) => rootMidi + Interval.semitones(iv))
  // The notes are spelt from the symbol, as a musician would: A C# E, not A Db E. B# and Cb
  // sit across an octave number from the pitch they sound (B#2 is C3), so the octave counts
  // from the tonic's own spelling.
  let tonicOctave = octave
  while (Note.midi(ch.tonic + tonicOctave) > rootMidi) tonicOctave--
  while (Note.midi(ch.tonic + tonicOctave) < rootMidi) tonicOctave++
  const names = ch.intervals.map((iv) => Note.transpose(ch.tonic + tonicOctave, iv))
  while (voicing.length > 1 && voicing[voicing.length - 1] - voicing[0] > 24) {
    voicing.pop()
    names.pop()
  }

  return {
    input: token,
    label: ch.symbol + (bassStr ? "/" + bassStr : ""),
    rootPc: tonicPc,
    bassMidi: bass,
    notesMidi: voicing,
    noteNames: names.map((n, i) => (Note.midi(n) === voicing[i] ? n : midiToName(voicing[i]))),
    bassName: spellLike({ noteNames: [bassStr || ch.tonic] }, bass),
  }
}

// A midi number named the way `chord` spells its notes: C# in A, Db in Bbm. For a note
// the chord doesn't have, the sharp name.
export function spellLike(chord, midi) {
  const pc = ((midi % 12) + 12) % 12
  const name = chord.noteNames.map((n) => n.replace(/-?\d+$/, "")).find((n) => Note.chroma(n) === pc)
  if (!name) return midiToName(midi)
  const octave = Math.floor(midi / 12) - 1
  return name + (name === "B#" ? octave - 1 : name === "Cb" ? octave + 1 : octave)
}

// Moves a chord's sounding pitches by `semis`, up or down (set transpose). The label is left
// alone, so the chart, the chips and a guitar's diagrams keep the chord as written, the shape
// you finger, while playback and note names are the pitches that sound.
export function applyTranspose(chord, semis) {
  if (!semis) return chord
  chord.notesMidi = chord.notesMidi.map((m) => m + semis)
  chord.bassMidi = chord.bassMidi + semis
  chord.noteNames = chord.notesMidi.map((m) => midiToName(m))
  chord.bassName = midiToName(chord.bassMidi)
  return chord
}
