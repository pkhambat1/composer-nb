// Shared application constants
// This file is loaded before other app files so all global constants are available

window.APP_CONSTANTS = {
  // Double-key press timeout (ms) for delete confirmation
  DOUBLE_KEY_TIMEOUT: 400,

  // Default tweaks/settings
  TWEAK_DEFAULTS: {
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

A notebook for sketching chord progressions. Each **code cell** below is parsed as music — use \`@key\`, \`@tempo\`, \`@inst\` directives, then a stream of chord tokens.

**Chord tokens:**
- Absolute: \`Cmaj7\`, \`F#m\`, \`Bb7\`, \`Dm9\`, \`G7sus4\`, \`Em7b5\`, \`C/E\`
- Roman: \`I\`, \`ii\`, \`V7\`, \`vi\`, \`viio\`, \`bVII\`, \`Imaj7\`

**Rhythm:** suffix a chord with \`.w\` (whole), \`.h\` (half), \`.q\` (quarter), \`.e\` (eighth), or \`:N\` for N beats. \`~\` is a rest. Tokens without a suffix split the bar evenly.

Comments use \`--\` (double dash), so \`#\` stays free for sharps like \`F#m\`, \`C#maj7\`.

Hit **Shift+Enter** to render a cell, or **Run All** up top.`,
    },
    {
      type: "music",
      source: `@key C
@tempo 72
@inst piano

-- Drifting minor 9th vamp
Dm9.h  Cmaj9/E.h
Dm9.h  Cmaj9/E.h
Dm9.h  Cmaj9/E.h
G7`,
    },
    {
      type: "music",
      source: `@key C
@tempo 72
@inst guitar

-- Same vamp, on guitar
Dm9.h  Cmaj9/E.h
Dm9.h  Cmaj9/E.h
Dm9.h  Cmaj9/E.h
G7`,
    },
    {
      type: "music",
      source: `@key C
@tempo 72
@inst piano

Fmaj7/D`,
    },
  ],
}
