/* The grooves library: transcriptions and harmony cells to start from. Each is
   a text cell's worth of words (a title, a byline, a paragraph and a link) and a music cell. The
   playground's welcome notebook holds them all and its build makes a page for each; the MCP
   server searches them. Pure data, shared so there is one copy. */

// A groove: where it's listed, its words, a link to hear the original, and its music cell
export type Groove = {
  section: string
  title: string
  byline?: string
  body?: string
  link?: string | null
  source: string
}

export const GROOVES: Groove[] = [
  {
    section: "Transcriptions",
    title: "The Sound of Muzak",
    byline: "**Porcupine Tree** · *In Absentia* (2002) · drums by Gavin Harrison",
    body: "A groove in seven. The kick, snare and hi-hat repeat in every bar, and `bar 2` adds the lift at the end of every second bar: a burst of ghost notes, an open hi-hat, and the foot closing it.",
    link: "https://www.youtube.com/watch?v=4ulgVOBpNWA",
    source: `pattern groove = {
  kick: x--x---
  snare: 2e 4
  snare.ghost: --x----
  hat: ^-x-
  bar 2 {
    snare.ghost: d3 d3e
    hat.open: ^3&
    hat.pedal: 4
  }
}

with time 7 over 8, tempo 90 {
  play {
    crash: 1
    groove
  }
}`,
  },
  {
    section: "Transcriptions",
    title: "Circle of Manias",
    byline: "**Porcupine Tree** · *The Incident* (2009) · drums by Gavin Harrison",
    body: "Nine eighths to the bar. The hi-hat alternates open and closed on every eighth, while the kick plays a figure of eighteen sixteenths and the snare one of nine, so they only line up again every two bars. The ghost notes at the top of the figure end in `...rest`: they play once each time through, and the other lines decide how long the pattern is.",
    link: "https://www.youtube.com/results?search_query=Porcupine+Tree+Circle+of+Manias",
    source: `pattern manias = {
  hat.open: x---
  hat: --x-
  kick: x--x-x---x--x-xx--
  snare: -------x-
  snare.ghost: -xx, ...rest
}

with time 9 over 8, tempo 100 { play 4 bars manias }`,
  },
  {
    section: "Transcriptions",
    title: "What Happens Now?",
    byline: "**Porcupine Tree** · *Nil Recurring* (2007) · drums by Gavin Harrison",
    body: "Lines of different lengths in one pattern. The kick and snare repeat every 7 steps, the ride bell every 3 and the guitar riff every 10, so they drift against each other and only all meet again on a bar line after 15 bars. The play opens with a two-step pickup, an accented rim hit, and the groove starts after it: the two blocks are in brackets, so they play one after the other. The crash plays once, in the groove's first bar, and `play 3 bars` stops it after three bars, pickup included. `octave 2` in the with puts the riff right at the bottom of the guitar's range.",
    link: "https://www.youtube.com/watch?v=v0Iv4SYJW-k",
    source: `pattern groove = {
  kick: x--x---
  snare.rim: ----x--
  ride.bell: x--
  guitar.electric: notes D---E D-D--
}

with time 7 over 8, tempo 110, octave 2, guitar.electric muted {
  play 3 bars (
    { snare.rim: ^- }
    {
      bar 1 crash: 1
      groove
    }
  )
}`,
  },
  {
    section: "Transcriptions",
    title: "Gavin Harrison's paradiddle challenge",
    byline: "An independence exercise from **Gavin Harrison**",
    body: "The hands play paradiddles on the snare, accenting each PA with ghost notes in between. The feet play the same paradiddle three times slower: `every 3 steps` makes each of their steps last three 16ths. The kick is the right foot, and the hi-hat pedal is the left.",
    link: "https://www.youtube.com/watch?v=XEWmzQ_fJmw",
    source: `steps pa = ^---
steps radiddle = -xxx

pattern hands = {
  snare: pa
  snare.ghost: radiddle
}

pattern feet = every 3 steps {
  kick: ^-^^-^--
  hat.pedal: -x--x-xx
}

with time 3 over 4, tempo 100 {
  play {
    hands
    feet
  }
}`,
  },
  {
    section: "Transcriptions",
    title: "Vodka For My Goat",
    byline: "**Polyrhythmics** · live studio session at KNKX",
    body: "Twelve steps to the bar. The ride bell plays a 12-step pattern and the kick a 6-step one, the snare hits on the a of 1 and the e of 3, and ghost notes fill every other step.",
    link: "https://www.youtube.com/watch?v=YZPtPMCDEs4",
    source: `pattern groove = {
  ride.bell: x-x-x-xx-x-x
  snare: ---x--
  snare.ghost: -x
  kick: x-x--x
}

with time 3 over 4, tempo 82.5 { play 2 bars groove }`,
  },
  {
    section: "Transcriptions",
    title: "3 over 4 over 5",
    byline: "A polyrhythm exercise",
    body: "Three lines of different lengths in one pattern. The floor tom hits every 3 steps, the kick every 4 and the snare every 5. They drift apart, and only land together again after 60 steps: three bars of 5 over 4, which is where the pattern ends.",
    link: null,
    source: `pattern groove = {
  kick: x---
  snare: x----
  tom.floor: x--
}

with time 5 over 4 { play groove }`,
  },
  {
    section: "Harmony",
    title: "Lydian walk",
    byline: "D lydian: major with a raised fourth",
    body: "One chart, `chords 1 2|3 4|5 6|7 1|7 6|5 4|3 2|1`, goes up the scale and back down, and a digit is the chord the scale has on that degree. In D lydian those are D E F#m G#dim A Bm C#m. The G#dim on 4 is lydian's, and so is the major E on 2, a whole step above the root, where major has a minor one: the floating sound. Change `mode lydian` in the with to `mode major` and the same chart turns into D major's chords.",
    link: null,
    source: `pattern walk = {
  piano: chords 1 2|3 4|5 6|7 1|7 6|5 4|3 2|1
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

with key D, mode lydian, tempo 84 { play walk }`,
  },
  {
    section: "Harmony",
    title: "Mixolydian walk",
    byline: "D mixolydian: major with a flat seventh",
    body: "One chart, `chords 1 2|3 4|5 6|7 1|7 6|5 4|3 2|1`, goes up the scale and back down, and a digit is the chord the scale has on that degree. In D mixolydian those are D Em F#dim G Am Bm C. The flat seventh makes 7 a major C, a whole step under the root, and turns 5 into a minor Am: the rock sound. Change `mode mixolydian` in the with to `mode major` and the same chart turns into D major's chords.",
    link: null,
    source: `pattern walk = {
  piano: chords 1 2|3 4|5 6|7 1|7 6|5 4|3 2|1
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

with key D, mode mixolydian, tempo 104 { play walk }`,
  },
  {
    section: "Harmony",
    title: "Dorian walk",
    byline: "D dorian: minor with a major sixth",
    body: "One chart, `chords 1 2|3 4|5 6|7 1|7 6|5 4|3 2|1`, goes up the scale and back down, and a digit is the chord the scale has on that degree. In D dorian those are Dm Em F G Am Bdim C. 6 is Bdim and 4 is a major G, where natural minor has Gm: a minor key with a major IV. Change `mode dorian` in the with to `mode major` and the same chart turns into D major's chords.",
    link: null,
    source: `pattern walk = {
  piano: chords 1 2|3 4|5 6|7 1|7 6|5 4|3 2|1
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

with key D, mode dorian, tempo 96 { play walk }`,
  },
  {
    section: "Harmony",
    title: "Minor walk",
    byline: "D minor: the natural minor scale",
    body: "One chart, `chords 1 2|3 4|5 6|7 1|7 6|5 4|3 2|1`, goes up the scale and back down, and a digit is the chord the scale has on that degree. In D minor those are Dm Edim F Gm Am Bb C. 3, 6 and 7 are the major chords F, Bb and C, and 5 is the minor Am: the chords of natural minor. Change `mode minor` in the with to `mode major` and the same chart turns into D major's chords.",
    link: null,
    source: `pattern walk = {
  piano: chords 1 2|3 4|5 6|7 1|7 6|5 4|3 2|1
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

with key D, mode minor, tempo 92 { play walk }`,
  },
  {
    section: "Harmony",
    title: "Phrygian walk",
    byline: "D phrygian: minor with a flat second",
    body: "One chart, `chords 1 2|3 4|5 6|7 1|7 6|5 4|3 2|1`, goes up the scale and back down, and a digit is the chord the scale has on that degree. In D phrygian those are Dm Eb F Gm Adim Bb Cm. 2 is a major Eb, a half step above the root, and 5 is the diminished Adim: the dark, Spanish sound. Change `mode phrygian` in the with to `mode major` and the same chart turns into D major's chords.",
    link: null,
    source: `pattern walk = {
  piano: chords 1 2|3 4|5 6|7 1|7 6|5 4|3 2|1
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

with key D, mode phrygian, tempo 88 { play walk }`,
  },
  {
    section: "Harmony",
    title: "Locrian walk",
    byline: "D locrian: a diminished root",
    body: "One chart, `chords 1 2|3 4|5 6|7 1|7 6|5 4|3 2|1`, goes up the scale and back down, and a digit is the chord the scale has on that degree. In D locrian those are Ddim Eb Fm Gm Ab Bb Cm. 1 is Ddim, so the root's own chord never sounds at rest: locrian is the mode that won't settle. Change `mode locrian` in the with to `mode major` and the same chart turns into D major's chords.",
    link: null,
    source: `pattern walk = {
  piano: chords 1 2|3 4|5 6|7 1|7 6|5 4|3 2|1
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

with key D, mode locrian, tempo 80 { play walk }`,
  },
  {
    section: "Harmony",
    title: "Fifth of a fifth",
    byline: "of counts a note from another note: 5 of 1, 5 of (5 of 1)",
    body: "`5 of 1` is the 5th of the key's root, and `5 of (5 of 1)` the 5th of that: one `of` a fifth up, and brackets chain them. This goes up the circle of fifths from the key's root, C G D A, and it follows the key: put `key F` in a with around the play and every note moves with it. Without the brackets, `5 of 5 of 1` is an error.",
    link: null,
    source: `pattern fifths = {
  piano: notes 1--- 5 of 1--- 5 of (5 of 1)--- 5 of (5 of (5 of 1))---
  hat: x-
  kick: 1 3
}

with tempo 76 { play 2 bars fifths }`,
  },
  {
    section: "Harmony",
    title: "Dominants of dominants",
    byline: "of counts a chord from another chord: V7 of V",
    body: "`V7 of V` is the dominant seventh built on the key's V: in C, D7, the chord that pulls to G. Chain them in brackets and each pulls to the next: `V7 of (V of V)` is A7, then D7, G7, and home to C. This is the same trick as the circle of fifths, on chords, and it follows the key and the mode too.",
    link: null,
    source: `pattern pulls = {
  piano: chords V7 of (V of V)|V7 of V|V7|I
  hat: x-
  snare: 2 4
  kick: 1 3
}

with tempo 84 { play 4 bars pulls }`,
  },
  {
    section: "Harmony",
    title: "Fifth of a chord",
    byline: "of counts a chord from another chord: V of I is G in C",
    body: "`V of I` is the V counted from the I's root: in C major the I is C, so `V of I` is G, a major chord a fifth up. `V of V` is D, and `V of (V of V)` is A, so this walks up the circle of fifths on chords, C G D A. The numeral in front says which chord to build and the chord after `of` says where to count from, so it follows `set key` and `set mode`.",
    link: null,
    source: `set time 4 over 4
set tempo 80
set key C
set mode major
set octave 3

pattern fifths = {
  piano: chords I|V of I|V of V|V of (V of V)
  hat: x-
  kick: 1 3
}

play 4 bars fifths`,
  },
  {
    section: "Harmony",
    title: "Scopes with with",
    byline: "with gives a block its own key, mode and tempo",
    body: "The same line of degrees, `1 2 3 4 5 6 7`, played in three scopes. A `with` gives its block settings that last until its `}` and then put back what was set before, so the first scope is C major, the second C minor, and the third D dorian at a slower tempo. Nothing leaks out of a `with`, and nothing set at the top is lost.",
    link: null,
    source: `set time 4 over 4
set tempo 100
set key C
set mode major
set octave 4

notes scale = 1---2---3---4---|5---6---7---1'---

play (
  with key C, mode major { piano: notes scale }
  with key C, mode minor { piano: notes scale }
  with key D, mode dorian, tempo 80 { piano: notes scale }
)`,
  },
  {
    section: "Harmony",
    title: "An octave for each part",
    byline: "with around one line gives it its own octave, and names stay inside",
    body: "A `with` in a pattern is a block that sounds with the other lines, so the bass can sit in octave 2 and the piano in octave 4 under one `set octave`. A name declared inside a `with`, like `walk` here, stays inside it: nothing below can use it, and it can't clash with a name of the same spelling elsewhere.",
    link: null,
    source: `set time 4 over 4
set tempo 92
set key C
set mode major
set octave 3

play {
  with octave 2 {
    notes walk = 1---5---4---5---
    bass: notes walk
  }
  with octave 4 { piano: chords I V|vi IV }
  hat: x-
  kick: 1 3
}`,
  },
  {
    section: "Harmony",
    title: "ii–V–I",
    byline: "The cadence jazz is built on",
    body: "Dm7 to G7 to Cmaj7: the ii sets up the V, and the V resolves home. Written as numerals, so the key moves it: put `key F` in a with around the play and the whole thing follows. The bass walks a quarter note a step, written as degrees so it follows the key too, `swing on` puts the ride's off-beats late, and `octave 4` keeps the piano's voicings around middle C.",
    link: null,
    source: `pattern turnaround = {
  piano: chords ii7 V7|Imaj7 -
  with octave 2 {
    bass: notes 2---4---5---7---|1'---3'---5'---6'---
      |2'---4'---5---4---|3---5---6---7---
  }
  ride: x-
  hat.pedal: 2 4
  kick: 1 3
}

with tempo 132, swing on, octave 4 { play turnaround }`,
  },
  {
    section: "Harmony",
    title: "12-bar blues",
    byline: "Twelve bars, three chords, all dominant sevenths",
    body: "I7 for four bars, IV7 for two, back to I7 for two, then V7 IV7 I7 V7 to turn around. `%` repeats the bar before, and `swing on` makes the ride shuffle. Change `key A` to `key E` in the with and the chart moves.",
    link: null,
    source: `pattern blues = {
  guitar.electric: chords I7|%|%|%|IV7|%|I7|%|V7|IV7|I7|V7
  ride: x-
  snare: 2 4
  kick: 1 3
}

with swing on, key A { play blues }`,
  },
]

