/* Guitar chord positions from @tombatossals/chords-db (loaded at runtime). */
;(function () {
  const CHORDS_DB_URL =
    "https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@0.5.1/lib/guitar.json"

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
    o: "dim",
    "°": "dim",
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
    o7: "dim7",
    "°7": "dim7",
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

  function load() {
    if (db) return Promise.resolve(db)
    return fetch(CHORDS_DB_URL)
      .then((res) => {
        if (!res.ok) throw new Error("chords-db " + res.status)
        return res.json()
      })
      .then((data) => {
        db = data
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

  function pickPosition(positions) {
    if (!positions?.length) return null
    let best = positions[0]
    let bestScore = -Infinity
    for (const p of positions) {
      const score = scorePosition(p)
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
    return { frets, fingers, baseFret, barres }
  }

  function positionFromEntry(entry) {
    if (!entry?.positions?.length) return null
    return exportPosition(pickPosition(entry.positions))
  }

  function maxAbsoluteFret(position) {
    const played = position.frets.filter((f) => f > 0)
    if (!played.length) return 0
    const base = position.baseFret || 1
    return Math.max(...played.map((f) => absFret(f, base)))
  }

  function symbolToSuffix(symbol) {
    if (!symbol || typeof Tonal === "undefined") return null
    const ch = Tonal.Chord.get(symbol)
    if (ch.empty) return null
    for (const alias of ch.aliases || []) {
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
    const parts = label.split("/")
    const head = parts[0]
    const slash = parts[1]

    if (typeof Tonal !== "undefined") {
      const ch = Tonal.Chord.get(head)
      if (!ch.empty && ch.tonic) {
        let suffix = symbolToSuffix(head)
        if (!suffix) return null
        if (slash) {
          const slashPc = Tonal.Note.get(slash).pc || slash
          if (db.suffixes.includes("/" + slashPc)) suffix = "/" + slashPc
          else if (
            db.suffixes.includes("m/" + slashPc) &&
            (head.includes("m") || head.includes("min"))
          )
            suffix = "m/" + slashPc
        }
        return { key: ch.tonic, suffix }
      }
    }

    const m = /^([A-G][#b]?)(.*)$/.exec(head)
    if (!m) return null
    const key = m[1]
    const rest = m[2] || ""
    let suffix = "major"
    if (rest === "m" || rest === "min") suffix = "minor"
    else if (rest) suffix = rest.replace(/^maj/, "maj")
    if (slash) {
      const slashPc =
        typeof Tonal !== "undefined"
          ? Tonal.Note.get(slash).pc || slash
          : slash
      if (suffix === "minor") suffix = "m/" + slashPc
      else suffix = "/" + slashPc
    }
    return { key, suffix }
  }

  function lookupPosition(label) {
    if (!db || !label) return null
    if (positionCache.has(label)) return positionCache.get(label)

    const ks = resolveKeySuffix(label)
    if (!ks) {
      positionCache.set(label, null)
      return null
    }

    const dbKey = KEY_ALIASES[ks.key] || ks.key
    const entry = chordEntryFor(dbKey, ks.suffix)
    let pos = positionFromEntry(entry)

    if (!pos && typeof Tonal !== "undefined") {
      const ch = Tonal.Chord.get(label.split("/")[0])
      for (const alias of ch.aliases || []) {
        const tryLabel =
          label.includes("/") && !alias.includes("/")
            ? alias + label.slice(label.indexOf("/"))
            : alias
        const alt = resolveKeySuffix(tryLabel)
        if (!alt) continue
        const altKey = KEY_ALIASES[alt.key] || alt.key
        pos = positionFromEntry(chordEntryFor(altKey, alt.suffix))
        if (pos) break
      }
    }

    positionCache.set(label, pos)
    return pos
  }

  function lookupBySymbol(symbol) {
    return lookupPosition(symbol)
  }

  function isBrowserChordLabel(label) {
    if (!/^[A-G][#b]?/.test(label)) return false
    const parts = label.split("/")
    if (parts.length > 2) return false
    if (parts.length === 2) {
      const bass = parts[1]
      if (!/^[A-G][#b]?$/.test(bass)) return false
      const root = parts[0].match(/^[A-G][#b]?/)[0]
      if (bass === root) return false
    }
    return true
  }

  function buildCatalog() {
    if (!db) return []
    const items = []
    for (const key of db.keys) {
      const list = chordListForKey(key)
      if (!list) continue
      for (const entry of list) {
        if (!entry?.suffix) continue
        const label = labelFromKeySuffix(key, entry.suffix)
        if (!isBrowserChordLabel(label)) continue
        const position = positionFromEntry(entry)
        if (!position) continue
        if (maxAbsoluteFret(position) > 12) continue
        items.push({ label, position })
      }
    }
    return items
  }

  window.ChordLookup = {
    load,
    lookupPosition,
    lookupBySymbol,
    buildCatalog,
  }
})()
