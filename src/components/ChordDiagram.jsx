// components/ChordDiagram.jsx — Chord diagrams: guitar fingering grid & piano keyboard
import React from "react"
import * as ChordLookup from "../lib/chord-lookup.js"

function getChordIntervals(chord) {
  const set = new Set()
  ;(chord.notesMidi || []).forEach((m) => set.add((((m - chord.rootPc) % 12) + 12) % 12))
  return set
}

function detectChordQuality(intervals) {
  const has = (n) => intervals.has(n)
  if (!has(3) && !has(4)) {
    if (has(5)) return "sus4"
    if (has(2)) return "sus2"
  }
  const m3 = has(3),
    M3 = has(4)
  const b5 = has(6),
    p5 = has(7),
    s5 = has(8)
  const b7 = has(10),
    M7 = has(11)
  const has6 = has(9)

  if (m3 && b5 && !p5) {
    if (has(9)) return "dim7"
    if (b7) return "m7b5"
    return "dim"
  }
  if (M3 && s5 && !p5) return "aug"
  if (m3) {
    if (M7) return "mM7"
    if (b7) return "m7"
    if (has6) return "m6"
    return "min"
  }
  if (M3) {
    if (M7) return "maj7"
    if (b7) return "7"
    if (has6) return "6"
    return "maj"
  }
  return "maj"
}

const GUITAR_SHAPES = {
  maj: { frets: [0, 2, 2, 1, 0, 0], baseRootPc: 4 },
  min: { frets: [0, 2, 2, 0, 0, 0], baseRootPc: 4 },
  7: { frets: [0, 2, 0, 1, 0, 0], baseRootPc: 4 },
  maj7: { frets: [0, 2, 1, 1, 0, 0], baseRootPc: 4 },
  m7: { frets: [0, 2, 0, 0, 0, 0], baseRootPc: 4 },
  mM7: { frets: [0, 2, 1, 0, 0, 0], baseRootPc: 4 },
  6: { frets: [0, 2, 2, 1, 2, 0], baseRootPc: 4 },
  m6: { frets: [0, 2, 2, 0, 2, 0], baseRootPc: 4 },
  sus4: { frets: [0, 2, 2, 2, 0, 0], baseRootPc: 4 },
  sus2: { frets: [-1, -1, 0, 2, 3, 0], baseRootPc: 2 },
  aug: { frets: [0, 3, 2, 1, 1, 0], baseRootPc: 4 },
  dim: { frets: [-1, -1, 0, 1, 0, 1], baseRootPc: 2 },
  m7b5: { frets: [-1, -1, 0, 1, 1, 1], baseRootPc: 2 },
  dim7: { frets: [-1, -1, 0, 1, 0, 1], baseRootPc: 2 },
}

