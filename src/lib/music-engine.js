/* Music DSL parser + chord builder + Tone.js offline renderer + waveform draw + WAV export. */
import * as Tone from "tone"
import { Chord, Note, Interval } from "tonal"

const NOTE_TO_PC = {
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
const PC_TO_NAME = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

export function midiToName(m) {
  const pc = ((m % 12) + 12) % 12
  const oct = Math.floor(m / 12) - 1
  return PC_TO_NAME[pc] + oct
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]

// Diatonic chord qualities by scale degree (0-6)
const MAJOR_QUALITIES = ["major", "minor", "minor", "major", "major", "minor", "dim"]
const MINOR_QUALITIES = ["minor", "dim", "major", "minor", "minor", "major", "major"]

const ROMAN = {
  I: 0,
  II: 1,
  III: 2,
  IV: 3,
  V: 4,
  VI: 5,
  VII: 6,
  i: 0,
  ii: 1,
  iii: 2,
  iv: 3,
  v: 4,
  vi: 5,
  vii: 6,
}

export function parseKey(str) {
  if (!str) return { root: "C", mode: "major", tonicPc: 0 }
  const m = /^([A-G][b#]?)(?:\s*(m|min|minor|maj|major))?$/i.exec(str.trim())
  if (!m) return { root: "C", mode: "major", tonicPc: 0 }
  const root = m[1][0].toUpperCase() + m[1].slice(1)
  const mode = /^m(in)?$/i.test(m[2] || "") ? "minor" : "major"
  return { root, mode, tonicPc: NOTE_TO_PC[root] }
}

// --- Duration suffix split ----------------------------------------------

const DUR_LETTERS = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 }

function splitDurationSuffix(raw) {
  const dotM = raw.match(/^(.+?)\.(w|h|q|e|s)$/)
  if (dotM) return { core: dotM[1], beats: DUR_LETTERS[dotM[2]] }
  const colonM = raw.match(/^(.+?):(\d+(?:\.\d+)?)$/)
  if (colonM) return { core: colonM[1], beats: parseFloat(colonM[2]) }
  return { core: raw, beats: null }
}

// --- Chord tokenizer / resolver -----------------------------------------

function tokenizeChord(tok) {
  const slash = tok.split("/")
  const main = slash[0]
  const bassStr = slash[1]

  const romanRe = /^([#b])?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/
  const r = romanRe.exec(main)
  if (r) {
    return {
      kind: "roman",
      accidental: r[1] || "",
      roman: r[2],
      suffix: r[3] || "",
      slashBass: bassStr || null,
    }
  }
  const absRe = /^([A-G][b#]?)(.*)$/
  const a = absRe.exec(main)
  if (a) {
    return {
      kind: "abs",
      rootStr: a[1],
      suffix: a[2] || "",
      slashBass: bassStr || null,
    }
  }
  return null
}

function applyAccidental(pc, accidental) {
  if (accidental === "#") return (pc + 1) % 12
  if (accidental === "b") return (pc + 11) % 12
  return pc
}

function resolveRoot(tok, key) {
  if (tok.kind === "abs") {
    return {
      rootPc: NOTE_TO_PC[tok.rootStr],
      suffix: tok.suffix,
      baseQuality: "major",
      slashBass: tok.slashBass,
    }
  }
  const degree = ROMAN[tok.roman]
  const scale = key.mode === "minor" ? MINOR_SCALE : MAJOR_SCALE
  const qualities = key.mode === "minor" ? MINOR_QUALITIES : MAJOR_QUALITIES
  let pc = (key.tonicPc + scale[degree]) % 12
  pc = applyAccidental(pc, tok.accidental)
  return {
    rootPc: pc,
    suffix: tok.suffix,
    baseQuality: qualities[degree],
    slashBass: tok.slashBass,
  }
}

function intervalsFromSuffix(suffix, baseQuality) {
  let s = suffix || ""
  let intervals = baseQuality === "dim" ? [0, 3, 6] : baseQuality === "minor" ? [0, 3, 7] : [0, 4, 7]

  if (/^dim/i.test(s)) {
    intervals = [0, 3, 6]
    s = s.replace(/^dim/i, "")
  } else if (/^(ø|m7b5|hdim)/i.test(s)) {
    intervals = [0, 3, 6, 10]
    s = s.replace(/^(ø|m7b5|hdim)/i, "")
  } else if (/^(aug|\+)/i.test(s)) {
    intervals = [0, 4, 8]
    s = s.replace(/^(aug|\+)/i, "")
  } else if (/^sus2/i.test(s)) {
    intervals = [0, 2, 7]
    s = s.replace(/^sus2/i, "")
  } else if (/^sus(4)?/i.test(s)) {
    intervals = [0, 5, 7]
    s = s.replace(/^sus(4)?/i, "")
  } else if (/^maj/i.test(s) || /^M(?!in)/.test(s) || /^Δ/.test(s)) {
    intervals = [0, 4, 7]
    s = s.replace(/^maj|^M(?!in)|^Δ/, "")
  } else if (/^m(in)?(?!aj)/i.test(s)) {
    intervals = [0, 3, 7]
    s = s.replace(/^m(in)?/i, "")
  }

  const isMaj7 = /maj/i.test(suffix) || /Δ/.test(suffix) || /(?:^|[^a-zA-Z])M\d/.test(suffix)
  const isDim7 = /dim7/i.test(suffix)
  const has7 = /(?:^|[^1])7/.test(s) || /9|11|13/.test(s)
  const has9 = /(?:add)?9/.test(s)
  const has11 = /11/.test(s)
  const has13 = /13/.test(s)
  const hasAdd9 = /add9/i.test(s) && !/^.*[^d]9/.test(s)

  if (isDim7) intervals.push(9)
  else if (has7) intervals.push(isMaj7 ? 11 : 10)

  if (has9 || hasAdd9) intervals.push(14)
  if (has11) intervals.push(17)
  if (has13) intervals.push(21)

  if (/b5/i.test(s) && !intervals.includes(6)) {
    const idx = intervals.indexOf(7)
    if (idx >= 0) intervals[idx] = 6
  }
  if (/#5/i.test(s)) {
    const idx = intervals.indexOf(7)
    if (idx >= 0) intervals[idx] = 8
  }
  if (/b9/i.test(s)) {
    const idx = intervals.indexOf(14)
    if (idx >= 0) intervals[idx] = 13
    else intervals.push(13)
  }
  if (/#9/i.test(s)) {
    const idx = intervals.indexOf(14)
    if (idx >= 0) intervals[idx] = 15
    else intervals.push(15)
  }
  if (/#11/i.test(s)) {
    const idx = intervals.indexOf(17)
    if (idx >= 0) intervals[idx] = 18
    else intervals.push(18)
  }
  if (/b13/i.test(s)) {
    const idx = intervals.indexOf(21)
    if (idx >= 0) intervals[idx] = 20
    else intervals.push(20)
  }

  intervals = Array.from(new Set(intervals)).sort((a, b) => a - b)
  return intervals
}

function tokenToSymbol(tok, key) {
  if (tok.kind === "abs") return tok.rootStr + (tok.suffix || "")
  const resolved = resolveRoot(tok, key)
  const rootName = PC_TO_NAME[resolved.rootPc]
  let qual = ""
  if (resolved.baseQuality === "minor") qual = "m"
  else if (resolved.baseQuality === "dim") qual = "dim"
  return rootName + qual + (tok.suffix || "")
}

function buildChordWithTonal(symbol, slashBass, oct, tokenStr, rootPcFallback) {
  const ch = Chord.get(symbol)
  if (ch.empty || !ch.intervals.length) return null

  const tonicPc =
    ch.tonic != null && ch.tonic !== ""
      ? Note.chroma(ch.tonic)
      : rootPcFallback
  if (tonicPc == null || isNaN(tonicPc)) return null

  let bass = (oct + 1) * 12 + tonicPc - 12
  if (slashBass) {
    const m = /^([A-Ga-g])([#b]?)$/.exec(slashBass)
    if (!m) return null
    const b = Note.get(m[1].toUpperCase() + m[2])
    if (b.empty || b.chroma == null) return null
    bass = (oct + 1) * 12 + b.chroma - 12
  }

  const rootMidi = (oct + 1) * 12 + tonicPc
  let voicing = ch.intervals.map((iv) => rootMidi + Interval.semitones(iv))
  while (voicing.length > 1 && voicing[voicing.length - 1] - voicing[0] > 24) voicing.pop()

  const label =
    ch.symbol + (slashBass ? "/" + slashBass : "")

  return {
    input: tokenStr,
    label,
    rootPc: tonicPc,
    bassMidi: bass,
    notesMidi: voicing,
    noteNames: voicing.map((m) => Note.fromMidi(m) || midiToName(m)),
    bassName: Note.fromMidi(bass) || midiToName(bass),
  }
}

export function buildChord(tokenStr, key, octave) {
  if (!tokenStr) return null
  const oct = typeof octave === "number" && !isNaN(octave) ? octave : 3
  const tok = tokenizeChord(tokenStr)
  if (!tok) return null
  const resolved = resolveRoot(tok, key)
  const symbol = tokenToSymbol(tok, key)

  const tonalChord = buildChordWithTonal(
    symbol,
    resolved.slashBass,
    oct,
    tokenStr,
    resolved.rootPc,
  )
  if (tonalChord) return tonalChord

  const intervals = intervalsFromSuffix(resolved.suffix, resolved.baseQuality)

  let bass = (oct - 1 + 1) * 12 + resolved.rootPc
  if (resolved.slashBass) {
    const m = /^([A-Ga-g])([#b]?)$/.exec(resolved.slashBass)
    if (!m) return null
    const pc = NOTE_TO_PC[m[1].toUpperCase() + m[2]]
    if (pc == null) return null
    bass = (oct - 1 + 1) * 12 + pc
  }

  const rootMidi = (oct + 1) * 12 + resolved.rootPc
  let voicing = intervals.map((iv) => rootMidi + iv)
  while (voicing.length > 1 && voicing[voicing.length - 1] - voicing[0] > 24) voicing.pop()

  const rootName = PC_TO_NAME[resolved.rootPc]
  let qualityLabel = ""
  if (intervals.includes(3) && intervals.includes(6)) qualityLabel = "dim"
  else if (intervals.includes(3)) qualityLabel = "m"
  else if (intervals.includes(8) && intervals.includes(4)) qualityLabel = "+"
  const suffixLabel = (resolved.suffix || "")
    .replace(/^m(in)?(?!aj)/i, "")
    .replace(/^maj/i, "maj")
    .replace(/^dim/i, "")
  const label =
    rootName + qualityLabel + suffixLabel + (resolved.slashBass ? "/" + resolved.slashBass : "")

  return {
    input: tokenStr,
    label,
    rootPc: resolved.rootPc,
    bassMidi: bass,
    notesMidi: voicing,
    noteNames: voicing.map(midiToName),
    bassName: midiToName(bass),
  }
}

// --- Source parser -------------------------------------------------------

export function parseSource(src) {
  const directives = {
    key: "C",
    tempo: 96,
    inst: "piano",
    beats: 4,
    octave: 3,
  }
  const errors = []
  const lines = src.split("\n")

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]
    const line = raw.split("--")[0].trim()
    if (!line) continue
    if (line.startsWith("@")) {
      const m = /^@(\w+)\s+(.+)$/.exec(line)
      if (m) {
        const k = m[1].toLowerCase()
        const v = m[2].trim()
        if (k === "key") directives.key = v
        else if (k === "tempo" || k === "bpm") directives.tempo = parseFloat(v) || 96
        else if (k === "inst" || k === "instrument") directives.inst = v.toLowerCase()
        else if (k === "beats") directives.beats = parseFloat(v) || 4
        else if (k === "octave" || k === "oct") {
          const n = parseInt(v, 10)
          if (!isNaN(n) && n >= 0 && n <= 8) directives.octave = n
          else errors.push({ line: li + 1, token: v, msg: `@octave must be 0–8 (got "${v}")` })
        }
      }
    }
  }

  const key = parseKey(directives.key)
  const bars = []

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]
    const line = raw.split("--")[0].trim()
    if (!line || line.startsWith("@")) continue
    const parts = line.split(/\s+/).filter((p) => p && p !== "|" && p !== "||")
    if (!parts.length) continue

    const items = parts.map((tokRaw) => {
      const cleaned = tokRaw.replace(/,$/, "")
      const { core, beats: explicitBeats } = splitDurationSuffix(cleaned)
      if (core === "~" || core === "_") {
        return { isRest: true, beatsExplicit: explicitBeats, raw: tokRaw, line: li + 1 }
      }
      const chord = buildChord(core, key, directives.octave)
      if (!chord) {
        errors.push({ line: li + 1, token: tokRaw, msg: `couldn't parse "${tokRaw}"` })
        return { isError: true, beatsExplicit: explicitBeats, raw: tokRaw, line: li + 1 }
      }
      return { chord, beatsExplicit: explicitBeats, raw: tokRaw, line: li + 1 }
    })

    const totalBeats = directives.beats
    let explicitSum = 0
    let implicitCount = 0
    for (const it of items) {
      if (it.beatsExplicit != null) explicitSum += it.beatsExplicit
      else implicitCount++
    }
    const remainder = Math.max(0, totalBeats - explicitSum)
    const implicitShare = implicitCount > 0 ? remainder / implicitCount : 0
    for (const it of items) {
      it.beats = it.beatsExplicit != null ? it.beatsExplicit : implicitShare
    }

    bars.push(items)
  }

  const beatSec = 60 / directives.tempo
  const events = []
  let beatCursor = 0
  for (const bar of bars) {
    for (const it of bar) {
      if (it.beats <= 0) continue
      const event = {
        beatStart: beatCursor,
        beats: it.beats,
        secStart: beatCursor * beatSec,
        secDur: it.beats * beatSec,
        isRest: !!it.isRest,
        isError: !!it.isError,
        raw: it.raw,
        line: it.line,
      }
      if (it.chord) {
        event.chord = it.chord
        event.midiNotes = it.chord.notesMidi
        event.bassMidi = it.chord.bassMidi
        event.label = it.chord.label
      }
      events.push(event)
      beatCursor += it.beats
    }
  }

  const totalBeatsFinal = beatCursor
  const totalSec = totalBeatsFinal * beatSec
  const chords = events.filter((e) => e.chord && !e.isError)

  return { kind: "chord", directives, key, bars, events, chords, totalBeats: totalBeatsFinal, totalSec, errors }
}

// --- Synths --------------------------------------------------------------

function makeSynth(T, kind) {
  if (kind === "piano") {
    const s = new T.Sampler({
      urls: {
        A1: "A1.mp3",
        C2: "C2.mp3",
        "D#2": "Ds2.mp3",
        "F#2": "Fs2.mp3",
        A2: "A2.mp3",
        C3: "C3.mp3",
        "D#3": "Ds3.mp3",
        "F#3": "Fs3.mp3",
        A3: "A3.mp3",
        C4: "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        A4: "A4.mp3",
        C5: "C5.mp3",
        "D#5": "Ds5.mp3",
        "F#5": "Fs5.mp3",
        A5: "A5.mp3",
        C6: "C6.mp3",
      },
      release: 1.6,
      baseUrl: "https://tonejs.github.io/audio/salamander/",
    })
    s.volume.value = -6
    return s
  }
  if (kind === "epiano") {
    const s = new T.PolySynth(T.FMSynth, {
      harmonicity: 3,
      modulationIndex: 10,
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 1.5 },
      modulation: { type: "sine" },
      modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.5 },
    })
    s.volume.value = -10
    return s
  }
  if (kind === "pad") {
    const s = new T.PolySynth(T.Synth, {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.8, decay: 0.4, sustain: 0.8, release: 2.0 },
    })
    s.volume.value = -16
    return s
  }
  if (kind === "guitar") {
    const s = new T.Sampler({
      urls: {
        C3: "C3.mp3",
        E3: "E3.mp3",
        G3: "G3.mp3",
        A3: "A3.mp3",
        C4: "C4.mp3",
        E4: "E4.mp3",
        G4: "G4.mp3",
        A4: "A4.mp3",
        C5: "C5.mp3",
      },
      release: 2.4,
      baseUrl:
        "https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_guitar_steel-mp3/",
    })
    s.volume.value = -2
    return s
  }
  if (kind === "bass") {
    const s = new T.PolySynth(T.MonoSynth, {
      oscillator: { type: "sawtooth" },
      filter: { Q: 2, type: "lowpass", rolloff: -24 },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.8 },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.3,
        release: 0.6,
        baseFrequency: 80,
        octaves: 2.6,
      },
    })
    s.volume.value = -8
    return s
  }
  if (kind === "organ") {
    const s = new T.PolySynth(T.Synth, {
      oscillator: { type: "fatsine", count: 3, spread: 12 },
      envelope: { attack: 0.02, decay: 0.0, sustain: 1.0, release: 0.4 },
    })
    s.volume.value = -12
    return s
  }
  const s = new T.PolySynth(T.FMSynth, {
    harmonicity: 2,
    modulationIndex: 5,
    envelope: { attack: 0.003, decay: 0.6, sustain: 0.1, release: 1.4 },
    modulation: { type: "triangle" },
    modulationEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.0, release: 0.4 },
  })
  s.volume.value = -10
  return s
}

