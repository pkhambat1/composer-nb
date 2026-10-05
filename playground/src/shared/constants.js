// Shared application constants

export const APP_CONSTANTS = {
  // The docs site, built by Mintlify from the docs/ folder
  DOCS_URL: "https://pkhambat.mintlify.site",

  // Double-key press timeout (ms) for delete confirmation
  DOUBLE_KEY_TIMEOUT: 400,

  // Default theme settings
  THEME_DEFAULTS: {
    theme: "light",
    accent: "#1a73e8",
    density: "cozy",
    monoFont: "IBM Plex Mono",
  },

  // Available accent colors
  ACCENT_OPTIONS: ["#1a73e8", "#d97757", "#1f8a5b", "#a855f7"],

  // Available monospace fonts
  MONO_FONTS: ["IBM Plex Mono", "JetBrains Mono", "Fira Code", "Source Code Pro"],

  // Starter cells (id, runCount, output, status are added at runtime). Each piece has a
  // text cell that says what it is, then its music cell.
  STARTER_CELLS: [
    {
      type: "text",
      source: `## The Sound of Muzak

**Porcupine Tree** · *In Absentia* (2002) · drums by Gavin Harrison

A groove in seven. The kick, snare and hi-hat repeat in every bar, and \`bar 2\` adds the lift at the end of every second bar: a burst of ghost notes, an open hi-hat, and the foot closing it.

[YouTube](https://www.youtube.com/watch?v=4ulgVOBpNWA)`,
    },
    {
      type: "music",
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

play 6 bars {
  crash: 1
  groove
}`,
    },
    {
      type: "text",
      source: `## What Happens Now?

**Porcupine Tree** · *Nil Recurring* (2007) · drums by Gavin Harrison

Lines of different lengths in one pattern. The kick and snare repeat every 7 steps, the ride bell every 3 and the guitar riff every 10, so they drift against each other and only all meet again on a bar line after 15 bars. The crash plays once, with the groove repeating under it.

[YouTube](https://www.youtube.com/watch?v=v0Iv4SYJW-k)`,
    },
    {
      type: "music",
      source: `time 7 over 8
tempo 100

pattern groove = {
  kick: x--x---
  snare: ----x--
  ride.bell: x--
  guitar.electric: F---GF-F--
}

play {
  crash: 1
  groove
}`,
    },
    {
      type: "text",
      source: `## Gavin Harrison's paradiddle challenge

An independence exercise from **Gavin Harrison**

The hands play paradiddles on the snare, accenting each PA with ghost notes in between. The feet play the same paradiddle three times slower: \`every 3 steps\` makes each of their steps last three 16ths. The kick is the right foot, and the hi-hat pedal is the left.

[YouTube](https://www.youtube.com/watch?v=XEWmzQ_fJmw)`,
    },
    {
      type: "music",
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

play 4 bars {
  hands
  feet
}`,
    },
    {
      type: "text",
      source: `## Vodka For My Goat

**Polyrhythmics** · live studio session at KNKX

Twelve steps to the bar. The ride bell and the kick each play their own 12-step pattern, the snare lands halfway through the bar, and ghost notes fill every other step.

[YouTube](https://www.youtube.com/watch?v=YZPtPMCDEs4)`,
    },
    {
      type: "music",
      source: `time 3 over 4
tempo 82.5

pattern groove = {
  ride.bell: x-x-x-xx-x-x
  snare: ------x-----
  snare.ghost: -x
  kick: x-x-xx--x-xx
}

play 4 bars groove`,
    },
    {
      type: "text",
      source: `## 3 over 4 over 5

A polyrhythm exercise

Three lines of different lengths in one pattern. The floor tom hits every 3 steps, the kick every 4 and the snare every 5. They drift apart, and only land together again after 60 steps: three bars of 5 over 4, which is where the pattern ends.`,
    },
    {
      type: "music",
      source: `time 5 over 4
tempo 120

pattern groove = {
  kick: x---
  snare: x----
  tom.floor: x--
}

play groove`,
    },
  ],
}