export const GuitarDiagram = React.memo(function GuitarDiagram({ chord }) {
  const [dbPosition, setDbPosition] = React.useState(chord?.position ?? null)

  React.useEffect(() => {
    if (chord?.position) {
      setDbPosition(chord.position)
      return
    }
    if (!chord?.label) return
    let cancelled = false
    setDbPosition(null)
    ChordLookup.load().then(() => {
      if (cancelled) return
      const pos = ChordLookup.lookupPosition(chord.label)
      setDbPosition(pos)
    })
    return () => {
      cancelled = true
    }
  }, [chord?.label, chord?.position])

  let fretted
  let fingers = null
  let barres = []
  let lowFret = 1
  let showNutLabel = false
  let relativeSlots = false

  if (dbPosition?.frets?.length === 6) {
    fretted = dbPosition.frets.slice()
    fingers = dbPosition.fingers
    barres = dbPosition.barres || []
    if (dbPosition.baseFret > 1) {
      lowFret = dbPosition.baseFret
      showNutLabel = true
      relativeSlots = true
    }
  } else {
    const intervals = getChordIntervals(chord)
    const quality = detectChordQuality(intervals)
    const shape = GUITAR_SHAPES[quality] || GUITAR_SHAPES.maj
    const transpose = (((chord.rootPc - shape.baseRootPc) % 12) + 12) % 12
    fretted = shape.frets.map((f) => (f < 0 ? -1 : f + transpose))
    const played = fretted.filter((f) => f > 0)
    const minF = played.length ? Math.min(...played) : 1
    const maxF = played.length ? Math.max(...played) : 1
    if (maxF > 5) {
      lowFret = minF
      showNutLabel = true
    }
    const uniqueFrets = [...new Set(played)].sort((a, b) => a - b)
    fingers = fretted.map((f) => (f > 0 ? uniqueFrets.indexOf(f) + 1 : 0))
  }

  const W = 140,
    H = 150
  const PAD_L = 28,
    PAD_R = 12,
    PAD_T = 26,
    PAD_B = 10
  const MUTE_Y = PAD_T - 11
  const MUTE_ARM = 3.5
  const STRINGS = 6,
    FRETS = 5
  const stringStep = (W - PAD_L - PAD_R) / (STRINGS - 1)
  const fretStep = (H - PAD_T - PAD_B) / FRETS
  const xOf = (si) => PAD_L + si * stringStep
  const fretSlot = (f) => (relativeSlots ? f : f - lowFret + 1)
  const yOfFret = (f) => PAD_T + (fretSlot(f) - 0.5) * fretStep
  const inWindow = (f) => f > 0 && fretSlot(f) >= 1 && fretSlot(f) <= FRETS

  const stringsOnBarre = (barreFret) => {
    const indices = []
    for (let si = 0; si < fretted.length; si++) {
      if (fretted[si] === barreFret) indices.push(si)
    }
    return indices
  }

  const barredStringSet = new Set()
  for (const bf of barres) {
    const onBarre = stringsOnBarre(bf)
    if (onBarre.length >= 2) onBarre.forEach((si) => barredStringSet.add(si))
  }

  const barreGraphics = barres
    .map((barreFret, bi) => {
      const onBarre = stringsOnBarre(barreFret)
      if (onBarre.length < 2 || !inWindow(barreFret)) return null
      const y = yOfFret(barreFret)
      const x1 = xOf(onBarre[0]) - stringStep * 0.38
      const x2 = xOf(onBarre[onBarre.length - 1]) + stringStep * 0.38
      const barH = Math.min(fretStep * 0.6, 15)
      const barDigits = onBarre.map((si) => fingers?.[si]).filter((n) => n > 0)
      const barFinger = barDigits.length ? Math.min(...barDigits) : 1
      return { key: "barre-" + bi, y, x1, x2, barH, barFinger }
    })
    .filter(Boolean)

  return (
    <svg
      className="chord-diagram chord-diagram-guitar"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
    >
      {Array.from({ length: STRINGS }, (_, i) => (
        <line
          key={"s" + i}
          x1={xOf(i)}
          y1={PAD_T}
          x2={xOf(i)}
          y2={H - PAD_B}
          stroke="var(--text-dim)"
          strokeWidth={1.6 - i * 0.1}
        />
      ))}
      {Array.from({ length: FRETS + 1 }, (_, i) => (
        <line
          key={"f" + i}
          x1={PAD_L - 0.5}
          y1={PAD_T + i * fretStep}
          x2={W - PAD_R + 0.5}
          y2={PAD_T + i * fretStep}
          stroke={i === 0 && lowFret === 1 ? "var(--text)" : "var(--text-dim)"}
          strokeWidth={i === 0 && lowFret === 1 ? 4 : 1}
          strokeLinecap={i === 0 && lowFret === 1 ? "round" : undefined}
        />
      ))}
      {showNutLabel && (
        <text
          className="guitar-fret-pos"
          x={PAD_L - 3}
          y={PAD_T + fretStep * 0.5}
          fontSize="13"
          fontWeight="700"
          fill="var(--text)"
          fontFamily="var(--font-mono)"
          textAnchor="end"
          dominantBaseline="middle"
        >
          {lowFret}
          <tspan fontSize="10" fontWeight="600" fill="var(--text-dim)">
            fr
          </tspan>
        </text>
      )}
      {fretted.map((f, si) => {
        const x = xOf(si)
        const finger = fingers?.[si]
        if (barredStringSet.has(si)) return null
        if (f <= 0 || !inWindow(f)) return null
        const belowBarre = barres.some((bf) => f < bf)
        if (!belowBarre) return null
        const cy = yOfFret(f)
        return (
          <g key={"below-" + si}>
            <circle cx={x} cy={cy} r="7" fill="var(--text)" />
            {finger > 0 ? (
              <text
                x={x}
                y={cy}
                fontSize="12"
                fill="var(--paper)"
                fontFamily="var(--font-sans)"
                fontWeight="600"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {finger}
              </text>
            ) : null}
          </g>
        )
      })}
      {barreGraphics.map((b) => (
        <g key={b.key} className="guitar-barre">
          <rect
            x={b.x1}
            y={b.y - b.barH / 2}
            width={b.x2 - b.x1}
            height={b.barH}
            rx={b.barH / 2}
            fill="var(--text)"
          />
          <text
            x={(b.x1 + b.x2) / 2}
            y={b.y}
            fontSize={b.barH * 0.72}
            fill="var(--paper)"
            fontFamily="var(--font-sans)"
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {b.barFinger}
          </text>
        </g>
      ))}
      {fretted.map((f, si) => {
        const x = xOf(si)
        const finger = fingers?.[si]
        if (barredStringSet.has(si)) return null
        const belowBarre = f > 0 && barres.some((bf) => f < bf)
        if (belowBarre) return null
        if (f < 0) {
          return (
            <g
              key={si}
              className="guitar-mute"
              stroke="var(--text)"
              strokeWidth="1.4"
              strokeLinecap="round"
            >
              <line
                x1={x - MUTE_ARM}
                y1={MUTE_Y - MUTE_ARM}
                x2={x + MUTE_ARM}
                y2={MUTE_Y + MUTE_ARM}
              />
              <line
                x1={x + MUTE_ARM}
                y1={MUTE_Y - MUTE_ARM}
                x2={x - MUTE_ARM}
                y2={MUTE_Y + MUTE_ARM}
              />
            </g>
          )
        }
        if (f === 0) {
          const hasMutes = fretted.some((v) => v < 0)
          if (!hasMutes) return null
          return (
            <circle
              key={si}
              cx={x}
              cy={MUTE_Y}
              r="3"
              fill="none"
              stroke="var(--text)"
              strokeWidth="1.2"
            />
          )
        }
        if (!inWindow(f)) return null
        const cy = yOfFret(f)
        return (
          <g key={si}>
            <circle cx={x} cy={cy} r="7" fill="var(--text)" />
            {finger > 0 ? (
              <text
                x={x}
                y={cy}
                fontSize="12"
                fill="var(--paper)"
                fontFamily="var(--font-sans)"
                fontWeight="600"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {finger}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
})

function PianoDiagram({ chord }) {
  const notes = [...new Set(chord.notesMidi || [])]
  if (chord.bassMidi != null) notes.push(chord.bassMidi)
  if (!notes.length) return null
  const minM = Math.min(...notes)
  const maxM = Math.max(...notes)
  const startC = Math.floor(minM / 12) * 12
  const octs = Math.max(2, Math.ceil((maxM - startC + 1) / 12))
  const numWhite = octs * 7

  const W = 182,
    H = 56
  const TOP_BAR = 4
  const wW = W / numWhite
  const keyH = H - TOP_BAR
  const bW = wW * 0.58
  const bH = keyH * 0.6
  const dotR = 3.2

  const whiteOrder = [0, 2, 4, 5, 7, 9, 11]
  const blackAfterWhite = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 }

  const noteSet = new Set(notes)

  const whiteKeyRects = []
  const blackKeyRects = []
  const whiteDots = []
  const blackDots = []

  for (let o = 0; o < octs; o++) {
    const baseM = startC + o * 12

    whiteOrder.forEach((pc, i) => {
      const m = baseM + pc
      const x = (o * 7 + i) * wW
      const on = noteSet.has(m)
      whiteKeyRects.push(
        <rect
          key={"w" + m}
          x={x + 0.5}
          y={TOP_BAR}
          width={wW - 1}
          height={keyH - 0.5}
          fill="var(--paper)"
          stroke="var(--border)"
          strokeWidth="0.8"
          rx="0.5"
        />,
      )
      if (on) {
        whiteDots.push(
          <circle
            key={"wd" + m}
            cx={x + wW / 2}
            cy={TOP_BAR + keyH * 0.76}
            r={dotR}
            fill="var(--text)"
            stroke="var(--text)"
            strokeWidth="0.8"
          />,
        )
      }
    })

    Object.entries(blackAfterWhite).forEach(([pcStr, whiteIdx]) => {
      const pc = +pcStr
      const m = baseM + pc
      const x = (o * 7 + whiteIdx + 1) * wW - bW / 2
      const on = noteSet.has(m)
      blackKeyRects.push(
        <rect key={"b" + m} x={x} y={TOP_BAR} width={bW} height={bH} fill="var(--text)" rx="0.5" />,
      )
      if (on) {
        blackDots.push(
          <circle
            key={"bd" + m}
            cx={x + bW / 2}
            cy={TOP_BAR + bH * 0.72}
            r={dotR}
            fill="var(--paper)"
            stroke="var(--text)"
            strokeWidth="0.8"
          />,
        )
      }
    })
  }

  return (
    <svg
      className="chord-diagram chord-diagram-piano"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
    >
      <rect x="0" y="0" width={W} height={TOP_BAR} fill="var(--text)" rx="0.5" />
      {whiteKeyRects}
      {whiteDots}
      {blackKeyRects}
      {blackDots}
    </svg>
  )
}

const ChordDiagram = React.memo(function ChordDiagram({ chord, instrument }) {
  if (instrument === "guitar") return <GuitarDiagram chord={chord} />
  return <PianoDiagram chord={chord} />
})
export default ChordDiagram
