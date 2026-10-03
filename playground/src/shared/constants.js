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

- \`Am E7|G D\` plays chords, with \`|\` between bars. They're piano unless you set \`sound: guitar\` (or epiano, organ, pad, bass)
- \`snare: 2 4\` hits the snare on beats 2 and 4 of every bar
- \`ride: b..\` is a loop: the ride bell, then two rests, over and over

Settings like \`time: 7/8\` and \`tempo: 120\` apply from where you write them, including in the cells below. \`--\` starts a comment.

Press **Shift+Enter** to run a cell, or **Run All** to run everything. The full reference is under **Language** in the sidebar.`,
    },
    {
      type: "music",
      source: `-- what happens now
time: 7/8
crash: 1|.|.
ride: b..
kick: x..x...
snare: ....x..`,
    },
    {
      type: "music",
      source: `-- trains chorus
time: 4/4
tempo: 90
capo: 5
sound: guitar
A Am|C Cmaj7|D A|C Cmaj7|Cadd9|Em`,
    },
    {
      type: "music",
      source: `-- hotel california intro
tempo: 75
capo: 2
repeat 2:
  Am E7|G D|F C|Dm E7`,
    },
  ],
}