export const SECTIONS = [...new Set(GROOVES.map((g) => g.section))]

// A groove's name in an address: /grooves/the-sound-of-muzak/
export const slugOf = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

export const grooveBySlug = (slug: string) => GROOVES.find((g) => slugOf(g.title) === slug) || null

// A groove's words without their markdown, for a search result or a page's description.
export const plain = (text: string | undefined) => (text || "").replace(/[`*]/g, "")

// The text cell that goes above a groove's music cell: its title, byline, paragraph and link.
export function grooveText(g: Groove): string {
  return [`## ${g.title}`, g.byline, g.body, g.link && `[YouTube](${g.link})`]
    .filter(Boolean)
    .join("\n\n")
}

// A section's grooves as notebook cells: a text cell, then its music cell, for each.
export function grooveCells(section: string): { type: "text" | "music"; source: string }[] {
  return GROOVES.filter((g) => g.section === section).flatMap((g) => [
    { type: "text", source: grooveText(g) },
    { type: "music", source: g.source },
  ])
}

// The grooves that match a search, best first: each word of the query found in the title,
// the words, the section or the code counts. "7/8" finds "7 over 8". Everything, with no query.
export function searchGrooves(query = "") {
  const words = plain(query)
    .toLowerCase()
    .replace(/(\d+)\s*\/\s*(\d+)/g, "$1 over $2")
    .split(/[^a-z0-9.&+]+/)
    .filter(Boolean)
  if (!words.length) return [...GROOVES]
  const scored = GROOVES.map((g) => {
    const hay = {
      title: g.title.toLowerCase(),
      words: plain(`${g.byline} ${g.body} ${g.section}`).toLowerCase(),
      code: g.source.toLowerCase(),
    }
    let score = 0
    for (const w of words) {
      if (hay.title.includes(w)) score += 3
      else if (hay.words.includes(w)) score += 2
      else if (hay.code.includes(w)) score += 1
    }
    return { g, score }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.g)
}
