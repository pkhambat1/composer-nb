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

// A walk through a mode: one chart goes up the scale and back down on the piano, over a
// groove, with the key and mode on a with around it. The chart is the same in every mode, as a
// numeral is the chord its scale has on that degree, so only the mode and what to listen for
// change. `says` is what to listen for, `against` the mode to change it to and compare.
const WALK_CHART = "i ii|iii iv|v vi|vii i'|vii vi|v iv|iii ii|i"
function walk(w: {
  title: string
  mode: string
  tempo: number
  byline: string
  says: string
  chart?: string
  against?: string
}): Groove {
  const chart = w.chart || WALK_CHART
  const against = w.against || "major"
  return {
    section: "Harmony",
    title: `${w.title} walk`,
    byline: w.byline,
    body:
      `One chart, \`chords ${chart}\`, goes up the scale and back down, and a lowercase numeral is ` +
      `the chord the scale has on that degree. ${w.says} Change \`mode ${w.mode}\` in the with to ` +
      `\`mode ${against}\` and the same chart turns into ` +
      `${against === "major" ? "D major" : "natural minor"}'s chords.`,
    link: null,
    source: `pattern walk = {
  piano: chords ${chart}
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

with key D, mode ${w.mode}, tempo ${w.tempo} { play walk }`,
  }
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
  walk({
    title: "Lydian",
    mode: "lydian",
    tempo: 84,
    byline: "D lydian: major with a raised fourth",
    says: "In D lydian those are D E F#m G#dim A Bm C#m. The G#dim on 4 is lydian's, and so is the major E on 2, a whole step above the root, where major has a minor one: the floating sound.",
  }),
  walk({
    title: "Mixolydian",
    mode: "mixolydian",
    tempo: 104,
    byline: "D mixolydian: major with a flat seventh",
    says: "In D mixolydian those are D Em F#dim G Am Bm C. The flat seventh makes 7 a major C, a whole step under the root, and turns 5 into a minor Am: the rock sound.",
  }),
  walk({
    title: "Dorian",
    mode: "dorian",
    tempo: 96,
    byline: "D dorian: minor with a major sixth",
    says: "In D dorian those are Dm Em F G Am Bdim C. 6 is Bdim and 4 is a major G, where natural minor has Gm: a minor key with a major iv.",
  }),
  walk({
    title: "Minor",
    mode: "minor",
    tempo: 92,
    byline: "D minor: the natural minor scale",
    says: "In D minor those are Dm Edim F Gm Am Bb C. 3, 6 and 7 are the major chords F, Bb and C, and 5 is the minor Am: the chords of natural minor.",
  }),
  walk({
    title: "Phrygian",
    mode: "phrygian",
    tempo: 88,
    byline: "D phrygian: minor with a flat second",
    says: "In D phrygian those are Dm Eb F Gm Adim Bb Cm. 2 is a major Eb, a half step above the root, and 5 is the diminished Adim: the dark, Spanish sound.",
  }),
  walk({
    title: "Locrian",
    mode: "locrian",
    tempo: 80,
    byline: "D locrian: a diminished root",
    says: "In D locrian those are Ddim Eb Fm Gm Ab Bb Cm. 1 is Ddim, so the root's own chord never sounds at rest: locrian is the mode that won't settle.",
  }),
  walk({
    title: "Harmonic minor",
    mode: "harmonicminor",
    tempo: 90,
    byline: "D harmonic minor: minor with a raised seventh",
    against: "minor",
    says: "In D harmonic minor those are Dm Edim Faug Gm A Bb C#dim. The raised seventh makes 5 a major A, the dominant a minor key wants, and puts a diminished C#dim a half step under the root; it also leaves a gap of three half steps between 6 and 7 and makes 3 an augmented Faug: the sound of a classical minor cadence.",
  }),
  walk({
    title: "Melodic minor",
    mode: "melodicminor",
    tempo: 96,
    byline: "D melodic minor: minor with a raised sixth and seventh",
    against: "minor",
    says: "In D melodic minor, going up, those are Dm Em Faug G A Bdim C#dim. Raising 6 and 7 makes 4 and 5 the major chords G and A, with a minor Em on 2 and an augmented Faug on 3, and turns 6 and 7 diminished: a minor key that sounds major above its third.",
  }),
  walk({
    title: "Whole tone",
    mode: "wholetone",
    tempo: 84,
    byline: "D whole tone: six notes, a whole step apart",
    chart: "i ii|iii iv|v vi|i' vi|v iv|iii ii",
    says: "In D whole tone those are Daug Eaug F#aug G#aug A#aug Caug: every chord is augmented, and every step is the same size, so there is no root to settle on.",
  }),
  {
    section: "Harmony",
    title: "Fifth of a fifth",
    byline: "of counts a note from another note: 5 of 5, 5 of (5 of 5)",
    body: "`5` is the 5th of the key's root, `5 of 5` the 5th of that, and `5 of (5 of 5)` the 5th of that again: one `of` a fifth up, and brackets chain them. This goes up the circle of fifths from the key's root, C G D A, and it follows the key: put `key F` in a with around the play and every note moves with it. Without the brackets, `5 of 5 of 5` is an error.",
    link: null,
    source: `pattern fifths = {
  piano: notes 1--- 5--- 5 of 5--- 5 of (5 of 5)---
  hat: x-
  kick: 1 3
}

with tempo 76 { play 2 bars fifths }`,
  },
  {
    section: "Harmony",
    title: "Dominants of dominants",
    byline: "of chains chords: V of (V of V) pulls to V of V, then V, then home",
    body: "`v of v` is the V counted from the key's V: in C, the V is G, so `v of v` is D, the chord that pulls to G. Chain them in brackets and each one pulls to the next: `v of (v of v)` is A, then D, G, and home to C. It follows the key too.",
    link: null,
    source: `pattern pulls = {
  piano: chords v of (v of v)|v of v|v|i
  hat: x-
  snare: 2 4
  kick: 1 3
}

with tempo 84 { play 4 bars pulls }`,
  },
  {
    section: "Harmony",
    title: "Circle of fourths",
    byline: "of counts a chord from another chord: iv of iv is Bb in C",
    body: "`iv` is the chord on the key's 4th: in C, F. `iv of iv` counts that numeral from F instead of from the key, so it is the 4th of F, Bb, and `iv of (iv of iv)` is the 4th of Bb, Eb. This goes round the circle of fourths on chords, C F Bb Eb, and it follows the key and the mode: put `key G` in a with around the play and every chord moves with it.",
    link: null,
    source: `pattern fourths = {
  piano: chords i|iv|iv of iv|iv of (iv of iv)
  hat: x-
  kick: 1 3
}

with tempo 76 { play 4 bars fourths }`,
  },
  {
    section: "Harmony",
    title: "Fifth of a chord",
    byline: "of counts a chord from another chord: v of v is D in C",
    body: "`v` is the chord on the key's 5th: in C, G. `v of v` counts that numeral from G instead of from the key, so it is the 5th of G, D, and `v of (v of v)` is the 5th of D, A. This walks up the circle of fifths on chords, C G D A, and it follows the key and the mode. (`v of i` would be the 5th of the key's own root, which is just `v`.)",
    link: null,
    source: `pattern fifths = {
  piano: chords i|v|v of v|v of (v of v)
  hat: x-
  kick: 1 3
}

with tempo 80 { play 4 bars fifths }`,
  },
  {
    section: "Harmony",
    title: "Scopes with with",
    byline: "with gives a block its own key, mode and tempo",
    body: "The same chart of chords, one per degree, played in three scopes. A `with` gives its block settings that last until its `}` and then put back what was set before, so the first scope is C major, the second C minor, and the third D dorian at a slower tempo. Nothing leaks out of a `with`, and nothing set at the top is lost.",
    link: null,
    source: `chords chart = i ii|iii iv|v vi|vii i'|vii vi|v iv|iii ii|i

play (
  with key C { piano: chords chart }
  with key C, mode minor { piano: chords chart }
  with key D, mode dorian, tempo 80 { piano: chords chart }
)`,
  },
  {
    section: "Harmony",
    title: "An octave for each part",
    byline: "with around one line gives it its own octave, and names stay inside",
    body: "A `with` in a pattern is a block that sounds with the other lines, so the bass can sit in octave 2 and the piano in octave 4 under one `set octave`. A name declared inside a `with`, like `walk` here, stays inside it: nothing below can use it, and it can't clash with a name of the same spelling elsewhere.",
    link: null,
    source: `with tempo 92 {
  play {
    with octave 2 {
      notes walk = 1---5---4---5---
      bass: notes walk
    }
    with octave 4 { piano: chords i v|vi iv }
    hat: x-
    kick: 1 3
  }
}`,
  },
  {
    section: "Harmony",
    title: "ii–V–I",
    byline: "The cadence jazz is built on",
    body: "Dm7 to G7 to Cmaj7: the ii sets up the V, and the V resolves home. Written as numerals, so the key moves it: put `key F` in a with around the play and the whole thing follows. The bass walks a quarter note a step, written as degrees so it follows the key too, `swing on` puts the ride's off-beats late, and `octave 4` keeps the piano's voicings around middle C.",
    link: null,
    source: `pattern turnaround = {
  piano: chords ii7 v7|imaj7 -
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