export async function renderToBuffer(parsed) {
  const inst = parsed.directives.inst
  const stagger = inst === "guitar" ? 0.012 : inst === "pad" ? 0.05 : inst === "organ" ? 0 : 0.008
  const bassVel = inst === "guitar" ? 0.6 : 0.7
  const chordVel = inst === "guitar" ? 0.55 : 0.55

  const totalSec = Math.max(1.0, parsed.totalSec + 1.6)
  const buffer = await Tone.Offline(
    async ({ transport }) => {
      const reverb = new Tone.Reverb({
        decay: 2.2,
        wet: inst === "guitar" ? 0.14 : inst === "piano" ? 0.14 : 0.18,
      })
      await reverb.generate()
      reverb.toDestination()
      const synth = makeSynth(Tone, inst)
      synth.connect(reverb)

      await Tone.loaded()

      for (const ev of parsed.events) {
        if (ev.isRest || !ev.chord) continue
        const dur = ev.secDur * 0.96
        synth.triggerAttackRelease(midiToName(ev.bassMidi), dur, ev.secStart, bassVel)
        if (inst === "guitar" && ev.chord.notesMidi[0]) {
          synth.triggerAttackRelease(
            midiToName(ev.chord.notesMidi[0] - 12),
            dur,
            ev.secStart + 0.006,
            bassVel * 0.85,
          )
        }
        ev.chord.noteNames.forEach((n, idx) => {
          synth.triggerAttackRelease(n, dur, ev.secStart + (idx + 1) * stagger, chordVel)
        })
      }
    },
    totalSec,
    2,
    Tone.getContext().sampleRate,
  )

  return buffer
}

