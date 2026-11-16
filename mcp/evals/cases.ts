/* The 9 cases of CASES.md: the prompt, the account it starts from, what it should leave,
   and the check that the music is what was asked, read back through the engine. */
import { TPQ } from "composer-nb/language"
import {
  atLeastBars,
  atTempo,
  barShape,
  bars,
  chordsOf,
  dedupe,
  hitsOf,
  inKey,
  inMode,
  inTime,
  letterNamedRoots,
  notesOf,
  pcOf,
  players,
  readSource,
  suffixOf,
  within,
  type Case,
  type DrumHit,
  type Music,
} from "./grade.ts"

const EIGHTH = TPQ / 2
const SIXTEENTH = TPQ / 4
const mod12 = (n: number) => ((n % 12) + 12) % 12
const check = (ok: boolean, why: string) => (ok ? [] : [why])

/** A triplet position that isn't also a sixteenth: the shuffle's sign */
const onTriplet = (h: DrumHit) => h.tick % (TPQ / 6) === 0 && h.tick % SIXTEENTH !== 0

function shuffled(m: Music, ...lanes: string[]): string[] {
  return check(
    m.swing || hitsOf(m, ...lanes).some(onTriplet),
    `swing is off and no ${lanes.join(" or ")} hit is on a triplet`,
  )
}

/** The lanes and ticks of one bar, for comparing bars */
const barHits = (m: Music, bar: number) =>
  within(m.hits, bar, bar)
    .map((h) => `${h.lane}@${h.tick}`)
    .sort()
    .join(" ")
const barsHits = (m: Music, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => barHits(m, from + i)).join(" | ")

/** The chords of an instrument as labels, consecutive repeats dropped */
const chordNames = (m: Music, instrument?: string) =>
  dedupe(chordsOf(m, instrument), (c) => c.label).map((c) => c.label)

const pitchShape = (m: Music, from: number, to: number, up: number) => [
  ...barShape(
    m.chords,
    from,
    to,
    (c) => `${c.instrument} chord ${c.pcs.map((p) => mod12(p + up)).sort((a, b) => a - b)}`,
  ),
  ...barShape(m.notes, from, to, (n) => `${n.instrument} note ${mod12(n.pc + up)}`),
]

