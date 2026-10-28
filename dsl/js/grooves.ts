/* The grooves library: transcriptions, harmony cells and rudiments to start from. Each is
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
    source: `set time 7 over 8
set tempo 90
set swing off

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
    body: "Nine eighths to the bar. The hi-hat alternates open and closed on every eighth, while the kick plays a figure of eighteen sixteenths and the snare one of nine, so they only line up again every two bars. The ghost notes at the top of the figure end in `...rest`: they play once each time through, and the other lines decide how long the pattern is.",
    link: "https://www.youtube.com/results?search_query=Porcupine+Tree+Circle+of+Manias",
    source: `set time 9 over 8
set tempo 100
set swing off

pattern manias = {
  hat.open: x---
  hat: --x-
  kick: x--x-x---x--x-xx--
  snare: -------x-
  snare.ghost: -xx, ...rest
}

play 4 bars manias`,
  },
  {
    section: "Transcriptions",
    title: "What Happens Now?",
    byline: "**Porcupine Tree** · *Nil Recurring* (2007) · drums by Gavin Harrison",
    body: "Lines of different lengths in one pattern. The kick and snare repeat every 7 steps, the ride bell every 3 and the guitar riff every 10, so they drift against each other and only all meet again on a bar line after 15 bars. The play opens with a two-step pickup, an accented rim hit, and the groove starts after it: the two blocks are in brackets, so they play one after the other. The crash plays once, in the groove's first bar, and `play 3 bars` stops it after three bars, pickup included. `set octave 2` puts the riff right at the bottom of the guitar's range.",
    link: "https://www.youtube.com/watch?v=v0Iv4SYJW-k",
    source: `set time 7 over 8
set tempo 110
set swing off
set octave 2
set guitar.electric muted

pattern groove = {
  kick: x--x---
  snare.rim: ----x--
  ride.bell: x--
  guitar.electric: D---E D-D--
}

play 3 bars ({ snare.rim: ^- } {
  bar 1 crash: 1
  groove
})`,
  },
  {
    section: "Transcriptions",
    title: "Gavin Harrison's paradiddle challenge",
    byline: "An independence exercise from **Gavin Harrison**",
    body: "The hands play paradiddles on the snare, accenting each PA with ghost notes in between. The feet play the same paradiddle three times slower: `every 3 steps` makes each of their steps last three 16ths. The kick is the right foot, and the hi-hat pedal is the left.",
    link: "https://www.youtube.com/watch?v=XEWmzQ_fJmw",
    source: `set time 3 over 4
set tempo 100
set swing off

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
    body: "Twelve steps to the bar. The ride bell plays a 12-step pattern and the kick a 6-step one, the snare hits on the a of 1 and the e of 3, and ghost notes fill every other step.",
    link: "https://www.youtube.com/watch?v=YZPtPMCDEs4",
    source: `set time 3 over 4
set tempo 82.5
set swing off

pattern groove = {
  ride.bell: x-x-x-xx-x-x
  snare: ---x--
  snare.ghost: -x
  kick: x-x--x
}

play 2 bars groove`,
  },
  {
    section: "Transcriptions",
    title: "3 over 4 over 5",
    byline: "A polyrhythm exercise",
    body: "Three lines of different lengths in one pattern. The floor tom hits every 3 steps, the kick every 4 and the snare every 5. They drift apart, and only land together again after 60 steps: three bars of 5 over 4, which is where the pattern ends.",
    link: null,
    source: `set time 5 over 4
set tempo 120
set swing off

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
    body: "Dm7 to G7 to Cmaj7: the ii sets up the V, and the V resolves home. Written as numerals, so `key` moves it: change `set key C` to `set key F` and the whole thing follows. The bass walks a quarter note a step, `set swing on` puts the ride's off-beats late, and `set octave 4` keeps the piano's voicings around middle C.",
    link: null,
    source: `set time 4 over 4
set tempo 132
set swing on
set key C
set octave 4

pattern turnaround = {
  piano: chords ii7 V7|Imaj7 -
  bass: D2---F2---G2---B2---|C3---E3---G3---A3---
    |D3---F3---G2---F2---|E2---G2---A2---B2---
  ride: x-
  hat.pedal: 2 4
  kick: 1 3
}

play turnaround`,
  },
  {
    section: "Harmony",
    title: "12-bar blues",
    byline: "Twelve bars, three chords, all dominant sevenths",
    body: "I7 for four bars, IV7 for two, back to I7 for two, then V7 IV7 I7 V7 to turn around. `%` repeats the bar before, and `set swing on` makes the ride shuffle. Change `set key A` to `set key E` and the chart moves.",
    link: null,
    source: `set time 4 over 4
set tempo 120
set swing on
set key A
set octave 3
set guitar.electric clean

pattern blues = {
  guitar.electric: chords I7|%|%|%|IV7|%|I7|%|V7|IV7|I7|V7
  ride: x-
  snare: 2 4
  kick: 1 3
}

play blues`,
  },
  {
    section: "Harmony",
    title: "Lydian walk",
    byline: "D lydian: major with a raised fourth",
    body: "The scale goes up and back down, and on every second beat the chord underneath has that note as its root, so you hear all seven notes and all seven chords: D F#m A C#m, then D Bm G#dim E, and back to D. The G#, the raised fourth, is lydian's colour. It makes the II chord, E, major, and E falling to D at the end is the floating sound lydian is known for. Degrees and numerals count on D major, so the raised fourth is written `#4`.",
    link: null,
    source: `set time 4 over 4
set tempo 84
set swing off
set key D
set mode lydian
set octave 3

pattern walk = {
  with octave 4 {
    piano: 1---2---3---#4---|5---6---7---1'---
      |1'---7---6---5---|#4---3---2-------|1 bars 1
  }
  guitar: chords I iii|V vii|I vi|#ivdim II|I
  with octave 2 {
    bass: 1-------3-------|5-------7-------
      |1'-------6-------|#4-------2-------|1 bars 1
  }
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

play walk`,
  },
  {
    section: "Harmony",
    title: "Mixolydian walk",
    byline: "D mixolydian: major with a flat seventh",
    body: "The scale goes up and back down, and on every second beat the chord underneath has that note as its root, so you hear all seven notes and all seven chords: D F#dim Am C, then D Bm G Em, and back to D. The C natural, the flat seventh, is mixolydian's sound. It makes the v chord minor (Am) and puts a major chord, C, a whole step under the root. On the way down, the tune's C over the D chord is a dominant seventh that never resolves. Degrees and numerals count on D major, so the flat seventh is written `b7`.",
    link: null,
    source: `set time 4 over 4
set tempo 104
set swing off
set key D
set mode mixolydian
set octave 3

pattern walk = {
  with octave 4 {
    piano: 1---2---3---4---|5---6---b7---1'---
      |1'---b7---6---5---|4---3---2-------|1 bars 1
  }
  guitar: chords I iiidim|v bVII|I vi|IV ii|I
  with octave 2 {
    bass: 1-------3-------|5-------b7-------
      |1'-------6-------|4-------2-------|1 bars 1
  }
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

play walk`,
  },
  {
    section: "Harmony",
    title: "Dorian walk",
    byline: "D dorian: minor with a major sixth",
    body: "The scale goes up and back down, and on every second beat the chord underneath has that note as its root, so you hear all seven notes and all seven chords: Dm F Am C, then Dm Bdim G Em, and back to Dm. The B natural, a major sixth in a minor key, is dorian's colour. It makes the IV chord, G, major where natural minor has Gm. Degrees and numerals count on D major, so the minor third and seventh are written `b3` and `b7`, and the sixth needs no mark.",
    link: null,
    source: `set time 4 over 4
set tempo 96
set swing off
set key D
set mode dorian
set octave 3

pattern walk = {
  with octave 4 {
    piano: 1---2---b3---4---|5---6---b7---1'---
      |1'---b7---6---5---|4---b3---2-------|1 bars 1
  }
  guitar: chords i bIII|v bVII|i vidim|IV ii|i
  with octave 2 {
    bass: 1-------b3-------|5-------b7-------
      |1'-------6-------|4-------2-------|1 bars 1
  }
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

play walk`,
  },
  {
    section: "Harmony",
    title: "Minor walk",
    byline: "D minor: the natural minor scale",
    body: "The scale goes up and back down, and on every second beat the chord underneath has that note as its root, so you hear all seven notes and all seven chords: Dm F Am C, then Dm Bb Gm Edim, and back to Dm. The Bb, the flat sixth, is what makes it minor rather than dorian: hear it over the Bb chord on the way down, and the diminished ii, Edim, just before the end. Degrees and numerals count on D major, so the flats are written out: `b3`, `b6`, `b7`.",
    link: null,
    source: `set time 4 over 4
set tempo 92
set swing off
set key D
set mode minor
set octave 3

pattern walk = {
  with octave 4 {
    piano: 1---2---b3---4---|5---b6---b7---1'---
      |1'---b7---b6---5---|4---b3---2-------|1 bars 1
  }
  guitar: chords i bIII|v bVII|i bVI|iv iidim|i
  with octave 2 {
    bass: 1-------b3-------|5-------b7-------
      |1'-------b6-------|4-------2-------|1 bars 1
  }
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

play walk`,
  },
  {
    section: "Harmony",
    title: "Phrygian walk",
    byline: "D phrygian: minor with a flat second",
    body: "The scale goes up and back down, and on every second beat the chord underneath has that note as its root, so you hear all seven notes and all seven chords: Dm F Adim Cm, then Dm Bb Gm Eb, and back to Dm. The Eb, a half step above the root, is phrygian's dark, Spanish sound, and the Eb chord falling to Dm at the end is the phrygian cadence. Degrees and numerals count on D major, so the flat second is written `b2`.",
    link: null,
    source: `set time 4 over 4
set tempo 88
set swing off
set key D
set mode phrygian
set octave 3

pattern walk = {
  with octave 4 {
    piano: 1---b2---b3---4---|5---b6---b7---1'---
      |1'---b7---b6---5---|4---b3---b2-------|1 bars 1
  }
  guitar: chords i bIII|vdim bvii|i bVI|iv bII|i
  with octave 2 {
    bass: 1-------b3-------|5-------b7-------
      |1'-------b6-------|4-------b2-------|1 bars 1
  }
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

play walk`,
  },
  {
    section: "Harmony",
    title: "Locrian walk",
    byline: "D locrian: a diminished root",
    body: "The scale goes up and back down, and on every second beat the chord underneath has that note as its root, so you hear all seven notes and all seven chords: Ddim Fm Ab Cm, then Ddim Bb Gm Eb, and back to Ddim. The fifth is flat (Ab), so the root's own chord is diminished and never sounds at rest: locrian is the mode that won't settle. Degrees and numerals count on D major, so every flat is written: `b2`, `b3`, `b5`, `b6`, `b7`.",
    link: null,
    source: `set time 4 over 4
set tempo 80
set swing off
set key D
set mode locrian
set octave 3

pattern walk = {
  with octave 4 {
    piano: 1---b2---b3---4---|b5---b6---b7---1'---
      |1'---b7---b6---b5---|4---b3---b2-------|1 bars 1
  }
  guitar: chords idim biii|bV bvii|idim bVI|iv bII|idim
  with octave 2 {
    bass: 1-------b3-------|b5-------b7-------
      |1'-------b6-------|4-------b2-------|1 bars 1
  }
  hat: x-
  snare.cross: 2 4
  kick: 1 3
}

play walk`,
  },
  {
    section: "Rudiments",
    title: "Single stroke roll",
    byline: "RLRL",
    body: "Alternate hands, every stroke the same. Start slow: lower `set tempo` until every stroke is even, then bring it back up ten at a time.",
    link: null,
    source: `set time 4 over 4
set tempo 100
set swing off

pattern roll = {
  snare: x
  sticking: RL
}

play 2 bars roll`,
  },
  {
    section: "Rudiments",
    title: "Double stroke roll",
    byline: "RRLL",
    body: "Two strokes a hand. The second of each pair should be as full as the first: that's the whole exercise.",
    link: null,
    source: `set time 4 over 4
set tempo 90
set swing off

pattern roll = {
  snare: x
  sticking: RRLL
}

play 2 bars roll`,
  },
  {
    section: "Rudiments",
    title: "Single paradiddle",
    byline: "RLRR LRLL",
    body: "Right left right right, left right left left, with the accent on the first of each four. The hands swap lead every group, which is the point of it.",
    link: null,
    source: `set time 4 over 4
set tempo 100
set swing off

pattern paradiddle = {
  snare: ^xxx
  sticking: RLRR LRLL
}

play 2 bars paradiddle`,
  },
  {
    section: "Rudiments",
    title: "Double paradiddle",
    byline: "RLRLRR LRLRLL",
    body: "Six strokes a group, so it sits in 3 over 4: two singles, then the diddle. Accent the first of each six.",
    link: null,
    source: `set time 3 over 4
set tempo 100
set swing off

pattern paradiddle = {
  snare: ^xxxxx
  sticking: RLRLRR LRLRLL
}

play 2 bars paradiddle`,
  },
  {
    section: "Rudiments",
    title: "Paradiddle-diddle",
    byline: "RLRRLL",
    body: "A paradiddle with a second diddle on the end, six strokes a group. The lead hand stays the same, so it loops without swapping.",
    link: null,
    source: `set time 3 over 4
set tempo 100
set swing off

pattern pdd = {
  snare: ^xxxxx
  sticking: RLRRLL
}

play 2 bars pdd`,
  },
  {
    section: "Rudiments",
    title: "Five-stroke roll",
    byline: "RRLLR LLRRL",
    body: "Two doubles and a single: a `d` is a double stroke, two strokes of the same hand in one step, so the sticking names the hand of each double. The accent lands on the fifth stroke.",
    link: null,
    source: `set time 4 over 4
set tempo 80
set swing off

pattern five = {
  snare: dd^-
  sticking: RLR- LRL-
}

play 2 bars five`,
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
export function grooveCells(section: string) {
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