// --- Pitch-class helpers + chord diagrams -------------------------------

export function pitchClassesOf(chord) {
  const pcs = new Set()
  for (const m of chord.notesMidi) pcs.add(((m % 12) + 12) % 12)
  pcs.add(((chord.bassMidi % 12) + 12) % 12)
  return {
    pcs,
    bassPc: ((chord.bassMidi % 12) + 12) % 12,
    rootPc: chord.rootPc,
  }
}

const GUITAR_TUNING_MIDI = [40, 45, 50, 55, 59, 64]

export function computeGuitarFingering(chord) {
  const { pcs, bassPc } = pitchClassesOf(chord)
  let best = null

  for (let baseFret = 0; baseFret <= 9; baseFret++) {
    const positions = new Array(6).fill(null)
    let hasBass = false
    let bassString = -1
    let mutedCount = 0
    let lowestFretted = null
    let highestFretted = 0

    for (let s = 0; s < 6; s++) {
      const open = GUITAR_TUNING_MIDI[s]
      const candidates = []
      const pc0 = ((open % 12) + 12) % 12
      if (pcs.has(pc0)) candidates.push(0)
      for (let f = Math.max(1, baseFret); f <= baseFret + 4; f++) {
        const pc = (((open + f) % 12) + 12) % 12
        if (pcs.has(pc)) candidates.push(f)
      }
      if (candidates.length === 0) {
        positions[s] = null
        mutedCount++
        continue
      }

      let pick
      if (!hasBass) {
        const bm = candidates.find((f) => (((open + f) % 12) + 12) % 12 === bassPc)
        if (bm != null) {
          pick = bm
          hasBass = true
          bassString = s
        } else pick = candidates[0]
      } else {
        pick = candidates[0]
      }
      positions[s] = pick
      if (pick > 0) {
        if (lowestFretted == null || pick < lowestFretted) lowestFretted = pick
        if (pick > highestFretted) highestFretted = pick
      }
    }

    if (mutedCount > 3) continue
    const span = lowestFretted == null ? 0 : highestFretted - lowestFretted
    if (span > 4) continue
    let firstSounded = -1
    for (let s = 0; s < 6; s++)
      if (positions[s] != null) {
        firstSounded = s
        break
      }

    const score =
      mutedCount * 3 +
      baseFret * 0.3 +
      (hasBass ? 0 : 6) +
      (hasBass && firstSounded !== bassString ? 3 : 0)
    if (!best || score < best.score) {
      best = { positions, baseFret, mutedCount, hasBass, bassString, score }
    }
  }
  return best
}

