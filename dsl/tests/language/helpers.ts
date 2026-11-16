import { expect } from "vitest"
import { parseSource } from "../../src/music-engine.ts"

// play block { ... } around some lines; one line needs no braces.
export const play = (...lines: string[]) =>
  lines.length === 1
    ? `play ${lines[0]}`
    : `play block {\n${lines.map((line, i) => line + (i < lines.length - 1 && lines[i + 1].trim() && !/^(?:\||\/\/)/.test(lines[i + 1].trim()) && line.trim() && !line.trim().startsWith("//") ? "," : "")).join("\n")}\n}`
export const firstError = (src: string) => parseSource(src).errors[0]?.msg
export const allErrors = (src: string) => parseSource(src).errors.map((e) => e.msg)
export const anyError = (src: string) => allErrors(src).join("\n")
export const labels = (src: string) => parseSource(src).chords.map((e) => e.label)
export const notes = (src: string) => parseSource(src).notes.map((e) => e.note.name)
export const midis = (src: string) => parseSource(src).notes.map((e) => e.note.midi)
export const hits = (o: ReturnType<typeof parseSource>["outputs"][number], lane: string) =>
  o.drumEvents.filter((e) => e.lane === lane && !e.hidden)
export const durations = (src: string) => parseSource(src).outputs.map((o) => o.durSec)
// The drum hits that play, in an order that doesn't depend on which line they came from.
export const played = (src: string) => {
  const p = parseSource(src)
  expect(p.errors).toEqual([])
  return p.outputs.map((o) => [
    o.durSec,
    o.drumEvents.map((e) => [e.lane, e.secStart.toFixed(6), e.accent, !!e.hidden].join()).sort(),
  ])
}
// Everything that plays, for checking two ways of writing something sound the same.
export const sound = (src: string) => {
  const p = parseSource(src)
  expect(p.errors).toEqual([])
  return JSON.stringify(
    p.outputs.map((o) => [
      o.durSec,
      o.drumEvents.map((e) => [e.lane, e.secStart, e.accent]),
      o.chords.map((e) => [e.label, e.secStart]),
      o.notes.map((e) => [e.instrument, e.note.name, e.secStart, e.secDur, e.vel]),
    ]),
  )
}
