/* Music engine: parses music cells (see language.js) and renders them to audio with
   Tone.js, plus waveform drawing and WAV export. */
import * as Tone from "tone"
import * as ChordLookup from "./chord-lookup.js"
import * as Drums from "./drums.js"
import { midiToName } from "./chords.js"
import { initialState, parseCell } from "./language.js"

export { midiToName, parseKey, buildChord } from "./chords.js"
export { initialState } from "./language.js"

// Parses one music cell. `inherited` is the state (settings and words) left by the cells
// above it; the result's `state` is what this cell hands on to the cells below.
export function parseSource(src, inherited) {
  return parseCell(src, inherited)
}

// Parses the last of `sources`, starting from the settings and words the earlier ones
// ended with. Only the last one plays; the Jupyter widget uses this for
// `%%music verse after intro`, where the link is by name rather than by position.
export function parseChain(sources) {
  let state = initialState()
  for (const src of sources.slice(0, -1)) state = parseCell(src, state).state
  return parseCell(sources[sources.length - 1] ?? "", state)
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
  const chordEvents = parsed.events.filter((ev) => ev.chord)

  // For guitar, swap Tonal's compact voicing for the chord-db's idiomatic
  // voicing so the audio matches the diagram AND the actual pitches a real
  // guitar produces at those frets (Cadd9 = C3 E3 G3 D4 E4, low E open = E2).
  // Bass becomes the lowest fretted string and the artificial -12 doubling is
  // suppressed — both pushed the chord below playable guitar range.
  if (chordEvents.some((ev) => ev.instrument === "guitar")) {
    try {
      await ChordLookup.load()
      for (const ev of chordEvents) {
        if (ev.instrument !== "guitar") continue
        const pos = ChordLookup.lookupPosition(ev.chord.label)
        if (!pos?.midi?.length) continue
        const voicing = pos.midi.map((m) => m + (ev.capo || 0))
        ev.chord = {
          ...ev.chord,
          notesMidi: voicing,
          noteNames: voicing.map(midiToName),
          bassMidi: voicing[0],
          bassName: midiToName(voicing[0]),
          fromGuitarPosition: true,
        }
      }
    } catch (_) {
      // chord-db failed to load — fall back to Tonal voicing.
    }
  }

  const drumKit = parsed.drumEvents.length ? await Drums.prepareKit(parsed.drumEvents) : null
  parsed.warnings = drumKit?.missing.length
    ? ["Couldn't load the recorded drum kit, so the drums use synthesized sounds"]
    : []

  const totalSec = Math.max(1.0, parsed.totalSec + 1.8)
  const buffer = await Tone.Offline(
    async () => {
      const master = new Tone.Limiter(-1).toDestination()
      const synths = {}
      for (const inst of new Set(chordEvents.map((ev) => ev.instrument))) {
        const reverb = new Tone.Reverb({
          decay: 2.2,
          wet: inst === "guitar" || inst === "piano" ? 0.14 : 0.18,
        })
        await reverb.generate()
        reverb.connect(master)
        synths[inst] = makeSynth(Tone, inst)
        synths[inst].connect(reverb)
      }
      if (drumKit) await Drums.schedule(drumKit, parsed.drumEvents, master)

      await Tone.loaded()

      for (const ev of chordEvents) playChord(synths[ev.instrument], ev)
    },
    totalSec,
    2,
    Tone.getContext().sampleRate,
  )

  return trimSilence(buffer, parsed.totalSec)
}

// The render runs on past the music so reverb and long notes can ring out, but
// short drum hits leave most of that tail silent. Cut it once the sound has faded
// well below the loudest moment, never before the music's own end, so a cell ending
// on a rest keeps its length. A short fade-out keeps the cut from clicking.
function trimSilence(buffer, musicSec) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  let peak = 0
  for (const ch of channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]))
  const threshold = peak * 0.01 // 40 dB below the peak: inaudible under the music
  let last = Math.ceil(musicSec * buffer.sampleRate)
  for (let i = buffer.length - 1; i > last; i--) {
    if (channels.some((ch) => Math.abs(ch[i]) > threshold)) {
      last = i
      break
    }
  }
  const fade = Math.round(0.05 * buffer.sampleRate)
  const end = last + fade
  if (end >= buffer.length) return buffer
  for (const ch of channels) for (let i = last; i < end; i++) ch[i] *= (end - i) / fade
  return buffer.slice(0, end / buffer.sampleRate)
}

function playChord(synth, ev) {
  const inst = ev.instrument
  const stagger = inst === "guitar" ? 0.012 : inst === "pad" ? 0.05 : inst === "organ" ? 0 : 0.008
  const bassVel = inst === "guitar" ? 0.6 : 0.7
  const chordVel = 0.55
  const dur = ev.secDur * 0.96
  const usingPos = ev.chord.fromGuitarPosition
  if (!usingPos) {
    synth.triggerAttackRelease(midiToName(ev.chord.bassMidi), dur, ev.secStart, bassVel)
    if (inst === "guitar" && ev.chord.notesMidi[0]) {
      synth.triggerAttackRelease(
        midiToName(ev.chord.notesMidi[0] - 12),
        dur,
        ev.secStart + 0.006,
        bassVel * 0.85,
      )
    }
  }
  ev.chord.noteNames.forEach((n, idx) => {
    // When using a real guitar position the lowest note IS the bass, so
    // start the strum at the very beginning and give it a small velocity
    // bump; otherwise stagger the chord notes after the separate bass hit.
    const offset = usingPos ? idx * stagger : (idx + 1) * stagger
    const vel = usingPos && idx === 0 ? bassVel : chordVel
    synth.triggerAttackRelease(n, dur, ev.secStart + offset, vel)
  })
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

  // `normalize` scales the loudest sample to full height, so quiet
  // instruments (guitar, pad) still draw a readable shape.
  let gain = 1
  if (opts.normalize) {
    let peak = 0
    for (let j = 0; j < raw.length; j++) peak = Math.max(peak, Math.abs(raw[j]))
    if (peak > 0) gain = 1 / peak
  }

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
    const y1 = mid + min * gain * (h * 0.45)
    const y2 = mid + max * gain * (h * 0.45)
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