export function drawWaveform(canvas, buffer, opts = {}) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext("2d")
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  const stroke = opts.stroke || "#1a73e8"
  const mid = h / 2
  let raw
  if (buffer && buffer.getChannelData) raw = buffer.getChannelData(0)
  else if (buffer && buffer.get && buffer.get().getChannelData)
    raw = buffer.get().getChannelData(0)
  else return

  const samples = raw.length
  const buckets = Math.max(64, Math.floor(w * 1.0))
  const step = samples / buckets
  ctx.fillStyle = stroke
  const barW = Math.max(1, w / buckets - 0.5)
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * step)
    const end = Math.floor((i + 1) * step)
    let min = 1,
      max = -1
    for (let j = start; j < end; j++) {
      const v = raw[j]
      if (v < min) min = v
      if (v > max) max = v
    }
    const y1 = mid + min * (h * 0.45)
    const y2 = mid + max * (h * 0.45)
    ctx.fillRect(i * (w / buckets), y1, barW, Math.max(1, y2 - y1))
  }
  ctx.strokeStyle = opts.midline || "rgba(0,0,0,0.06)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, mid)
  ctx.lineTo(w, mid)
  ctx.stroke()
}

export function bufferDuration(buffer) {
  if (!buffer) return 0
  if (typeof buffer.duration === "number" && buffer.duration > 0) return buffer.duration
  const ab = buffer.get ? buffer.get() : buffer
  return ab && ab.duration ? ab.duration : 0
}

export function bufferToObjectUrl(buffer) {
  return URL.createObjectURL(bufferToWav(buffer))
}

// --- WAV encoder --------------------------------------------------------

export function bufferToWav(buffer) {
  const ab = buffer && buffer.get ? buffer.get() : buffer
  const numCh = ab.numberOfChannels
  const sampleRate = ab.sampleRate
  const len = ab.length
  const bytesPerSample = 2
  const dataSize = len * numCh * bytesPerSample
  const out = new ArrayBuffer(44 + dataSize)
  const view = new DataView(out)

  function writeString(off, s) {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numCh * bytesPerSample, true)
  view.setUint16(32, numCh * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeString(36, "data")
  view.setUint32(40, dataSize, true)

  const channels = []
  for (let i = 0; i < numCh; i++) channels.push(ab.getChannelData(i))
  let offset = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]))
      s = s < 0 ? s * 0x8000 : s * 0x7fff
      view.setInt16(offset, s, true)
      offset += 2
    }
  }
  return new Blob([out], { type: "audio/wav" })
}

export function downloadWav(buffer, filename) {
  const blob = bufferToWav(buffer)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename || "composition.wav"
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 0)
}
