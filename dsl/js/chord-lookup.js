/* Guitar chord positions from @tombatossals/chords-db (bundled, lazy-loaded chunk). */
import { Chord, Interval, Note } from "tonal"
import { chordParts, tonalName } from "./chords.js"

let db = null
const positionCache = new Map()

const KEY_ALIASES = { "C#": "Csharp", "F#": "Fsharp" }

const ALIAS_SUFFIX = {
  "": "major",
  M: "major",
  maj: "major",
  min: "minor",
  m: "minor",
  dim: "dim",
  aug: "aug",
  "+": "aug",
  sus2: "sus2",
  sus4: "sus4",
  "7sus4": "7sus4",
  "6": "6",
  "69": "69",
  "7": "7",
  maj7: "maj7",
  m7: "m7",
  m7b5: "m7b5",
  "ø": "m7b5",
  hdim: "m7b5",
  dim7: "dim7",
  m6: "m6",
  m69: "m69",
  "9": "9",
  maj9: "maj9",
  m9: "m9",
  "11": "11",
  m11: "m11",
  maj11: "maj11",
  "13": "13",
  maj13: "maj13",
  mmaj7: "mmaj7",
  add9: "add9",
  madd9: "madd9",
  "7b5": "7b5",
  aug7: "aug7",
  "7b9": "7b9",
  "7#9": "7#9",
  alt: "alt",
}

export function load() {
  if (db) return Promise.resolve(db)
  return import("@tombatossals/chords-db/lib/guitar.json").then((mod) => {
    db = mod.default
    return db
  })
}

function displayKey(key) {
  if (key === "Csharp") return "C#"
  if (key === "Fsharp") return "F#"
  return key
}

function chordListForKey(key) {
  if (!db) return null
  return db.chords[key] || db.chords[KEY_ALIASES[key]] || null
}

function chordEntryFor(key, suffix) {
  const list = chordListForKey(key)
  if (!list) return null
  return list.find((e) => e && e.suffix === suffix) || null
}

function labelFromKeySuffix(key, suffix) {
  const root = displayKey(key)
  if (suffix === "major") return root
  if (suffix === "minor") return root + "m"
  if (suffix.startsWith("m/")) return root + "m/" + suffix.slice(2)
  if (suffix.startsWith("/")) return root + suffix
  return root + suffix
}

function absFret(f, base) {
  return f > 0 ? f + base - 1 : f
}

function scorePosition(p) {
  const frets = p.frets || []
  const base = p.baseFret || 1
  const played = frets.filter((f) => f > 0)
  if (!played.length) return -Infinity

  const abs = frets.map((f) => absFret(f, base))
  const absPlayed = abs.filter((f) => f > 0)
  const opens = frets.filter((f) => f === 0).length
  const mutes = frets.filter((f) => f < 0).length
  const maxF = Math.max(...absPlayed)
  const span = maxF - Math.min(...absPlayed)

  const atFret = {}
  for (const f of absPlayed) atFret[f] = (atFret[f] || 0) + 1
  const maxCluster = Math.max(...Object.values(atFret))

  let score =
    opens * 5 -
    mutes * 2 -
    maxF * 0.45 -
    span * 0.25 -
    (base > 1 ? (base - 1) * 0.2 : 0)

  if (maxCluster >= 4) score -= 12
  else if (maxCluster >= 3) score -= 4

  const fingers = p.fingers || []
  const barres = p.barres || []
  if (barres.length && fingers.length === 6) {
    const barreAbs = absFret(barres[0], base)
    const belowBarre = []
    const onBarre = []
    for (let i = 0; i < 6; i++) {
      if (abs[i] === barreAbs && fingers[i] > 0) onBarre.push(fingers[i])
      if (abs[i] > 0 && abs[i] < barreAbs && fingers[i] > 0) belowBarre.push(fingers[i])
    }
    const barreFinger = onBarre.length ? Math.min(...onBarre) : 0
    if (belowBarre.some((f) => f < barreFinger)) score -= 10
    if (barreFinger > 1 && onBarre.length >= 3) score -= 3
  }

  return score
}

// Pitch classes a position's midi notes contain.
function pcsOfPosition(p) {
  const out = new Set()
  for (const m of p.midi || []) out.add(((m % 12) + 12) % 12)
  return out
}

