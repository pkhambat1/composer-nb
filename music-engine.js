/* Music DSL parser + chord builder + Tone.js offline renderer + waveform draw + WAV export.
   Exposed via window.MusicEngine.

   Grammar:
     - `--` begins a comment (rest of line ignored). Works at line start or mid-line.
     - Lines starting with `@` are directives: @key C, @tempo 96,
       @inst piano|epiano|pad|guitar|bass, @beats 4
     - Other lines: whitespace-separated chord tokens. `|` is a bar separator (visual only).
     - Token forms:
       * Absolute:  Cmaj7, F#m, Bb7, Dm9, G7sus4, Em7b5, Co7, C/E
       * Roman:     I, ii, V7, vi, viio, bVII, Imaj7, V7sus4
       * Rest:      ~
       * Duration suffix:
           .w (whole=4 beats), .h (half=2), .q (quarter=1), .e (eighth=0.5), .s (sixteenth=0.25)
           :N  explicit beats (float ok)
     - Tokens without explicit duration share the remainder of the line evenly across `@beats`.
*/

;(function () {
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

  function midiToName(m) {
    const pc = ((m % 12) + 12) % 12
    const oct = Math.floor(m / 12) - 1
    return PC_TO_NAME[pc] + oct
  }

  const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
  const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]

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

  function parseKey(str) {
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
    // returns { core, beats: number|null }
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
    const isLower = tok.roman === tok.roman.toLowerCase()
    const scale = key.mode === "minor" ? MINOR_SCALE : MAJOR_SCALE
    let pc = (key.tonicPc + scale[degree]) % 12
    pc = applyAccidental(pc, tok.accidental)
    return {
      rootPc: pc,
      suffix: tok.suffix,
      baseQuality: isLower ? "minor" : "major",
      slashBass: tok.slashBass,
    }
  }

  function intervalsFromSuffix(suffix, baseQuality) {
    let s = suffix || ""
    let intervals = baseQuality === "minor" ? [0, 3, 7] : [0, 4, 7]

    if (/^(o|°|dim)/i.test(s)) {
      intervals = [0, 3, 6]
      s = s.replace(/^(o|°|dim)/i, "")
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
    const isDim7 = /(o|°|dim)7/i.test(suffix)
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
    return rootName + qual + (tok.suffix || "")
  }

  function buildChordWithTonal(symbol, slashBass, oct, tokenStr, rootPcFallback) {
    if (typeof Tonal === "undefined") return null
    const ch = Tonal.Chord.get(symbol)
    if (ch.empty || !ch.intervals.length) return null

    const tonicPc =
      ch.tonic != null && ch.tonic !== ""
        ? Tonal.Note.chroma(ch.tonic)
        : rootPcFallback
    if (tonicPc == null || isNaN(tonicPc)) return null

    let bass = (oct + 1) * 12 + tonicPc - 12
    if (slashBass) {
      const m = /^([A-Ga-g])([#b]?)$/.exec(slashBass)
      if (!m) return null
      const b = Tonal.Note.get(m[1].toUpperCase() + m[2])
      if (b.empty || b.chroma == null) return null
      bass = (oct + 1) * 12 + b.chroma - 12
    }

    const rootMidi = (oct + 1) * 12 + tonicPc
    let voicing = ch.intervals.map((iv) => rootMidi + Tonal.Interval.semitones(iv))
    while (voicing.length > 1 && voicing[voicing.length - 1] - voicing[0] > 24) voicing.pop()

    const label =
      ch.symbol + (slashBass ? "/" + slashBass : "")

    return {
      input: tokenStr,
      label,
      rootPc: tonicPc,
      bassMidi: bass,
      notesMidi: voicing,
      noteNames: voicing.map((m) => Tonal.Note.fromMidi(m) || midiToName(m)),
      bassName: Tonal.Note.fromMidi(bass) || midiToName(bass),
    }
  }

  function buildChord(tokenStr, key, octave) {
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

    // Bass: one octave below chord octave
    let bass = (oct - 1 + 1) * 12 + resolved.rootPc
    if (resolved.slashBass) {
      // Strict note-name validation: letter A–G, optional single # or b
      const m = /^([A-Ga-g])([#b]?)$/.exec(resolved.slashBass)
      if (!m) return null
      const pc = NOTE_TO_PC[m[1].toUpperCase() + m[2]]
      if (pc == null) return null
      bass = (oct - 1 + 1) * 12 + pc
    }

    // Chord voicing: built from the chord octave upward
    const rootMidi = (oct + 1) * 12 + resolved.rootPc
    let voicing = intervals.map((iv) => rootMidi + iv)
    while (voicing.length > 1 && voicing[voicing.length - 1] - voicing[0] > 24) voicing.pop()

    const rootName = PC_TO_NAME[resolved.rootPc]
    let qualityLabel = ""
    if (intervals.includes(3) && intervals.includes(6)) qualityLabel = "°"
    else if (intervals.includes(3)) qualityLabel = "m"
    else if (intervals.includes(8) && intervals.includes(4)) qualityLabel = "+"
    const suffixLabel = (resolved.suffix || "")
      .replace(/^m(in)?(?!aj)/i, "")
      .replace(/^maj/i, "maj")
      .replace(/^o|^°|^dim/i, "")
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

  function parseSource(src) {
    const directives = {
      kind: "chord",
      key: "C",
      tempo: 96,
      inst: "piano",
      beats: 4,
      steps: 16,
      octave: 3,
    }
    const errors = []
    const lines = src.split("\n")

    // First pass: extract directives
    for (let li = 0; li < lines.length; li++) {
      const raw = lines[li]
      const line = raw.split("--")[0].trim()
      if (!line) continue
      if (line.startsWith("@")) {
        const m = /^@(\w+)\s+(.+)$/.exec(line)
        if (m) {
          const k = m[1].toLowerCase()
          const v = m[2].trim()
          if (k === "kind") directives.kind = /^(drum|beat)/i.test(v) ? "drums" : "chord"
          else if (k === "key") directives.key = v
          else if (k === "tempo" || k === "bpm") directives.tempo = parseFloat(v) || 96
          else if (k === "inst" || k === "instrument") directives.inst = v.toLowerCase()
          else if (k === "beats") directives.beats = parseFloat(v) || 4
          else if (k === "steps") directives.steps = parseInt(v, 10) || 16
          else if (k === "octave" || k === "oct") {
            const n = parseInt(v, 10)
            if (!isNaN(n) && n >= 0 && n <= 8) directives.octave = n
            else errors.push({ line: li + 1, token: v, msg: `@octave must be 0–8 (got "${v}")` })
          }
        }
      }
    }

    if (directives.kind === "drums") return parseDrumSource(src, directives)

    const key = parseKey(directives.key)
    const bars = []

    // Second pass: collect chord lines
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

      // Distribute beats across the line (default total = @beats)
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

    // Build flat events list with beat + second timing
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

    const totalBeats = beatCursor
    const totalSec = totalBeats * beatSec
    const chords = events.filter((e) => e.chord && !e.isError)

    return { kind: "chord", directives, key, bars, events, chords, totalBeats, totalSec, errors }
  }

  // --- Drum source parser --------------------------------------------------

  const DRUM_ALIASES = {
    bd: "bd",
    kick: "bd",
    k: "bd",
    sd: "sd",
    snare: "sd",
    sn: "sd",
    s: "sd",
    hh: "hh",
    hat: "hh",
    ch: "hh",
    h: "hh",
    oh: "oh",
    open: "oh",
    cp: "cp",
    clap: "cp",
    cy: "cy",
    cym: "cy",
    cymbal: "cy",
    rd: "rd",
    ride: "rd",
    tm: "tm",
    tom: "tm",
    lt: "tm",
    mt: "tm",
    ht: "tm",
    rs: "rs",
    rim: "rs",
  }
  const DRUM_DISPLAY = {
    bd: "kick",
    sd: "snare",
    hh: "hat",
    oh: "open hat",
    cp: "clap",
    cy: "cymbal",
    rd: "ride",
    tm: "tom",
    rs: "rim",
  }
  const DRUM_ORDER = ["bd", "sd", "cp", "rs", "tm", "hh", "oh", "rd", "cy"]

  function parseDrumSource(src, directives) {
    const lines = src.split("\n")
    const lanesRaw = [] // {drum, events: [{isRest, beats, beatStart}], line}
    const errors = []

    const LETTER_DUR = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 }

    for (let li = 0; li < lines.length; li++) {
      const raw = lines[li]
      const noComment = raw.split("--")[0]
      if (!noComment.trim() || noComment.trim().startsWith("@")) continue

      const m = /^(\s*)(\w+)\s*:\s*(.+)$/.exec(noComment)
      if (!m) continue
      const name = m[2].toLowerCase()
      const drum = DRUM_ALIASES[name]
      if (!drum) {
        errors.push({
          line: li + 1,
          token: name,
          msg: `unknown drum "${name}" (try bd, sd, hh, oh, cp, cy, rd, tm, rs)`,
        })
        continue
      }
      const patternStr = m[3].trim()
      const tokens = patternStr.split(/\s+/)

      // Token mode if any token has a digit or a dot — otherwise legacy grid mode
      const tokenMode = tokens.some((t) => /\d/.test(t) || /\.[whqes]/i.test(t))

      const events = []
      if (tokenMode) {
        let cursor = 0
        for (const tok of tokens) {
          let isRest = false
          let core = tok
          if (core.startsWith("~")) {
            isRest = true
            core = core.slice(1)
          } else if (/^r/i.test(core) && core.length > 1) {
            isRest = true
            core = core.slice(1)
          }
          core = core.replace(/^x/i, "").replace(/^\./, "")
          let beats = 1
          if (/^\d+(\.\d+)?$/.test(core)) {
            const denom = parseFloat(core)
            if (denom > 0) beats = 4 / denom
          } else if (/^[whqes]$/i.test(core)) {
            beats = LETTER_DUR[core.toLowerCase()]
          } else if (core === "") {
            beats = 1 // bare 'x' or '~' = quarter
          } else {
            errors.push({ line: li + 1, token: tok, msg: `bad duration in "${tok}"` })
            continue
          }
          events.push({ isRest, beats, beatStart: cursor })
          cursor += beats
        }
      } else {
        // Legacy grid mode: each char/token is a step in @beats divided evenly
        const stepCount = tokens.length
        const beatsPerStep = directives.beats / stepCount
        tokens.forEach((tok, i) => {
          const isHit = tok === "x" || tok === "X" || tok === "#" || tok === "o" || tok === "O"
          events.push({ isRest: !isHit, beats: beatsPerStep, beatStart: i * beatsPerStep })
        })
      }
      lanesRaw.push({ drum, events, line: li + 1 })
    }

    // Merge duplicate lanes (same drum, multiple lines)
    const mergedMap = {}
    for (const lane of lanesRaw) {
      if (!mergedMap[lane.drum])
        mergedMap[lane.drum] = { drum: lane.drum, events: [...lane.events] }
      else mergedMap[lane.drum].events.push(...lane.events)
    }
    const merged = Object.values(mergedMap)

    // Total beats = max end of any event
    let totalBeats = 0
    for (const lane of merged) {
      for (const ev of lane.events) totalBeats = Math.max(totalBeats, ev.beatStart + ev.beats)
    }

    const beatSec = 60 / directives.tempo
    const renderedEvents = []
    for (const lane of merged) {
      for (const ev of lane.events) {
        if (ev.isRest) continue
        renderedEvents.push({
          type: "drum",
          drum: lane.drum,
          displayName: DRUM_DISPLAY[lane.drum] || lane.drum,
          beatStart: ev.beatStart,
          beats: ev.beats,
          secStart: ev.beatStart * beatSec,
          secDur: ev.beats * beatSec,
        })
      }
    }

    // Visualization grid: 16th notes
    const gridSubdiv = 4
    const gridSteps = Math.max(1, Math.round(totalBeats * gridSubdiv))
    const lanesViz = merged.map((lane) => {
      const hits = []
      for (const ev of lane.events) {
        if (ev.isRest) continue
        hits.push(Math.round(ev.beatStart * gridSubdiv))
      }
      return {
        drum: lane.drum,
        displayName: DRUM_DISPLAY[lane.drum] || lane.drum,
        hits: Array.from(new Set(hits)).sort((a, b) => a - b),
        totalSteps: gridSteps,
      }
    })

    const orderedLanes = DRUM_ORDER.filter((d) => lanesViz.find((l) => l.drum === d))
      .map((d) => lanesViz.find((l) => l.drum === d))
      .concat(lanesViz.filter((l) => !DRUM_ORDER.includes(l.drum)))

    return {
      kind: "drums",
      directives,
      lanes: orderedLanes,
      events: renderedEvents,
      totalBeats,
      totalSec: totalBeats * beatSec,
      errors,
      chords: [],
      stepsPerBar: gridSteps,
      beatsPerBar: directives.beats,
      totalSteps: gridSteps,
    }
  }

  // --- Synths --------------------------------------------------------------

  function makeSynth(Tone, kind) {
    if (kind === "piano") {
      // Salamander Grand Piano — real recorded samples
      const s = new Tone.Sampler({
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
      const s = new Tone.PolySynth(Tone.FMSynth, {
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
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.8, decay: 0.4, sustain: 0.8, release: 2.0 },
      })
      s.volume.value = -16
      return s
    }
    if (kind === "guitar") {
      // MusyngKite steel-string — higher quality than FluidR3
      const s = new Tone.Sampler({
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
      const s = new Tone.PolySynth(Tone.MonoSynth, {
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
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsine", count: 3, spread: 12 },
        envelope: { attack: 0.02, decay: 0.0, sustain: 1.0, release: 0.4 },
      })
      s.volume.value = -12
      return s
    }
    // fallback synth piano (used only if 'piano' samples fail)
    const s = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2,
      modulationIndex: 5,
      envelope: { attack: 0.003, decay: 0.6, sustain: 0.1, release: 1.4 },
      modulation: { type: "triangle" },
      modulationEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.0, release: 0.4 },
    })
    s.volume.value = -10
    return s
  }

  // --- Drum kit ------------------------------------------------------------

  function makeDrumKit(Tone) {
    const all = []
    const t = {}

    const bd = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.4 },
    })
    bd.volume.value = -4
    all.push(bd)
    t.bd = (time, vel = 1) => bd.triggerAttackRelease("C1", 0.3, time, vel)

    const sdNoise = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.13, sustain: 0 },
    })
    sdNoise.volume.value = -10
    const sdBody = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 1,
      envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
    })
    sdBody.volume.value = -16
    all.push(sdNoise, sdBody)
    t.sd = (time, vel = 1) => {
      sdNoise.triggerAttackRelease(0.12, time, vel)
      sdBody.triggerAttackRelease("A3", 0.08, time, vel)
    }

    const hh = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    })
    hh.volume.value = -18
    all.push(hh)
    t.hh = (time, vel = 1) => hh.triggerAttackRelease(0.04, time, vel * 0.7)

    const oh = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0 },
    })
    oh.volume.value = -18
    all.push(oh)
    t.oh = (time, vel = 1) => oh.triggerAttackRelease(0.3, time, vel * 0.55)

    const cp = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0 },
    })
    cp.volume.value = -10
    all.push(cp)
    t.cp = (time, vel = 1) => cp.triggerAttackRelease(0.12, time, vel)

    const tm = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 3,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0 },
    })
    tm.volume.value = -10
    all.push(tm)
    t.tm = (time, vel = 1) => tm.triggerAttackRelease("D3", 0.2, time, vel)

    const cy = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.6, sustain: 0 },
    })
    cy.volume.value = -22
    all.push(cy)
    t.cy = (time, vel = 1) => cy.triggerAttackRelease(0.5, time, vel * 0.5)

    const rd = new Tone.MetalSynth({
      frequency: 250,
      envelope: { attack: 0.001, decay: 0.4, release: 0.1 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    })
    rd.volume.value = -22
    all.push(rd)
    t.rd = (time, vel = 1) => rd.triggerAttackRelease("C4", 0.3, time, vel * 0.5)

    const rs = new Tone.MembraneSynth({
      pitchDecay: 0.005,
      octaves: 1,
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    })
    rs.volume.value = -8
    all.push(rs)
    t.rs = (time, vel = 1) => rs.triggerAttackRelease("G3", 0.05, time, vel)

    return {
      trigger: t,
      connect(node) {
        all.forEach((s) => s.connect(node))
        return this
      },
      toDestination() {
        all.forEach((s) => s.toDestination())
        return this
      },
    }
  }

  async function renderToBuffer(parsed, opts = {}) {
    const Tone = window.Tone
    if (!Tone) throw new Error("Tone.js not loaded")

    if (parsed.kind === "drums") return renderDrumBuffer(parsed)

    const inst = parsed.directives.inst
    // Strum / arpeggiation amount: guitar strums noticeably, piano almost flat.
    const stagger = inst === "guitar" ? 0.012 : inst === "pad" ? 0.05 : inst === "organ" ? 0 : 0.008
    // Bass note relative velocity
    const bassVel = inst === "guitar" ? 0.6 : 0.7
    const chordVel = inst === "guitar" ? 0.55 : 0.55

    const totalSec = Math.max(1.0, parsed.totalSec + 1.6) // tail (longer for piano release)
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

        // Wait for any samplers (piano, guitar) to finish loading
        await Tone.loaded()

        for (const ev of parsed.events) {
          if (ev.isRest || !ev.chord) continue
          const dur = ev.secDur * 0.96
          synth.triggerAttackRelease(midiToName(ev.bassMidi), dur, ev.secStart, bassVel)
          // Guitar: add an octave-doubled root for body
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

  async function renderDrumBuffer(parsed) {
    const Tone = window.Tone
    const totalSec = Math.max(1.0, parsed.totalSec + 0.6)
    const buffer = await Tone.Offline(
      () => {
        const kit = makeDrumKit(Tone)
        kit.toDestination()
        for (const ev of parsed.events) {
          const fn = kit.trigger[ev.drum]
          if (fn) fn(ev.secStart, 1)
        }
      },
      totalSec,
      2,
      Tone.getContext().sampleRate,
    )
    return buffer
  }

  // --- Drum grid drawing --------------------------------------------------

  function drawDrumGrid(canvas, parsed, opts = {}) {
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext("2d")
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const accent = opts.accent || "#1a73e8"
    const accent2 = opts.accent2 || "#9fb8da"
    const gridFg = opts.grid || "rgba(0,0,0,0.08)"
    const labelFg = opts.label || "rgba(0,0,0,0.6)"
    const cellBg = opts.cellBg || "rgba(0,0,0,0.02)"
    const cellBgAlt = opts.cellBgAlt || "rgba(0,0,0,0.05)"

    const lanes = parsed.lanes || []
    const totalSteps = parsed.totalSteps || 16
    const stepsPerBeat = parsed.directives.steps / parsed.directives.beats
    const labelW = 64
    const padTop = 16
    const padBottom = 4
    const gridLeft = labelW
    const gridW = w - labelW - 4
    const gridH = h - padTop - padBottom
    const laneH = lanes.length ? gridH / lanes.length : gridH
    const stepW = gridW / totalSteps

    // Step header (beat numbers)
    ctx.fillStyle = labelFg
    ctx.font = "10px ui-monospace, monospace"
    ctx.textBaseline = "middle"
    ctx.textAlign = "center"
    for (let s = 0; s < totalSteps; s++) {
      if (s % stepsPerBeat === 0) {
        const x = gridLeft + s * stepW + stepW / 2
        ctx.fillText(String(((s / stepsPerBeat) | 0) + 1), x, padTop / 2)
      }
    }

    // Lane rows: backgrounds + labels
    lanes.forEach((lane, li) => {
      const y = padTop + li * laneH
      // Alternating row bg
      ctx.fillStyle = li % 2 === 0 ? cellBg : cellBgAlt
      ctx.fillRect(gridLeft, y, gridW, laneH)

      // Lane label
      ctx.fillStyle = labelFg
      ctx.font = "11px ui-monospace, monospace"
      ctx.textAlign = "right"
      ctx.textBaseline = "middle"
      ctx.fillText(lane.drum, labelW - 8, y + laneH / 2)
    })

    // Vertical grid lines + beat-group emphasis
    for (let s = 0; s <= totalSteps; s++) {
      const x = gridLeft + s * stepW
      const isBeat = s % stepsPerBeat === 0
      ctx.strokeStyle = isBeat ? labelFg : gridFg
      ctx.lineWidth = isBeat ? 0.8 : 0.5
      ctx.globalAlpha = isBeat ? 0.35 : 1
      ctx.beginPath()
      ctx.moveTo(x + 0.5, padTop)
      ctx.lineTo(x + 0.5, padTop + gridH)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Horizontal lines between lanes
    ctx.strokeStyle = gridFg
    ctx.lineWidth = 0.5
    for (let li = 1; li < lanes.length; li++) {
      const y = padTop + li * laneH
      ctx.beginPath()
      ctx.moveTo(gridLeft, y + 0.5)
      ctx.lineTo(gridLeft + gridW, y + 0.5)
      ctx.stroke()
    }

    // Hits
    lanes.forEach((lane, li) => {
      const y = padTop + li * laneH
      const cy = y + laneH / 2
      const hitR = Math.min(laneH * 0.32, stepW * 0.36)
      lane.hits.forEach((stepIdx) => {
        const cx = gridLeft + stepIdx * stepW + stepW / 2
        // Subtle highlight on downbeat hits
        const onBeat = stepIdx % stepsPerBeat === 0
        ctx.fillStyle = onBeat ? accent : accent2
        ctx.beginPath()
        ctx.arc(cx, cy, hitR, 0, Math.PI * 2)
        ctx.fill()
      })
    })
  }

  // --- Pitch-class helpers + chord diagrams -------------------------------

  function pitchClassesOf(chord) {
    const pcs = new Set()
    for (const m of chord.notesMidi) pcs.add(((m % 12) + 12) % 12)
    pcs.add(((chord.bassMidi % 12) + 12) % 12)
    return {
      pcs,
      bassPc: ((chord.bassMidi % 12) + 12) % 12,
      rootPc: chord.rootPc,
    }
  }

  // Standard guitar tuning, low to high: E2 A2 D3 G3 B3 E4
  const GUITAR_TUNING_MIDI = [40, 45, 50, 55, 59, 64]

  // Compute a plausible chord shape on a guitar fretboard.
  // Searches each 5-fret window 0..9 for a fingering that hits chord tones
  // on as many strings as possible, prefers the bass on the lowest sounded
  // string, prefers lower positions, and bails on shapes that mute >3 strings
  // or span >4 frets.
  function computeGuitarFingering(chord) {
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

  function drawWaveform(canvas, buffer, opts = {}) {
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

  // --- Piano roll drawing -------------------------------------------------

  function drawPianoRoll(canvas, parsed, opts = {}) {
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext("2d")
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const accent = opts.accent || "#1a73e8"
    const accent2 = opts.accent2 || "#7aa6ed"
    const gridFg = opts.grid || "rgba(0,0,0,0.06)"
    const labelFg = opts.label || "rgba(0,0,0,0.55)"
    const restFg = opts.rest || "rgba(0,0,0,0.12)"
    const whiteKey = opts.whiteKey || "#fdfdfd"
    const blackKey = opts.blackKey || "#1f1f1f"
    const keyEdge = opts.keyEdge || "#c8c8c8"
    const keyLabel = opts.keyLabel || "#5a5a5a"

    // Determine pitch range from events; clamp to a useful window.
    let lo = 127,
      hi = 0
    for (const ev of parsed.events) {
      if (ev.isRest || !ev.chord) continue
      const all = [ev.bassMidi, ...ev.midiNotes]
      for (const m of all) {
        if (m < lo) lo = m
        if (m > hi) hi = m
      }
    }
    if (lo > hi) {
      lo = 48
      hi = 72
    }
    lo = Math.max(0, lo - 2)
    hi = Math.min(127, hi + 2)
    // Snap to whole octaves at top/bottom for tidy edges
    lo = Math.floor(lo / 12) * 12
    hi = Math.ceil((hi + 1) / 12) * 12 - 1
    const pitchCount = hi - lo + 1

    const keyboardW = 52
    const topPad = 4
    const bottomPad = 14
    const gridLeft = keyboardW
    const gridW = w - keyboardW - 4
    const gridH = h - topPad - bottomPad
    const pitchH = gridH / pitchCount

    const BLACK_PCS = new Set([1, 3, 6, 8, 10])

    // --- Draw keyboard ---
    // White-key background pass (all rows white)
    ctx.fillStyle = whiteKey
    ctx.fillRect(0, topPad, keyboardW, gridH)

    // Separator lines between natural pairs (E-F at pc==4 bottom, B-C at pc==11 bottom)
    ctx.fillStyle = keyEdge
    for (let p = lo; p <= hi; p++) {
      const pc = ((p % 12) + 12) % 12
      const y = topPad + (hi - p) * pitchH
      if (pc === 5 || pc === 0) {
        // top of F (5) and top of C (0) are key boundaries between two whites
        ctx.fillRect(0, y, keyboardW, 0.6)
      }
    }

    // Black-key bars
    for (let p = lo; p <= hi; p++) {
      const pc = ((p % 12) + 12) % 12
      if (!BLACK_PCS.has(pc)) continue
      const y = topPad + (hi - p) * pitchH
      ctx.fillStyle = blackKey
      ctx.fillRect(0, y + 0.5, keyboardW * 0.62, Math.max(1, pitchH - 1))
    }

    // Vertical divider keyboard/grid
    ctx.fillStyle = keyEdge
    ctx.fillRect(keyboardW - 0.5, topPad, 1, gridH)

    // C octave labels
    ctx.fillStyle = keyLabel
    ctx.font = "9px ui-monospace, monospace"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    for (let p = lo; p <= hi; p++) {
      const pc = ((p % 12) + 12) % 12
      if (pc === 0) {
        const y = topPad + (hi - p) * pitchH
        ctx.fillText("C" + (Math.floor(p / 12) - 1), keyboardW - 4, y + pitchH / 2)
      }
    }

    // --- Grid background ---
    // Light striping for black-key rows in the grid area too
    for (let p = lo; p <= hi; p++) {
      const pc = ((p % 12) + 12) % 12
      if (!BLACK_PCS.has(pc)) continue
      const y = topPad + (hi - p) * pitchH
      ctx.fillStyle = gridFg
      ctx.fillRect(gridLeft, y, gridW, pitchH)
    }

    // Bar lines
    const totalBeats = Math.max(1, parsed.totalBeats)
    const beatW = gridW / totalBeats
    const beatsPerBar = parsed.directives.beats
    ctx.strokeStyle = gridFg
    ctx.lineWidth = 1
    for (let b = 0; b <= totalBeats + 0.001; b += beatsPerBar) {
      const x = gridLeft + b * beatW
      ctx.beginPath()
      ctx.moveTo(x + 0.5, topPad)
      ctx.lineTo(x + 0.5, topPad + gridH)
      ctx.stroke()
    }
    // Beat numbers
    ctx.fillStyle = labelFg
    ctx.font = "9px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    for (let b = 0; b <= totalBeats + 0.001; b += beatsPerBar) {
      const x = gridLeft + b * beatW
      ctx.fillText(String(((b / beatsPerBar) | 0) + 1), x, topPad + gridH + 2)
    }

    // Border around grid
    ctx.strokeStyle = gridFg
    ctx.strokeRect(gridLeft + 0.5, topPad + 0.5, gridW, gridH)

    // --- Notes ---
    parsed.events.forEach((ev, idx) => {
      const x = gridLeft + ev.beatStart * beatW
      const wEv = Math.max(2, ev.beats * beatW - 1)
      if (ev.isRest) {
        ctx.fillStyle = restFg
        ctx.fillRect(x + 2, topPad + gridH / 2 - 1, wEv - 4, 2)
        return
      }
      if (!ev.chord) return
      const color = idx % 2 === 0 ? accent : accent2
      ctx.fillStyle = color
      const allNotes = new Set([ev.bassMidi, ...ev.midiNotes])
      const noteHeight = Math.max(1.5, pitchH * 0.78)
      for (const m of allNotes) {
        const y = topPad + (hi - m) * pitchH + (pitchH - noteHeight) / 2
        ctx.fillRect(x, y, wEv, noteHeight)
      }
    })
  }

  function bufferDuration(buffer) {
    if (!buffer) return 0
    if (typeof buffer.duration === "number" && buffer.duration > 0) return buffer.duration
    const ab = buffer.get ? buffer.get() : buffer
    return ab && ab.duration ? ab.duration : 0
  }

  /** Blob URL for WaveSurfer / <audio> playback (caller should revoke when done). */
  function bufferToObjectUrl(buffer) {
    return URL.createObjectURL(bufferToWav(buffer))
  }

  // --- WAV encoder --------------------------------------------------------

  function bufferToWav(buffer) {
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
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, numCh, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numCh * bytesPerSample, true)
    view.setUint16(32, numCh * bytesPerSample, true)
    view.setUint16(34, 16, true)
    writeString(36, "data")
    view.setUint32(40, dataSize, true)

    // Interleave channels
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

  function downloadWav(buffer, filename) {
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

  window.MusicEngine = {
    parseSource,
    buildChord,
    parseKey,
    renderToBuffer,
    drawWaveform,
    bufferDuration,
    midiToName,
    bufferToWav,
    bufferToObjectUrl,
    downloadWav,
    pitchClassesOf,
    computeGuitarFingering,
  }
})()
