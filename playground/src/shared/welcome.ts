import { grooveBySlug, grooveText, type Groove } from "composer-nb/grooves"
import type { SavedCell } from "./types.ts"

// The welcome notebook is a short selection, independent of the full groove library.
function transcription(slug: string, body: string): Groove {
  const groove = grooveBySlug(slug)
  if (!groove) throw new Error(`Missing welcome transcription: ${slug}`)
  return { ...groove, body }
}

const examples: Groove[] = [
  transcription(
    "the-sound-of-muzak",
    "A groove in seven, with a lift at the end of every second bar. `on bar 2` adds ghost notes and an open hi-hat over the repeating pattern.",
  ),
  transcription(
    "what-happens-now",
    "The drums, ride bell and muted guitar repeat at different lengths, shifting against each other in 7/8. A rimshot pickup opens this three-bar excerpt.",
  ),
  {
    section: "Harmony",
    title: "Dorian chords",
    body: "What is the fourth chord in D Dorian, and what happens when every chord moves up a fourth? Run this cell to print the names and tones: `chords 4` gives G major, while `fourth(triads)` moves every tone of each triad through the scale. Change the key or mode and run it again to compare.",
    source: `with key D, mode dorian {
  chords triads = 1 2 3 4 5 6 7,
  // The chords built from D Dorian.
  print(triads),
  // The chord on its fourth degree.
  print(chords 4),
  // Each of those chords moved up a diatonic fourth.
  print(fourth(triads))
}`,
  },
  {
    section: "Harmony",
    title: "A phrase and its answer",
    body: "A short piano phrase answers itself a third higher. `third(phrase)` keeps the rhythm and moves each note through D Dorian; edit the original phrase and both versions change.",
    source: `with key D, mode dorian, octave 4, tempo 96 {
  notes phrase = 1--- 3-4- 6--- 5-3-|2--- 4--- 1 7*-,
  play piano: notes phrase | third(phrase)
}`,
  },
  {
    section: "Harmony",
    title: "One progression, two moods",
    body: "Hear the same four chords in C major, then C minor. Each `with` changes the mode for its own part, so the degrees stay the same while the chord qualities change.",
    source: `with key C, octave 3, tempo 100 {
  chords cadence = 1|4|5|1,
  play (
    with mode major { piano: chords cadence }
    with mode minor { piano: chords cadence }
  )
}`,
  },
  {
    section: "Harmony",
    title: "ii–V–I",
    body: "Dm7 leads to G7 and resolves to Cmaj7, with piano chords over sustained bass notes. The parts use separate octaves, and changing `key C` transposes them together.",
    source: `with key C, mode major, tempo 108 {
  play block {
    with octave 4 { piano: chords 2m7|5dom7|1maj7|% },
    with octave 2 { bass: notes 2|5|1|- }
  }
}`,
  },
]

export const WELCOME_CELLS: SavedCell[] = [
  {
    type: "text",
    source: `# A music notebook, in place of paper

Write what plays in a notebook of text and music cells, then hear it and see it as bricks or sheet music. Press **Run** (or Shift+Enter) to render a music cell, then **Play** to hear it; the full language is under **Docs**. Your notebooks save as you edit and appear on the left, where a notebook's name opens its menu—change an example below and run it again.`,
  },
  ...examples.flatMap((example): SavedCell[] => [
    { type: "text", source: grooveText(example) },
    { type: "music", source: example.source },
  ]),
]
