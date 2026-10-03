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
}
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
// Keys written with flats, so their numeral chords are spelled with flats too.
const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm"])

export function midiToName(m) {
  const pc = ((m % 12) + 12) % 12
  const oct = Math.floor(m / 12) - 1
  return SHARP_NAMES[pc] + oct
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]
const DEGREE = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 }
const ROMAN_RE = /^([#b]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)([°oø]?)(.*)$/

// "C", "Am", "F#m", "Bb" → { name, root, mode, tonicPc }, or null when it isn't a key.
export function parseKey(str) {
  const m = /^([A-G][#b]?)(m?)$/.exec(String(str || "").trim())
  if (!m) return null
  return {
    name: m[1] + m[2],
    root: m[1],
    mode: m[2] ? "minor" : "major",
    tonicPc: NOTE_TO_PC[m[1]],
  }
}

// Strict check: a numeral plus chord-suffix characters only, so words like "intro" or
// "vibe" aren't mistaken for i and vi chords.
const ROMAN_TOKEN_RE =
  /^[#b]?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)[°oø]?(?:maj|min|sus|add|dim|aug|M|m|b|#|\+|\d)*$/

export function isRoman(token) {
  return ROMAN_TOKEN_RE.test(token.split("/")[0])
}

// Case sets the quality: V is major and v minor; ° (or o) is diminished, ø half-diminished.
function romanToSymbol(main, key) {
  const m = ROMAN_RE.exec(main)
  if (!m) return null
  const [, acc, numeral, mark, rest] = m
  const scale = key.mode === "minor" ? MINOR_SCALE : MAJOR_SCALE
  const shift = acc === "#" ? 1 : acc === "b" ? -1 : 0
  const pc = (key.tonicPc + scale[DEGREE[numeral.toLowerCase()]] + shift + 12) % 12
  const names = acc === "b" || (!acc && FLAT_KEYS.has(key.name)) ? FLAT_NAMES : SHARP_NAMES
  let quality
  if (mark === "ø") quality = "m7b5" + rest.replace(/^7/, "")
  else if (mark) quality = rest.startsWith("7") ? "dim7" + rest.slice(1) : "dim" + rest
  else if (numeral === numeral.toUpperCase() || rest.startsWith("sus")) quality = rest
  else quality = rest.startsWith("maj") ? "mMaj" + rest.slice(3) : "m" + rest
  return names[pc] + quality
}

// A chord token ("Cmaj7", "C/E", "ii7", "bVII") → voicing, or null if it isn't a chord.
export function buildChord(token, key, octave = 3) {
  if (!token) return null
  const [main, bassStr, extra] = token.split("/")
  if (extra !== undefined) return null
  let symbol
  if (ROMAN_RE.test(main)) symbol = romanToSymbol(main, key || parseKey("C"))
  else if (/^[A-G][#b]?/.test(main)) symbol = main
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

  const rootMidi = (octave + 1) * 12 + tonicPc
  const bass = (octave + 1) * 12 + bassPc - 12
  const voicing = ch.intervals.map((iv) => rootMidi + Interval.semitones(iv))
  while (voicing.length > 1 && voicing[voicing.length - 1] - voicing[0] > 24) voicing.pop()

  return {
    input: token,
    label: ch.symbol + (bassStr ? "/" + bassStr : ""),
    rootPc: tonicPc,
    bassMidi: bass,
    notesMidi: voicing,
    noteNames: voicing.map((m) => Note.fromMidi(m) || midiToName(m)),
    bassName: Note.fromMidi(bass) || midiToName(bass),
  }
}

// Transpose a chord's sounding pitches up by `semis` (capo fret). The label is left alone
// so chips and diagrams keep showing the shape you finger, while playback and note names
// reflect the actual pitches.
export function applyCapo(chord, semis) {
  if (!semis) return chord
  chord.notesMidi = chord.notesMidi.map((m) => m + semis)
  chord.bassMidi = chord.bassMidi + semis
  chord.noteNames = chord.notesMidi.map(midiToName)
  chord.bassName = midiToName(chord.bassMidi)
  return chord
}