export const CASES: Case[] = [
  {
    id: "h01",
    group: "harmony",
    state: "empty",
    harmony: "derive",
    writes: "new",
    prompt: "write me a moody piano progression in F# minor, 8 bars, slow",
    fits: (m) => [...inKey(m, "F#"), ...inMode(m, "minor"), ...players(m, "piano"), ...bars(m, 8)],
  },
  {
    id: "h02",
    group: "harmony",
    state: "empty",
    harmony: "derive",
    writes: "new",
    prompt: "jazzy piano chords in Bb. not just ii V I on repeat",
    fits: (m) => [
      ...inKey(m, "Bb"),
      ...inMode(m, "major"),
      ...players(m, "piano"),
      ...atLeastBars(m, 4),
    ],
  },
  {
    id: "h05",
    group: "harmony",
    state: "empty",
    harmony: "derive",
    writes: "new",
    prompt:
      "a 2 bar chord pattern on piano in D minor, then the same pattern a third higher, then back down",
    fits: (m) => {
      const piano = chordsOf(m, "piano")
      const at = (from: number) =>
        within(piano, from, from + 1).map((c) => ({
          pos: `${c.bar - from}:${c.tick}`,
          root: c.rootPc,
        }))
      const seed = at(1)
      const up = at(3)
      const back = at(5)
      const third =
        seed.length > 0 &&
        up.length === seed.length &&
        up.every((c, i) => c.pos === seed[i].pos && [3, 4].includes(mod12(c.root - seed[i].root)))
      const same =
        back.length === seed.length &&
        back.every((c, i) => c.pos === seed[i].pos && c.root === seed[i].root)
      return [
        ...inKey(m, "D"),
        ...inMode(m, "minor"),
        ...check(piano.length > 0, "no piano chords"),
        ...atLeastBars(m, 6),
        ...check(third, "bars 3-4 aren't bars 1-2 a third higher"),
        ...check(same, "bars 5-6 aren't bars 1-2"),
      ]
    },
  },
  {
    id: "h10",
    group: "harmony",
    state: "empty",
    harmony: "derive",
    writes: "new",
    prompt:
      "two keyboards in G minor: piano plays 2 bars of chords, then organ answers with the same chords a fifth up",
    fits: (m) => {
      const piano = chordsOf(m, "piano")
      const organ = chordsOf(m, "organ")
      const fifth =
        piano.length === organ.length &&
        organ.every((o, i) => [6, 7, 8].includes(mod12(o.rootPc - piano[i].rootPc)))
      return [
        ...inKey(m, "G"),
        ...inMode(m, "minor"),
        ...check(
          piano.length > 0 && organ.length > 0,
          "the piano and the organ don't both play chords",
        ),
        ...check(
          piano.length === organ.length,
          `${piano.length} piano chords, ${organ.length} organ`,
        ),
        ...check(fifth, "the organ's roots aren't the piano's a fifth up"),
        ...check(
          !!piano.length && !!organ.length && organ[0].at > piano[piano.length - 1].at,
          "the organ doesn't answer after the piano",
        ),
      ]
    },
  },
  {
    id: "h13",
    group: "harmony",
    state: "empty",
    harmony: "derive",
    writes: "new",
    prompt: "12 bar blues in A on piano, all dominant sevenths",
    fits: (m) => {
      const piano = chordsOf(m, "piano")
      const notDom = piano.filter(
        (c) => !c.pcs.includes(mod12(c.rootPc + 4)) || !c.pcs.includes(mod12(c.rootPc + 10)),
      )
      const roots = new Set(piano.map((c) => c.rootPc))
      return [
        ...inKey(m, "A"),
        ...bars(m, 12),
        ...check(piano.length > 0, "no piano chords"),
        ...check(!notDom.length, `not dominant sevenths: ${notDom.map((c) => c.label).join(" ")}`),
        ...check(
          [9, 2, 4].every((r) => roots.has(r)),
          "the roots don't include A, D and E",
        ),
      ]
    },
  },
  {
    id: "h15",
    group: "harmony",
    state: "empty",
    harmony: "derive",
    writes: "new",
    prompt: "a ii V I in C, then in F, then in Bb, on piano",
    fits: (m) => {
      const want = ["Dm7", "G7", "Cmaj7", "Gm7", "C7", "Fmaj7", "Cm7", "F7", "Bbmaj7"]
      const got = dedupe(chordsOf(m, "piano"), (c) => c.label)
      const same =
        got.length === want.length &&
        got.every((c, i) => c.rootPc === pcOf(want[i]) && suffixOf(c.label) === suffixOf(want[i]))
      return [
        ...players(m, "piano"),
        ...check(
          same,
          `the chords are ${got.map((c) => c.label).join(" ")}, not ${want.join(" ")}`,
        ),
      ]
    },
  },
  {
    id: "l01",
    group: "literal",
    state: "empty",
    harmony: "literal",
    writes: "new",
    prompt: "play Am F C G on piano, one bar each, exactly those chords",
    fits: (m) => {
      const got = chordsOf(m, "piano").map((c) => `${c.label}@${c.bar}:${c.tick}`)
      return [
        ...bars(m, 4),
        ...check(
          got.join(" ") === "Am@1:0 F@2:0 C@3:0 G@4:0",
          `the piano plays ${got.join(" ") || "no chords"}`,
        ),
      ]
    },
  },
  {
    id: "w02",
    group: "workflow",
    state: "cycle",
    harmony: "derive",
    writes: "append",
    prompt: "add a cell that plays the cycle a fourth higher on organ",
    fits: (m) => {
      const organ = dedupe(chordsOf(m, "organ"), (c) => c.label)
      const cycle = ["A", "D", "G", "C", "F", "B", "E"].map(pcOf)
      const fourth =
        organ.length === 7 && organ.every((c, i) => [5, 6].includes(mod12(c.rootPc - cycle[i])))
      return check(
        fourth,
        `the organ plays ${organ.map((c) => c.label).join(" ") || "nothing"}, not the cycle a fourth up`,
      )
    },
  },
  {
    id: "w06",
    group: "workflow",
    state: "broken",
    harmony: null,
    writes: "edit",
    prompt: "my cell has an error, fix it",
    fits: (m) => {
      const got = chordNames(m, "piano").join(" ")
      return check(got === "Am F", `the piano plays ${got || "no chords"}, not Am F`)
    },
  },
]
