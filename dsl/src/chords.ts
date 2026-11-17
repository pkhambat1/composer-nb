/* Chord names and Roman numerals → voiced chords. Pure (no audio), so the parser, the
   renderer and the tests can all share it. */
import { Chord, ChordType, Note, Interval } from "tonal"
import type { State } from "./state.ts"
import { MODE_TABLE, type ModeInfo } from "./vocab.ts"

const modeInfo = (mode: string): ModeInfo | undefined =>
  (MODE_TABLE as Record<string, ModeInfo>)[mode]

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
// A chord as it sounds: its name as written, its root, its notes and their names. A chord
// written over a bass (C/E, 1/3) is marked `overBass`, and only then does its bass sound
// or show; `bassMidi` otherwise holds where a bass would sit, an octave under the root.
// On a guitar the audio plays it as a shape on the neck, and marks it so.
export type Voiced = {
  input: string
  label: string
  rootPc: number
  bassMidi: number
  notesMidi: number[]
  noteNames: string[]
  bassName: string
  overBass?: boolean
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
// or # in front: in major iii is 4 semitones and biii is 3; in minor iii is 3. Shared by a chord's
// numeral and a note written as a degree.
export function degreeSemitones(
  degree: number,
  acc = "",
  scale: readonly number[] = MODE_TABLE.major.scale,
): number {
  const index = degreeIndex(degree)
  return (
    scale[mod(index, scale.length)] +
    12 * Math.floor(index / scale.length) +
    (acc === "#" ? 1 : acc === "b" ? -1 : 0)
  )
}

const LETTER_FIFTHS: Record<string, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 }
const DEGREE: Record<string, number> = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 }
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const DEGREE_RE = /^(-?)([#b]?)(vii|vi|iv|v|iii|ii|i|[1-9]\d*)(.*)$/
export const degreeNumber = (text: string) =>
  /^-?\d+$/.test(text) ? Number(text) : DEGREE[text] + 1
// 1 is the tonic; -1 is the preceding scale tone. Zero is deliberately not a degree.
export const degreeIndex = (degree: number) => (degree < 0 ? degree : degree - 1)
const mod = (n: number, size: number) => ((n % size) + size) % size
export const validDegree = (degree: number) =>
  Number.isSafeInteger(degree) && degree !== 0 && Math.abs(degree) <= 128

// A root ("E", "F#", "Bb") in a mode ("minor") → the key: its root, mode and scale, the
// sharps in its signature (negative for flats) and whether its black keys are spelt with
// flats. null when the root isn't a note or the mode isn't one.
export function parseKey(root: unknown, mode = "major"): Key | null {
  const m = /^([A-G])([#b]?)$/.exec(String(root || "").trim())
  if (!m || !modeInfo(mode)) return null
  const [, letter, acc] = m
  let sharps =
    LETTER_FIFTHS[letter] + (acc === "#" ? 7 : acc === "b" ? -7 : 0) - modeInfo(mode)!.fifths
  if (sharps > 7) sharps -= 12
  if (sharps < -7) sharps += 12
  return {
    name: `${letter + acc} ${mode}`,
    root: letter + acc,
    mode,
    tonicPc: NOTE_TO_PC[letter + acc],
    // Semitones from C up to the root as its octave counts it: Cb4 is just below C4, so -1
    tonicSemis: LETTER_PC[letter] + (acc === "#" ? 1 : acc === "b" ? -1 : 0),
    scale: modeInfo(mode)!.scale,
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

// Whether a mode's signature is a minor one: A minor's, as harmonic and melodic minor have
export const isMinorMode = (mode: string) => !!modeInfo(mode)?.minor

export const NUMERALS = ["i", "ii", "iii", "iv", "v", "vi", "vii"]

// Whether a key's scale has no such degree: whole tone has six, so its 7 and vii are past it
export const pastScale = (key: Key, degree: number) => degree > key.scale.length

// The key as ABC writes it in its K: field: D, Am, D dor.
export const abcKey = (key: Key) => key.root + modeInfo(key.mode)!.abc

// Strict check: a numeral plus chord-suffix characters only, so words like "intro" or
// "vibe" aren't mistaken for i and vi chords.
const ROMAN_TOKEN_RE =
  /^[#b]?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(?:6\/9|maj|min|sus|add|dim|dom|aug|alt|M|m|b|#|\+|\d)*$/

export function isRoman(token: string): boolean {
  return ROMAN_TOKEN_RE.test(chordParts(token)[0])
}

export function isDegreeChord(token: string): boolean {
  return (
    isRoman(token) ||
    /^-?[#b]?[1-9]\d*(?:6\/9|maj|min|sus|add|dim|dom|aug|alt|M|m|b|#|\+|\d)*$/.test(
      chordParts(token)[0],
    )
  )
}

// A chord's name split into the chord and its bass, as split("/") would, except that a 6/9
// chord is written as on a lead sheet, C6/9 or Cm6/9, so the / in it is the chord's own:
// C6/9/E is C6/9 over E. More than one bass gives a third part, which no chord has.
export function chordParts(token: string): string[] {
  // Digits belong to the root: 16/9 is degree 16 over degree 9. A numeric
  // root's 6/9 quality needs its major/minor marker: 1M6/9 or 1m6/9.
  const root = /^-?[#b]?(?:vii|vi|iv|v|iii|ii|i|[1-9]\d*)|^[A-G][#b]*/.exec(token)?.[0] ?? ""
  const at = token.indexOf("6/9", root.length)
  const cut = at < 0 ? 0 : at + 3
  const [rest, ...more] = token.slice(cut).split("/")
  return [token.slice(0, cut) + rest, ...more]
}

// The name tonal knows a chord by: it has a minor 6/9 as m69, not m6/9.
export const tonalName = (head: string) => head.replace(/m6\/9$/, "m69")

// A degree, i to vii (i to vi in whole tone), counted on the key's own scale, its mode's: in D minor 3 is F, and in D
// dorian 6 is B. b and # in front move it a semitone. Shared by a chord's numeral and a note
// written as a degree.
export function degreePc(key: Key, degree: number, acc = ""): number {
  return mod(key.tonicPc + degreeSemitones(degree, acc, key.scale), 12)
}

// How many letters up from the key's root a degree's name is: one a degree, except in whole
// tone, whose 6th is spelt as a 7th (D E F# G# A# C, not B#)
export const letterStep = (key: Key, degree: number) => {
  const index = mod(degreeIndex(degree), key.scale.length)
  return (
    (modeInfo(key.mode)?.letters?.[index] ?? index) +
    7 * Math.floor(degreeIndex(degree) / key.scale.length)
  )
}

// A degree's name: the letter of its place in the scale, counted from the key's root, raised
// or lowered to its pitch. So #vii in G minor is F#, not Gb, the 3rd of C# major is E#, and
// VII in A minor is G.
const LETTERS = "CDEFGAB"
export function degreeName(key: Key, degree: number, acc = ""): string {
  const letter = LETTERS[mod(LETTERS.indexOf(key.root[0]) + letterStep(key, degree), 7)]
  const alter = ((((degreePc(key, degree, acc) - LETTER_PC[letter]) % 12) + 18) % 12) - 6
  return letter + (alter > 0 ? "#".repeat(alter) : "b".repeat(-alter))
}

// A numeral is lowercase, and the mode makes its chord: a plain one is the triad the key's scale
// has on that degree (major, minor or diminished), and one with a 7 is its seventh chord, so
// ii7 is Dm7 in C and i7 is Cmaj7. A b or # in front is a chord off the scale, major. What
// follows can say the chord outright, as it does after a chord's root: vm, vM, vdim, vmaj7,
// v7alt, vdom7 (a dominant seventh). The degree is counted on the key's own scale, so in A
// minor iii is C and vii is G.
function degreeToSymbol(main: string, key: Key): string | null {
  const m = DEGREE_RE.exec(main)
  if (!m) return null
  const [, sign, acc, numeral, rest] = m
  const number = degreeNumber(sign + numeral)
  if (!validDegree(number) || (!/^\d/.test(numeral) && pastScale(key, number))) return null
  const degree = mod(degreeIndex(number), key.scale.length)
  const size = key.scale.length
  const root = degreeName(key, degree + 1, acc)
  // ° and ø are drawn, not typed: the chart says dim and m7b5
  if (/^[°ø]/.test(rest)) return null
  const above = (k: number) =>
    key.scale[(degree + k) % size] + (degree + k >= size ? 12 : 0) - key.scale[degree]
  // Six notes stack no seventh of their own: whole tone's is the flat seventh, 10 semitones
  const [third, fifth, seventh] = [above(2), above(4), size === 7 ? above(6) : 10]
  const triad = acc ? "" : third === 3 ? (fifth === 6 ? "dim" : "m") : fifth === 8 ? "aug" : ""
  // What follows the numeral: nothing is the scale's triad, a 7 its seventh chord, a number
  // (6/9, 9, 11) goes on the triad, and anything else says the chord outright
  if (!rest) return root + triad
  if (rest === "7" && !acc) {
    if (third === 4) {
      if (fifth === 8) return root + (seventh === 11 ? "maj7#5" : "7#5")
      return root + (seventh === 11 ? "maj7" : "7")
    }
    if (fifth === 6) return root + (seventh === 10 ? "m7b5" : "dim7")
    return root + (seventh === 10 ? "m7" : "mMaj7")
  }
  if (/^\d/.test(rest) && !rest.startsWith("7")) return root + triad + rest
  if (/^(add|[#b])/.test(rest)) return root + triad + rest
  if (rest === "M") return root
  if (rest.startsWith("M6/9")) return root + rest.slice(1)
  if (rest.startsWith("dom7")) return root + "7" + rest.slice(4)
  if (rest.startsWith("mmaj")) return root + "mMaj" + rest.slice(4)
  return root + rest
}

// Keep the established chord vocabulary, then compose modifiers when a full
// symbol isn't in the dictionary. add supplies a tone without implying a seventh;
// an alteration replaces that numbered tone, and sus replaces the third.
function chordModifiers(suffix: string): string[] | null {
  const modifier = /^(sus[24]?|add[#b]?(?:1[0-3]|[2-9])|[#b](?:1[0-3]|[2-9]))/
  const tokens: string[] = []
  let rest = suffix
  while (rest) {
    const token = modifier.exec(rest)?.[0]
    if (!token) return null
    tokens.push(token)
    rest = rest.slice(token.length)
  }
  return tokens
}

function modifiedIntervals(intervals: string[], suffix: string): string[] | null {
  const modifiers = chordModifiers(suffix)
  if (!modifiers) return null
  let result = [...intervals]
  for (const token of modifiers) {
    if (token.startsWith("sus")) {
      result = result.filter((iv) => ![2, 3, 4].includes(Interval.num(iv)))
      result.push(token === "sus2" ? "2M" : "4P")
    } else {
      const match = /^(?:add)?([#b]?)(\d+)$/.exec(token)!
      const n = Number(match[2])
      const semis = degreeSemitones(((n - 1) % 7) + 1, match[1]) + 12 * Math.floor((n - 1) / 7)
      const quality = [1, 4, 5].includes(((n - 1) % 7) + 1) ? "P" : "M"
      const alt = semis - Interval.semitones(`${n}${quality}`)
      result = result.filter((iv) => Interval.num(iv) !== n)
      result.push(`${n}${alt === 0 ? quality : alt > 0 ? "A" : quality === "P" ? "d" : "m"}`)
    }
  }
  return result.sort((a, b) => Interval.num(a) - Interval.num(b))
}

export function readChordSymbol(
  symbol: string,
): { tonic: string; symbol: string; intervals: string[] } | null {
  const known = Chord.get(tonalName(symbol.replace(/sus(?![24])/, "sus4")))
  if (!known.empty && known.tonic)
    return { tonic: known.tonic, symbol: known.symbol, intervals: known.intervals }
  const root = /^[A-G][#b]*/.exec(symbol)?.[0]
  if (!root) return null
  const suffix = symbol.slice(root.length)
  for (let cut = suffix.length - 1; cut >= 0; cut--) {
    const base = Chord.get(tonalName(root + suffix.slice(0, cut)))
    if (base.empty || !base.tonic) continue
    const intervals = modifiedIntervals(base.intervals, suffix.slice(cut))
    if (intervals) return { tonic: root, symbol, intervals }
  }
  return null
}

// One suffix is an argument, never a chord, bass, name or list. A complete quality
// replaces the harmony; additions, alterations and suspensions retain other tones.
function chordExtension(modifier: string): { suffix: string; additive: boolean } | null {
  if (!modifier || !/^[A-Za-z0-9+#/]+$/.test(modifier)) return null
  const suffix = modifier
    .replace(/^dom(?=\d)/, "")
    .replace(/^mmaj/, "mMaj")
    .replace(/^M6\/9$/, "6/9")
  const additive = /^(sus|add|[#b])/.test(suffix)
  if (additive) return modifiedIntervals(["1P", "3M", "5P"], suffix) ? { suffix, additive } : null
  // buildChord also enforces the language's 6/9 spelling and rejects slash basses
  // below. Its root's octave is irrelevant here: this is only suffix validation.
  if (suffix.includes("/") && !/^m?6\/9$/.test(suffix)) return null
  return buildChord(`C${suffix}`) ? { suffix, additive } : null
}

export const isChordExtension = (modifier: string): boolean => !!chordExtension(modifier)

export function extendChord(chord: Voiced, modifier: string): Voiced | null {
  const extension = chordExtension(modifier)
  if (!extension || !chord.notesMidi.length) return null
  const rootNote = chord.noteNames[0]
  const rootMidi = chord.notesMidi[0]
  if (!rootNote || Note.midi(rootNote) !== rootMidi) return null
  const root = rootNote.replace(/-?\d+$/, "")
  const current = chord.noteNames.map((name) => Note.distance(rootNote, name))
  const full = extension.additive ? null : readChordSymbol(root + extension.suffix)
  const intervals = extension.additive
    ? modifiedIntervals(current, extension.suffix)
    : full?.intervals
  if (!intervals?.length) return null
  const notesMidi = intervals.map((iv) => rootMidi + Interval.semitones(iv))
  if (![chord.bassMidi, ...notesMidi].every((m) => Number.isFinite(m) && m >= 0 && m <= 127))
    return null
  const noteNames = intervals.map((iv) => Note.transpose(rootNote, iv))
  if (noteNames.some((name, i) => Note.midi(name) !== notesMidi[i])) return null

  // The original label may describe an unusual interval-transformed tone set.
  // Reuse a composable symbol only if it describes the actual result exactly.
  const ordered = (values: readonly string[]) =>
    [...values].sort((a, b) => Interval.num(a) - Interval.num(b) || a.localeCompare(b))
  const resultIntervals = ordered(intervals)
  const matches = (candidate: readonly string[]) =>
    candidate.length === resultIntervals.length &&
    ordered(candidate).every((iv, i) => iv === resultIntervals[i])
  const candidates = [full]
  if (extension.additive) {
    const base = chordParts(chord.label)[0]
    candidates.push(readChordSymbol(base + extension.suffix))
    // Some dictionary aliases lower compound tones: add13add9 is read as 6/9.
    // Try a conventional modifier order, accepting it only if all spelled and
    // compound intervals still match. Reordering must never change the harmony.
    const modifiers = chordModifiers(extension.suffix)!
    const number = (token: string) => Number(/\d+$/.exec(token)?.[0] ?? 4)
    const suffix = [...modifiers].sort((a, b) => number(a) - number(b)).join("")
    if (suffix !== extension.suffix) candidates.push(readChordSymbol(base + suffix))
  }
  const known = candidates.find(
    (candidate) => candidate?.tonic === root && matches(candidate.intervals),
  )
  const type = known ? null : ChordType.all().find((type) => matches(type.intervals))
  const suffix = type?.name === "major" ? "" : type?.aliases[0]
  const label = known
    ? /^m?6\/9$/.test(extension.suffix)
      ? root + extension.suffix
      : known.symbol
    : suffix !== undefined
      ? root + suffix
      : `[${noteNames.map((name) => name.replace(/-?\d+$/, "")).join(" ")}]`
  return {
    ...chord,
    input: `extend(${chord.input}, ${modifier})`,
    label: label + (chord.overBass ? "/" + chord.bassName.replace(/-?\d+$/, "") : ""),
    notesMidi,
    noteNames,
  }
}

// A chord token ("Cmaj7", "C/E", "ii7", "bvii") → voicing, or null if it isn't a chord.
export function buildChord(token: string, key?: Key | null, octave = 3): Voiced | null {
  if (!token || token.includes("'")) return null
  const [written, bassStr, extra] = chordParts(token)
  if (extra !== undefined) return null
  const main = written
  let symbol: string | null
  let fromKey: number | null = null // a numeral's root, in semitones up from the key's root
  const numeral = DEGREE_RE.exec(main)
  if (numeral) {
    key = key || parseKey("C")!
    symbol = degreeToSymbol(main, key)
    fromKey = degreeSemitones(degreeNumber(numeral[1] + numeral[3]), numeral[2], key.scale)
  } else if (/^[A-G][#b]?/.test(main)) symbol = main
  else return null
  if (!symbol) return null
  // A 6/9 has one spelling, 6/9 or m6/9, never 69, 6add9 or maj6/9, which tonal also reads
  const quality = symbol.replace(/^[A-G][#b]*/, "")
  const sixNine = /^m?6\/9$/.test(quality)
  if (/69|6add9/.test(quality) || (quality.includes("6/9") && !sixNine)) return null

  const ch = readChordSymbol(symbol)
  if (!ch || !ch.intervals.length) return null
  const tonicPc = Note.chroma(ch.tonic)
  if (tonicPc == null || isNaN(tonicPc)) return null

  let bassPc = tonicPc
  let bassName = bassStr
  if (bassStr !== undefined) {
    const degree = /^(-?)([#b]?)([1-9]\d*)$/.exec(bassStr)
    if (degree) {
      const bassKey = key || parseKey("C")!
      const n = Number(degree[1] + degree[3])
      if (!validDegree(n)) return null
      bassName = degreeName(bassKey, n, degree[2])
    } else if (!/^[A-G][#b]?$/.test(bassStr)) return null
    bassPc = Note.chroma(bassName!)
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
    const degree = /^(-?)([#b]?)([1-9]\d*)$/.exec(bassStr)
    if (degree) {
      const bassKey = key || parseKey("C")!
      bass =
        octave * 12 +
        bassKey.tonicSemis +
        degreeSemitones(Number(degree[1] + degree[3]), degree[2], bassKey.scale)
    }
  }
  const voicing = ch.intervals.map((iv) => rootMidi + Interval.semitones(iv))
  if (![bass, ...voicing].every((m) => m >= 0 && m <= 127)) return null
  // The notes are spelt from the symbol, as a musician would: A C# E, not A Db E. B# and Cb
  // sit across an octave number from the pitch they sound (B#2 is C3), so the octave counts
  // from the tonic's own spelling.
  const tonicOctave =
    Math.floor((rootMidi - Note.get(ch.tonic).alt - LETTER_PC[ch.tonic[0]]) / 12) - 1
  const names = ch.intervals.map((iv) => Note.transpose(ch.tonic! + tonicOctave, iv))
  while (voicing.length > 1 && voicing[voicing.length - 1] - voicing[0] > 24) {
    voicing.pop()
    names.pop()
  }

  return {
    input: token,
    label: (sixNine ? symbol : ch.symbol) + (bassName ? "/" + bassName : ""),
    rootPc: tonicPc,
    bassMidi: bass,
    notesMidi: voicing,
    noteNames: names.map((n, i) => (Note.midi(n) === voicing[i] ? n : midiToName(voicing[i]))),
    bassName: spellLike({ noteNames: [bassName || ch.tonic] }, bass),
    ...(bassStr !== undefined ? { overBass: true } : {}),
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
  let octave = Math.floor(midi / 12) - 1
  while (Note.midi(name + octave)! > midi) octave--
  while (Note.midi(name + octave)! < midi) octave++
  return name + octave
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

// The key a state is in, as the chords and the sheet read it.
export const keyOf = (st: State) => parseKey(st.key, st.mode)
