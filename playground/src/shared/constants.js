// Shared application constants

export const APP_CONSTANTS = {
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

  // Starter cells (id, runCount, output, status are added at runtime)
  STARTER_CELLS: [
    {
      type: "text",
      source: `# Music Composer Notebook

A notebook for sketching music. In a **music cell**:

- \`tempo 90\` is a setting: a reserved word and its value
- \`verse = Am F|C G\` is a variable: your own name for steps or chords
- \`pattern groove { ... }\` is a pattern: lines that play together
- \`kick: x--x---\` inside braces is an instrument and what it plays, one instrument per line
- \`play { ... }\` plays what's after it, a block or one line

Settings and names carry on into the cells below. \`//\` starts a comment.

Press **Shift+Enter** to run a cell, or **Run All** to run everything. The full reference is under **Language** in the sidebar.`,
    },
    {
      type: "music",
      source: `// what happens now: crash once, groove twice
time 7 over 8

pattern groove 3 bars {
  kick: loop x--x---
  snare: loop ----x--
  ride.bell: loop x--
}

play {
  crash: 1
  groove * 2
}`,
    },
    {
      type: "music",
      source: `// trains chorus
time 4 over 4
tempo 90
sound guitar
capo 5
play chords: A Am|C Cmaj7|D A|C Cmaj7|Cadd9|Em`,
    },
    {
      type: "music",
      source: `// hotel california intro
tempo 75
capo 2
intro = Am E7|G D|F C|Dm E7
play chords: intro intro`,
    },
  ],
}
