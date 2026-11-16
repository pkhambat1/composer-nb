/* The 9 cases of CASES.md: the prompt, the account it starts from, what it should leave,
   and the check that the music is what was asked, read back through the engine. */
import {
  atLeastBars,
  bars,
  chordsOf,
  dedupe,
  inKey,
  inMode,
  pcOf,
  players,
  readSource,
  suffixOf,
  within,
  type Case,
  type ChordHit,
  type Music,
} from "./grade.ts"
import { CYCLE_CELL } from "./states.ts"

const mod12 = (n: number) => ((n % 12) + 12) % 12
const check = (ok: boolean, why: string) => (ok ? [] : [why])

/** The chords of an instrument as labels, consecutive repeats dropped */
const chordNames = (m: Music, instrument?: string) =>
  dedupe(chordsOf(m, instrument), (c) => c.label).map((c) => c.label)

/** Compare the entire chord and its rhythm, not just a plausible root interval.
    Ask the engine for the scale-relative move, including altered tones and slash basses. */
function samePhrase(seed: ChordHit[], answer: ChordHit[], offset: number, interval?: string) {
  return (
    seed.length > 0 &&
    seed.length === answer.length &&
    answer.every((got, i) => {
      const from = seed[i]
      const want = interval
        ? readSource(
            `set key ${from.key}\nset mode ${from.mode}\nset transpose ${from.transpose}\nplay piano: chords ${interval}(${from.input})`,
          ).chords[0]
        : from
      return (
        !!want &&
        got.bar === from.bar + offset &&
        got.tick === from.tick &&
        got.barTicks === from.barTicks &&
        got.ticks === from.ticks &&
        got.rootPc === want.rootPc &&
        got.pcs.join() === want.pcs.join() &&
        got.overBass === want.overBass &&
        (!want.overBass || got.bassPc === want.bassPc)
      )
    })
  )
}

const pianoChords = (m: Music) => check(chordsOf(m, "piano").length > 0, "no piano chords")

export const CASES: Case[] = [
  {
    id: "h01",
    group: "harmony",
    state: "empty",
    harmony: "derive",
    writes: "new",
    prompt: "write me a moody piano progression in F# minor, 8 bars, slow",
    fits: (m) => [
      ...inKey(m, "F#"),
      ...inMode(m, "minor"),
      ...pianoChords(m),
      ...bars(m, 8),
      ...check(
        m.tempos.every((tempo) => tempo <= 90),
        "slow means at most 90 BPM in this case",
      ),
    ],
  },
  {
    id: "h02",
    group: "harmony",
    state: "empty",
    harmony: "derive",
    writes: "new",
    prompt: "jazzy piano chords in Bb. not just ii V I on repeat",
    fits: (m) => {
      const roots = dedupe(chordsOf(m, "piano"), (c) => c.rootPc).map((c) =>
        mod12(c.rootPc - pcOf("Bb")),
      )
      const onlyTurnarounds =
        roots.length >= 6 && roots.every((root, i) => root === [2, 7, 0][i % 3])
      return [
        ...inKey(m, "Bb"),
        ...inMode(m, "major"),
        ...pianoChords(m),
        ...atLeastBars(m, 4),
        ...check(!onlyTurnarounds, "the piano only repeats ii V I"),
      ]
    },
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
      const seed = within(piano, 1, 2)
      const third = samePhrase(seed, within(piano, 3, 4), 2, "third")
      const same = samePhrase(seed, within(piano, 5, 6), 4)
      return [
        ...inKey(m, "D"),
        ...inMode(m, "minor"),
        ...check(piano.length > 0, "no piano chords"),
        ...bars(m, 6),
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
      const fifth = samePhrase(piano, organ, 2, "fifth")
      return [
        ...inKey(m, "G"),
        ...inMode(m, "minor"),
        ...bars(m, 4),
        ...check(
          piano.length > 0 && organ.length > 0,
          "the piano and the organ don't both play chords",
        ),
        ...check(
          piano.length === organ.length,
          `${piano.length} piano chords, ${organ.length} organ`,
        ),
        ...check(fifth, "the organ doesn't repeat the piano's chords and rhythm a fifth up"),
        ...check(
          piano.every((c) => c.bar <= 2 && c.bar - 1 + (c.tick + c.ticks) / c.barTicks <= 2) &&
            organ.every((c) => c.bar >= 3),
          "the piano must play bars 1-2 and the organ must answer in bars 3-4",
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
        (c) => ![0, 4, 7, 10].every((step) => c.pcs.includes(mod12(c.rootPc + step))),
      )
      const roots = new Set(piano.map((c) => c.rootPc))
      return [
        ...inKey(m, "A"),
        ...bars(m, 12),
        ...check(piano.length > 0, "no piano chords"),
        ...check(!notDom.length, `not dominant sevenths: ${notDom.map((c) => c.label).join(" ")}`),
        ...check(
          roots.size === 3 && [9, 2, 4].every((r) => roots.has(r)),
          "the roots must be A, D and E",
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
        ...check(
          m.chords.length === 4 && !m.notes.length && m.chords.every((c) => c.ticks === c.barTicks),
          "exactly four piano chords must sound, each for a whole bar",
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
      const organ = chordsOf(m, "organ")
      const cycle = readSource(CYCLE_CELL).chords
      const fourth = samePhrase(cycle, organ, 0, "fourth")
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