// Defining pitch classes for a chord symbol, broken down by role.
// The 5th is optional (commonly dropped in guitar voicings); everything else
// must be present in a candidate position. `third` / `extensions` are used to
// score voicing musicality, and `tones` is every note that belongs: the 5th and a
// slash chord's bass included.
function chordPcsForLabel(label) {
  if (!label) return null
  const [head, bass] = chordParts(label)
  const ch = Chord.get(tonalName(head))
  if (ch.empty || !ch.intervals?.length || ch.tonic == null) return null
  const tonicPc = Note.chroma(ch.tonic)
  if (tonicPc == null || isNaN(tonicPc)) return null
  const required = new Set()
  const extensions = new Set()
  const tones = new Set()
  let third = null
  // Under an 11th or a 13th a guitar leaves the 9th out, as it does the 5th
  const upper = ch.intervals.some((iv) => /^(11|13)/.test(iv))
  for (const iv of ch.intervals) {
    const semi = Interval.semitones(iv)
    if (semi == null) continue
    const pc = (((tonicPc + semi) % 12) + 12) % 12
    tones.add(pc)
    if (iv === "5P" || (upper && iv === "9M")) continue
    required.add(pc)
    if (third == null && (iv === "3M" || iv === "3m" || iv === "4P" || iv === "2M")) third = pc
    if (/^(9|11|13)/.test(iv)) extensions.add(pc)
  }
  const bassPc = bass ? Note.chroma(bass) : null
  if (bassPc != null && !isNaN(bassPc)) tones.add(bassPc)
  return { required, third, extensions, tones }
}

function positionCoversRequired(p, required) {
  if (!required) return true
  const pcs = pcsOfPosition(p)
  for (const r of required) if (!pcs.has(r)) return false
  return true
}

// Penalty when an extension (9/11/13) is voiced below the chord's 3rd.
// Conventional guitar voicings stack the basic triad below the extensions
// (e.g. Cadd9 = x32030 puts E on the D string before D on the B string),
// so reversing that order produces the "wrong" sounding shape.
function voicingOrderPenalty(p, third, extensions) {
  if (third == null || !extensions || !extensions.size) return 0
  if (!p.midi || !p.midi.length) return 0
  const sorted = p.midi.slice().sort((a, b) => a - b)
  let firstThird = -1
  let firstExt = -1
  for (let i = 0; i < sorted.length; i++) {
    const pc = ((sorted[i] % 12) + 12) % 12
    if (firstThird === -1 && pc === third) firstThird = i
    if (firstExt === -1 && extensions.has(pc)) firstExt = i
  }
  if (firstThird === -1) return -8
  if (firstExt !== -1 && firstThird > firstExt) return -8
  return 0
}

