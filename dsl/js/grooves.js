/* The grooves library: transcriptions, harmony cells and rudiments to start from. Each is
   a text cell's worth of words (a title, a byline, a paragraph and a link) and a music cell. The
   playground opens with the transcriptions, lists them all in its Grooves tab and builds a
   page for each; the MCP server searches them. Pure data, shared so there is one copy. */

export const GROOVES = [
  {
    section: "Transcriptions",
    title: "The Sound of Muzak",
    byline: "**Porcupine Tree** · *In Absentia* (2002) · drums by Gavin Harrison",
    body: "A groove in seven. The kick, snare and hi-hat repeat in every bar, and `bar 2` adds the lift at the end of every second bar: a burst of ghost notes, an open hi-hat, and the foot closing it.",
    link: "https://www.youtube.com/watch?v=4ulgVOBpNWA",
    source: `time 7 over 8
tempo 90

pattern groove = {
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

play {
  crash: 1
  groove
}`,
  },
  {
    section: "Transcriptions",
    title: "Circle of Manias",
    byline: "**Porcupine Tree** · *The Incident* (2009) · drums by Gavin Harrison",
    body: "Nine eighths to the bar. The hi-hat alternates open and closed on every eighth, while the kick and snare play a figure of eighteen sixteenths, so the two only line up again every two bars. The ghost notes at the top of the figure end in `...rest`: they play once each time through, and the other lines decide how long the pattern is.",
    link: "https://www.youtube.com/results?search_query=Porcupine+Tree+Circle+of+Manias",
    source: `time 9 over 8
tempo 100

pattern manias = {
  hat.open: x---
  hat: --x-
  kick: x--x-x---x--x-xx--
  snare: -------x--------x-
  snare.ghost: -xx, ...rest
}

play 4 bars manias`,
  },
  {
    section: "Transcriptions",
    title: "What Happens Now?",
    byline: "**Porcupine Tree** · *Nil Recurring* (2007) · drums by Gavin Harrison",
    body: "Lines of different lengths in one pattern. The kick and snare repeat every 7 steps, the ride bell every 3 and the guitar riff every 10, so they drift against each other and only all meet again on a bar line after 15 bars. The play opens with a two-step pickup, an accented rim hit, and the groove starts after it: two blocks on one line play one after the other. The crash plays once, in the groove's first bar, and `play 3 bars` stops it after three bars, pickup included. `octave 2` puts the riff right at the bottom of the guitar's range.",
    link: "https://www.youtube.com/watch?v=v0Iv4SYJW-k",
    source: `time 7 over 8
tempo 110
octave 2
guitar.electric muted

pattern groove = {
  kick: x--x---
  snare.rim: ----x--
  ride.bell: x--
  guitar.electric: D---E D-D--
}

play 3 bars {
  {
    snare.rim: ^-
  } {
    bar 1 crash: 1
    groove
  }
}`,
  },
  {
    section: "Transcriptions",
    title: "Gavin Harrison's paradiddle challenge",
    byline: "An independence exercise from **Gavin Harrison**",
    body: "The hands play paradiddles on the snare, accenting each PA with ghost notes in between. The feet play the same paradiddle three times slower: `every 3 steps` makes each of their steps last three 16ths. The kick is the right foot, and the hi-hat pedal is the left.",
    link: "https://www.youtube.com/watch?v=XEWmzQ_fJmw",
    source: `time 3 over 4
tempo 100

steps pa = ^---
steps radiddle = -xxx

pattern hands = {
  snare: pa
  snare.ghost: radiddle
}

pattern feet = every 3 steps {
  kick: ^-^^-^--
  hat.pedal: -x--x-xx
}

play {
  hands
  feet
}`,
  },
  {
    section: "Transcriptions",
    title: "Vodka For My Goat",
    byline: "**Polyrhythmics** · live studio session at KNKX",
    body: "Twelve steps to the bar. The ride bell and the kick each play their own 12-step pattern, the snare hits on the a of 1 and the e of 3, and ghost notes fill every other step.",
    link: "https://www.youtube.com/watch?v=YZPtPMCDEs4",
    source: `time 3 over 4
tempo 82.5

pattern groove = {
  ride.bell: x-x-x-xx-x-x
  snare: ---x--
  snare.ghost: -x
  kick: x-x--xx-x--x
}

play 2 bars groove`,
  },
  {
    section: "Transcriptions",
    title: "3 over 4 over 5",
    byline: "A polyrhythm exercise",
    body: "Three lines of different lengths in one pattern. The floor tom hits every 3 steps, the kick every 4 and the snare every 5. They drift apart, and only land together again after 60 steps: three bars of 5 over 4, which is where the pattern ends.",
    link: null,
    source: `time 5 over 4
tempo 120

pattern groove = {
  kick: x---
  snare: x----
  tom.floor: x--
}

play groove`,
  },
  {
    section: "Harmony",
    title: "ii–V–I",
    byline: "The cadence jazz is built on",
    body: "Dm7 to G7 to Cmaj7: the ii sets up the V, and the V resolves home. Written as numerals, so `key` moves it: change `key C` to `key F` and the whole thing follows. The bass walks a quarter note a step, `swing 67` puts the ride's off-beats late, and `octave 4` keeps the piano's voicings around middle C.",
    link: null,
    source: `tempo 132
swing 67
key C
octave 4

pattern turnaround = {
  piano: chords ii7 V7|Imaj7 -|ii7 V7|Imaj7 -
  bass: D2---F2---G2---B2---|C3---E3---G3---A3---|D3---F3---G2---F2---|E2---G2---A2---B2---
  ride: x-x- x-x- x-x- x-x-
  hat.pedal: 2 4
  kick: 1 3
}

play turnaround`,
  },
  {
    section: "Harmony",
    title: "Dorian vamp",
    byline: "D dorian: minor with a major sixth",
    body: "D to D on the white keys, so the B is natural. That B is what makes the IV chord (G) major under a minor i (Dm7), the sound of So What and Oye Como Va, and the melody leans on it. `key D dorian` reads the numerals in the mode: `i7 IV` is Dm7 G, and `VII` is C.",
    link: null,
    source: `tempo 100
key D dorian
octave 4

pattern vamp = {
  piano: {
    chords i7 - IV -|i7 - VII -
    A4---B4---C5---D5---|E5-------C5---A4---
  }
  bass: D2-------A2---B2---|D2-------C2---A2---
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

play vamp`,
  },
  {
    section: "Harmony",
    title: "Mixolydian vamp",
    byline: "A mixolydian: major with a flat seventh",
    body: "The G is natural in A, so the seventh degree is a G chord, not G#. I to VII to IV and back (A, G, D, A) is the rock vamp, and the melody lands on that G. In `key A mixolydian` the numeral `VII` is the mode's own seventh degree, so there is no flat to write.",
    link: null,
    source: `tempo 112
key A mixolydian
octave 4

pattern vamp = {
  guitar.electric: chords I - VII -|IV - I -
  piano: A4-B4-C#5---E5-------|D5-------C#5---G4---
  bass: A2-------G2-------|D2-------A2-------
  hat: x-
  snare: 2 4
  kick: 1 2& 3
}

play vamp`,
  },
  {
    section: "Harmony",
    title: "Lydian float",
    byline: "F lydian: major with a raised fourth",
    body: "F to F on the white keys puts a B natural where F major has a Bb. Two chords a whole step apart, F and G, and a melody that lands on the B: the floating, film-score sound. The `pad` holds each chord for a bar, written `I|II`.",
    link: null,
    source: `tempo 72
key F lydian
octave 4

pattern float = {
  pad: chords I|II
  piano: F4---A4---B4---C5---|D5-------B4---G4---
  bass: F2---------------|G2---------------
}

play float`,
  },
  {
    section: "Harmony",
    title: "12-bar blues",
    byline: "Twelve bars, three chords, all dominant sevenths",
    body: "I7 for four bars, IV7 for two, back to I7 for two, then V7 IV7 I7 V7 to turn around. `%` repeats the bar before, and `swing 67` makes the ride shuffle. Change `key A` to `key E` and the chart moves.",
    link: null,
    source: `tempo 120
swing 67
key A
octave 3

pattern blues = {
  guitar.electric: chords I7|%|%|%|IV7|%|I7|%|V7|IV7|I7|V7
  ride: x-x- x-x- x-x- x-x-
  snare: 2 4
  kick: 1 3
}

play blues`,
  },
  {
    section: "Harmony",
    title: "Harmonic minor cadence",
    byline: "A minor, with the leading tone raised",
    body: "A minor's own V chord is Em, and it pulls nowhere. Raise its third to G# and E7 leans into Am: the harmonic-minor cadence. `V7` in `key Am` spells it for you, and the melody's G# gets its sharp on the sheet.",
    link: null,
    source: `tempo 90
key Am
octave 4

pattern cadence = {
  piano: {
    chords i iv|V7 i
    E5-------F5-------|G#5---B4---C5-------
  }
  bass: A2-------D2-------|E2-------A2-------
  hat: x---
  snare.cross: 3
  kick: 1
}

play cadence`,
  },
  {
    section: "Rudiments",
    title: "Single stroke roll",
    byline: "A rudiment",
    body: "Alternate hands, every stroke the same. Slow it down with the tempo stepper, loop it, and let Ramp bring it back up a step at a time.",
    link: null,
    source: `tempo 100

pattern roll = {
  snare: xxxx xxxx xxxx xxxx
  sticking: RLRL RLRL RLRL RLRL
}

play 2 bars roll`,
  },
  {
    section: "Rudiments",
    title: "Double stroke roll",
    byline: "A rudiment",
    body: "Two strokes a hand. The second of each pair should be as full as the first: that's the whole exercise.",
    link: null,
    source: `tempo 90

pattern roll = {
  snare: xxxx xxxx xxxx xxxx
  sticking: RRLL RRLL RRLL RRLL
}

play 2 bars roll`,
  },
  {
    section: "Rudiments",
    title: "Single paradiddle",
    byline: "A rudiment",
    body: "Right left right right, left right left left, with the accent on the first of each four. The hands swap lead every group, which is the point of it.",
    link: null,
    source: `tempo 100

pattern paradiddle = {
  snare: ^xxx ^xxx ^xxx ^xxx
  sticking: RLRR LRLL RLRR LRLL
}

play 2 bars paradiddle`,
  },
  {
    section: "Rudiments",
    title: "Double paradiddle",
    byline: "A rudiment",
    body: "Six strokes a group, so it sits in 3 over 4: two singles, then the diddle. Accent the first of each six.",
    link: null,
    source: `time 3 over 4
tempo 100

pattern paradiddle = {
  snare: ^xxxxx ^xxxxx
  sticking: RLRLRR LRLRLL
}

play 2 bars paradiddle`,
  },
  {
    section: "Rudiments",
    title: "Paradiddle-diddle",
    byline: "A rudiment",
    body: "A paradiddle with a second diddle on the end, six strokes a group. The lead hand stays the same, so it loops without swapping.",
    link: null,
    source: `time 3 over 4
tempo 100

pattern pdd = {
  snare: ^xxxxx ^xxxxx
  sticking: RLRRLL RLRRLL
}

play 2 bars pdd`,
  },
  {
    section: "Rudiments",
    title: "Five-stroke roll",
    byline: "A rudiment",
    body: "Two doubles and a single: a `d` is a double stroke, two strokes of the same hand in one step, so the sticking names the hand of each double. The accent lands on the fifth stroke.",
    link: null,
    source: `tempo 80

pattern five = {
  snare: dd^- dd^-
  sticking: RLR- LRL-
}

play 2 bars five`,
  },
]

export const SECTIONS = [...new Set(GROOVES.map((g) => g.section))]

// A groove's name in an address: /grooves/the-sound-of-muzak/
export const slugOf = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

export const grooveBySlug = (slug) => GROOVES.find((g) => slugOf(g.title) === slug) || null

// A groove's words without their markdown, for a search result or a page's description.
export const plain = (text) => (text || "").replace(/[`*]/g, "")

// The text cell that goes above a groove's music cell: its title, byline, paragraph and link.
export function grooveText(g) {
  return [`## ${g.title}`, g.byline, g.body, g.link && `[YouTube](${g.link})`]
    .filter(Boolean)
    .join("\n\n")
}

// A section's grooves as notebook cells: a text cell, then its music cell, for each.
export function grooveCells(section) {
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
