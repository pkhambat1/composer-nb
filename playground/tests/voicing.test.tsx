import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { parseCell } from "../../dsl/src/cell.ts"
import ChordDiagram from "../src/notebook/ChordDiagram.tsx"

describe("explicit chord voicings", () => {
  it("shows exact pitches instead of a default guitar shape", () => {
    const parsed = parseCell("play({ guitar: voice(2m9, { fifth: 1 }) })")
    expect(parsed.errors).toEqual([])
    const chord = parsed.chords[0].chord
    const actual = renderToStaticMarkup(<ChordDiagram chord={chord} instrument="guitar" />)
    const keyboard = renderToStaticMarkup(<ChordDiagram chord={chord} instrument="piano" />)
    expect(actual).toBe(keyboard)
    expect(actual).toContain("chord-diagram-piano")
    expect(actual.match(/<circle /g)).toHaveLength(5)
    const plain = parseCell("play({ guitar: chord(2m9) })").chords[0].chord
    expect(renderToStaticMarkup(<ChordDiagram chord={plain} instrument="guitar" />)).toContain(
      "chord-diagram-guitar",
    )
  })
})
