/* Drums for offline renders. kit: rock plays recorded samples (Hydrogen's GMRockKit,
   GPL-3, fetched on demand); kit: synth, or any sample that fails to load, uses a
   synthesized kit instead. */
import * as Tone from "tone"

const SAMPLES =
  "https://cdn.jsdelivr.net/gh/hydrogen-music/hydrogen@1.2.4/data/drumkits/GMRockKit/"
const FILES = {
  kick: "Kick",
  snare: "Snare",
  "snare rim": "SnareRimshot",
  hat: "HatClosed",
  "hat open": "HatOpen",
  "hat pedal": "HatPedal",
  ride: "Ride",
  "ride bell": "Bell",
  crash: "Crash",
  "tom high": "Tom1",
  "tom low": "Tom2",
  "tom floor": "TomFloor",
}
// [level, pan]: hats and crash to the left, ride and floor tom to the right, the toms
// stepping from left to right as they get lower (drummer's view).
const MIX = {
  kick: [1, 0],
  snare: [0.8, 0.05],
  hat: [0.42, -0.3],
  ride: [0.45, 0.35],
  crash: [0.5, -0.25],
  "tom high": [0.75, -0.15],
  "tom low": [0.75, 0.1],
  "tom floor": [0.8, 0.3],
}
const loading = new Map()

const layer = (vel) => (vel < 0.45 ? "Soft" : vel < 0.85 ? "Med" : "Hard")
// How loud a hit is next to a normal one (velocity 0.7). Squared, like MIDI's usual
// velocity curve, so an accent (1) is about 6 dB louder and a ghost note (0.3) about
// 15 dB softer: far enough apart to hear.
const loudness = (vel) => (vel / 0.7) ** 2
const sampleName = (ev) => (FILES[ev.inst + " " + ev.art] || FILES[ev.inst]) + "-" + layer(ev.vel)
// Where a hit sits in the mix: its own sound's place if it has one (each tom), else its drum's.
const mixKey = (ev) => (MIX[ev.inst + " " + ev.art] ? ev.inst + " " + ev.art : ev.inst)

// Fetched by hand: ToneAudioBuffer.fromUrl encodes the "@" in the CDN path, which the CDN
// rejects.
async function fetchSample(name) {
  const res = await fetch(SAMPLES + name + ".wav")
  if (!res.ok) throw new Error(`${name}: ${res.status}`)
  const audio = await Tone.getContext().decodeAudioData(await res.arrayBuffer())
  return new Tone.ToneAudioBuffer(audio)
}

function load(name) {
  if (!loading.has(name)) {
    const pending = fetchSample(name).catch(() => {
      loading.delete(name) // try again next render
      return null
    })
    loading.set(name, pending)
  }
  return loading.get(name)
}

// Fetches every sample the events need (in the online context, before rendering).
// `missing` lists samples that couldn't load; those hits use the synthesized kit.
export async function prepareKit(events) {
  const names = [...new Set(events.filter((ev) => ev.kit !== "synth").map(sampleName))]
  const buffers = {}
  await Promise.all(
    names.map(async (n) => {
      buffers[n] = await load(n)
    }),
  )
  return { buffers, missing: names.filter((n) => !buffers[n]) }
}

