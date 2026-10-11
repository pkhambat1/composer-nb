/* The grooves library: transcriptions and rudiments to start from. Each is a text cell's
   worth of words (a title, a byline, a paragraph and a link) and a music cell. The
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