function pickPosition(positions, chordPcs) {
  if (!positions?.length) return null
  const required = chordPcs?.required
  const valid = required ? positions.filter((p) => positionCoversRequired(p, required)) : positions
  // Of those, a shape that sounds nothing outside the chord, when there is one: the
  // database has shapes with stray open strings (an AbM7b5 at the 6th fret rings E and A)
  const tones = chordPcs?.tones
  const clean = tones ? valid.filter((p) => [...pcsOfPosition(p)].every((pc) => tones.has(pc))) : []
  // A chord with tones none of its shapes sound has no shape: tonal's notes play
  if (required && !valid.length) return null
  const pool = clean.length ? clean : valid
  let best = pool[0]
  let bestScore = -Infinity
  for (const p of pool) {
    let score = scorePosition(p)
    if (chordPcs) score += voicingOrderPenalty(p, chordPcs.third, chordPcs.extensions)
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  return best
}

function normalizeBarreFingers(frets, fingers, barres, baseFret) {
  if (!fingers?.length || !barres?.length) return fingers
  const abs = frets.map((f) => absFret(f, baseFret || 1))
  let barreAbs = -1
  let maxSpan = 0
  for (const b of barres) {
    const a = absFret(b, baseFret || 1)
    const span = abs.filter((f) => f === a).length
    if (span > maxSpan) {
      maxSpan = span
      barreAbs = a
    }
  }
  if (maxSpan < 2) return fingers

  const onBarre = []
  for (let i = 0; i < 6; i++) {
    if (abs[i] === barreAbs && fingers[i] > 0) onBarre.push(fingers[i])
  }
  if (!onBarre.length) return fingers
  const barreFinger = Math.min(...onBarre)
  if (barreFinger === 1) return fingers

  const out = fingers.slice()
  for (let i = 0; i < 6; i++) {
    if (out[i] <= 0) continue
    if (abs[i] === barreAbs) out[i] = 1
    else if (out[i] > barreFinger) out[i] -= barreFinger - 1
  }
  return out
}

function exportPosition(pos) {
  if (!pos?.frets?.length) return null
  const baseFret = pos.baseFret || 1
  const frets = pos.frets.slice()
  const barres = pos.barres ? pos.barres.slice() : []
  const fingers = pos.fingers
    ? normalizeBarreFingers(frets, pos.fingers.slice(), barres, baseFret)
    : null
  const midi = pos.midi ? pos.midi.slice() : null
  return { frets, fingers, baseFret, barres, midi }
}

function positionFromEntry(entry, required) {
  if (!entry?.positions?.length) return null
  return exportPosition(pickPosition(entry.positions, required))
}

function maxAbsoluteFret(position) {
  const played = position.frets.filter((f) => f > 0)
  if (!played.length) return 0
  const base = position.baseFret || 1
  return Math.max(...played.map((f) => absFret(f, base)))
}

// Chords whose tonal names the database doesn't share. Without these a minor-major
// seventh fell through to the major seventh's shape (E natural in CmMaj7), a minor-major
// ninth to the minor triad, and 9#5 and M7b5 found no shape.
const TONAL_SUFFIX = { mMaj7: "mmaj7", mMaj9: "mmaj9", "9#5": "aug9", M7b5: "maj7b5" }

function symbolToSuffix(symbol) {
  if (!symbol) return null
  const ch = Chord.get(symbol)
  if (ch.empty) return null
  for (const alias of ch.aliases || []) {
    if (TONAL_SUFFIX[alias] && db?.suffixes?.includes(TONAL_SUFFIX[alias])) return TONAL_SUFFIX[alias]
    if (db?.suffixes?.includes(alias)) return alias
  }
  const type = (ch.type || "").toLowerCase()
  if (type.includes("major seventh")) return "maj7"
  if (type.includes("minor seventh")) return "m7"
  if (type.includes("dominant seventh")) return "7"
  if (type.includes("minor")) return "minor"
  if (type.includes("major")) return "major"
  if (type.includes("diminished seventh")) return "dim7"
  if (type.includes("half-diminished")) return "m7b5"
  if (type.includes("diminished")) return "dim"
  if (type.includes("augmented")) return "aug"
  if (type.includes("suspended fourth")) return "sus4"
  if (type.includes("suspended second")) return "sus2"
  return ALIAS_SUFFIX[ch.aliases && ch.aliases[0]] || null
}

function resolveKeySuffix(label) {
  const [head, slash] = chordParts(label)

  const ch = Chord.get(tonalName(head))
  if (!ch.empty && ch.tonic) {
    let suffix = symbolToSuffix(tonalName(head))
    if (!suffix) return null
    if (slash) {
      // The database's slash shapes are triads over a bass, "/E" for a major triad and
      // "m/E" for a minor one, with the bass spelt either way (D# or Eb). A minor chord
      // used to get the major shape (Em/B played G#); any other chord over a bass has no
      // shape of its own, and tonal's notes play instead.
      const pc = Note.get(slash).pc || slash
      const names = [pc, Note.enharmonic(pc)]
      const prefix = suffix === "major" ? "/" : suffix === "minor" ? "m/" : null
      const found = prefix && names.map((n) => prefix + n).find((sx) => db.suffixes.includes(sx))
      if (!found) return null
      suffix = found
    }
    return { key: ch.tonic, suffix }
  }

  const m = /^([A-G][#b]?)(.*)$/.exec(head)
  if (!m) return null
  const key = m[1]
  const rest = m[2] || ""
  let suffix = "major"
  if (rest === "m" || rest === "min") suffix = "minor"
  else if (rest) suffix = rest.replace(/^maj/, "maj")
  if (slash) {
    const slashPc = Note.get(slash).pc || slash
    if (suffix === "minor") suffix = "m/" + slashPc
    else suffix = "/" + slashPc
  }
  return { key, suffix }
}

export function lookupPosition(label) {
  if (!db || !label) return null
  if (positionCache.has(label)) return positionCache.get(label)

  const ks = resolveKeySuffix(label)
  if (!ks) {
    positionCache.set(label, null)
    return null
  }

  const chordPcs = chordPcsForLabel(label)
  const dbKey = KEY_ALIASES[ks.key] || ks.key
  const entry = chordEntryFor(dbKey, ks.suffix)
  let pos = positionFromEntry(entry, chordPcs)

  if (!pos) {
    const [head, bass] = chordParts(label)
    const ch = Chord.get(tonalName(head))
    for (const alias of ch.aliases || []) {
      const tryLabel = bass !== undefined && !alias.includes("/") ? alias + "/" + bass : alias
      const alt = resolveKeySuffix(tryLabel)
      if (!alt) continue
      const altKey = KEY_ALIASES[alt.key] || alt.key
      pos = positionFromEntry(chordEntryFor(altKey, alt.suffix), chordPcs)
      if (pos) break
    }
  }

  // A shape without the chord's root or third is another chord (the database's Emadd9
  // shapes have no E): play tonal's notes instead
  if (pos && chordPcs && !soundsRootAndThird(pos, label, chordPcs)) pos = null

  positionCache.set(label, pos)
  return pos
}

function soundsRootAndThird(pos, label, chordPcs) {
  const pcs = pcsOfPosition(pos)
  const root = Note.chroma(Chord.get(tonalName(chordParts(label)[0])).tonic)
  return pcs.has(root) && (chordPcs.third == null || pcs.has(chordPcs.third))
}

export function lookupBySymbol(symbol) {
  return lookupPosition(symbol)
}

function isBrowserChordLabel(label) {
  if (!/^[A-G][#b]?/.test(label)) return false
  const parts = chordParts(label)
  if (parts.length > 2) return false
  if (parts.length === 2) {
    const bass = parts[1]
    if (!/^[A-G][#b]?$/.test(bass)) return false
    const root = parts[0].match(/^[A-G][#b]?/)[0]
    if (bass === root) return false
  }
  return true
}

// The database's names that the language spells another way: a minor-major seventh is
// mMaj7 (tonal reads mmaj7 as nothing), an augmented ninth is 9#5, and a major seventh
// flat five is M7b5, and a 6/9 is written as on a lead sheet.
const LIBRARY_SUFFIX = { mmaj7: "mMaj7", mmaj9: "mMaj9", aug9: "9#5", maj7b5: "M7b5", "69": "6/9", m69: "m6/9" }

// A slash chord's bass, spelt as the chord's own note when it is one (E/G#, not E/Ab), and
// otherwise by its interval above the root: F/Eb (the flat seventh), not the database's F/D#.
const BASS_INTERVAL = ["1P", "2m", "2M", "3m", "3M", "4P", "4A", "5P", "6m", "6M", "7m", "7M"]
function spellBass(label) {
  const [head, bass] = chordParts(label)
  if (!bass) return label
  const ch = Chord.get(tonalName(head))
  const own = ch.notes.find((n) => Note.chroma(n) === Note.chroma(bass))
  if (own) return `${head}/${own}`
  const step = (Note.chroma(bass) - Note.chroma(ch.tonic) + 12) % 12
  return `${head}/${Note.pitchClass(Note.transpose(ch.tonic, BASS_INTERVAL[step]))}`
}

// Every chord the language plays on a guitar, named as it's written in a cell and drawn
// with the shape a cell plays and draws for it. The database's names the language has no
// chord for are left out: alt (its shapes have no seventh), 7sg, maj11, mmaj11, mmaj7b5.
export function buildCatalog() {
  if (!db) return []
  const items = []
  const seen = new Set()
  for (const key of db.keys) {
    const list = chordListForKey(key)
    if (!list) continue
    for (const entry of list) {
      if (!entry?.suffix) continue
      const label = spellBass(labelFromKeySuffix(key, LIBRARY_SUFFIX[entry.suffix] ?? entry.suffix))
      if (seen.has(label) || !isBrowserChordLabel(label)) continue
      if (Chord.get(tonalName(chordParts(label)[0])).empty) continue
      const position = lookupPosition(label)
      if (!position || maxAbsoluteFret(position) > 12) continue
      seen.add(label)
      items.push({ label, position })
    }
  }
  return items
}