function makeSynthKit(output) {
  const highpass = (freq) => new Tone.Filter(freq, "highpass").connect(output)
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.45, sustain: 0 },
  }).connect(output)
  const toms = new Tone.MembraneSynth({
    pitchDecay: 0.08,
    octaves: 2.5,
    envelope: { attack: 0.001, decay: 0.4, sustain: 0 },
  }).connect(output)
  const snare = new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.16, sustain: 0 } })
  snare.connect(highpass(1200))
  // The rim's ring, which a rimshot adds to the snare
  const rim = new Tone.MembraneSynth({
    pitchDecay: 0.01,
    octaves: 1,
    envelope: { attack: 0.001, decay: 0.08, sustain: 0 },
  }).connect(output)
  const hat = new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.05, sustain: 0 } })
  hat.connect(highpass(7500))
  // A short release, so the next hi-hat hit can close it
  const openHat = new Tone.NoiseSynth({
    envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.03 },
  })
  openHat.connect(highpass(7000))
  const cymbal = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 1.4, release: 0.2 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  }).connect(output)
  const bell = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.9, release: 0.2 },
    harmonicity: 3.1,
    modulationIndex: 8,
    resonance: 6000,
    octaves: 0.8,
  }).connect(output)
  kick.volume.value = -4
  toms.volume.value = -6
  snare.volume.value = -10
  rim.volume.value = -14
  hat.volume.value = -20
  openHat.volume.value = -20
  cymbal.volume.value = -24
  bell.volume.value = -20

  // Plays one hit; returns a function that chokes it (used for the open hi-hat).
  return function play(ev, time, vel) {
    if (ev.inst === "kick") kick.triggerAttackRelease("C1", 0.3, time, vel)
    else if (ev.inst === "tom" && ev.art === "high") toms.triggerAttackRelease("G2", 0.3, time, vel)
    else if (ev.inst === "tom" && ev.art === "low") toms.triggerAttackRelease("E2", 0.35, time, vel)
    else if (ev.inst === "tom") toms.triggerAttackRelease("C2", 0.4, time, vel)
    else if (ev.inst === "snare" && ev.art === "rim") {
      snare.triggerAttackRelease(0.15, time, vel)
      rim.triggerAttackRelease("A5", 0.08, time, vel)
    }
    else if (ev.inst === "snare") snare.triggerAttackRelease(0.15, time, vel)
    else if (ev.inst === "crash") cymbal.triggerAttackRelease(300, 1.5, time, vel)
    else if (ev.inst === "ride" && ev.art === "bell") bell.triggerAttackRelease(900, 0.5, time, vel)
    else if (ev.inst === "ride") cymbal.triggerAttackRelease(400, 0.5, time, vel * 0.7)
    else if (ev.art === "open") {
      openHat.triggerAttackRelease(0.4, time, vel)
      return (t) => openHat.triggerRelease(t)
    } else hat.triggerAttackRelease(ev.art === "pedal" ? 0.02 : 0.04, time, vel * (ev.art === "pedal" ? 0.6 : 1))
    return null
  }
}

// Schedules every hit inside a Tone.Offline callback. Events must be in time order.
export async function schedule(kit, events, output) {
  const bus = new Tone.Gain(0.9).connect(output)
  const room = new Tone.Reverb({ decay: 1.1, preDelay: 0.004 })
  await room.generate()
  room.connect(output)
  bus.connect(new Tone.Gain(0.12).connect(room))

  const channels = {}
  const channel = (key) => (channels[key] ||= new Tone.Panner(MIX[key][1]).connect(bus))
  let synth = null
  let openHat = null
  for (const ev of events) {
    // A little human looseness in timing and force.
    const time = Math.max(0, ev.secStart + (Math.random() - 0.5) * 0.006)
    const vel = Math.min(1, ev.vel * (0.95 + Math.random() * 0.1))
    // The next hi-hat hit closes an open one, like a real hi-hat.
    if (ev.inst === "hat" && openHat && time > openHat.time) {
      openHat.choke(time)
      openHat = null
    }
    const buffer = ev.kit !== "synth" ? kit.buffers[sampleName(ev)] : null
    let choke = null
    if (buffer) {
      const key = mixKey(ev)
      const gain = new Tone.Gain(MIX[key][0] * loudness(vel)).connect(channel(key))
      const src = new Tone.ToneBufferSource({ url: buffer, fadeOut: 0.03 }).connect(gain)
      src.start(time)
      choke = (t) => src.stop(t)
    } else {
      synth ||= makeSynthKit(bus)
      choke = synth(ev, time, 0.7 * loudness(vel))
    }
    if (ev.inst === "hat" && ev.art === "open" && choke) openHat = { time, choke }
  }
}
