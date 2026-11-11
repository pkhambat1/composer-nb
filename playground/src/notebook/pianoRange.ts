type DiagramChord = { notesMidi: readonly number[]; bassMidi?: number; overBass?: boolean }

export type PianoRange = { start: number; octaves: number }

// A whole output shares one range, including slash basses; no chord changes key scale.
export function pianoRange(chords: readonly DiagramChord[]): PianoRange {
  const notes = chords.flatMap((chord) => [
    ...(chord.notesMidi ?? []),
    ...(chord.overBass && chord.bassMidi != null ? [chord.bassMidi] : []),
  ])
  const start = Math.floor(Math.min(48, ...notes) / 12) * 12
  const end = Math.max(71, ...notes)
  return { start, octaves: Math.ceil((end - start + 1) / 12) }
}
