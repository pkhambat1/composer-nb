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
      source: `@key Bm
@tempo 100
@inst guitar

-- Trains (Porcupine Tree)
Bm.h  A.h
G.h  F#m.h
Bm.h  A.h
G.h  F#m.h`,
    },
    {
      type: "music",
      source: `@key Em
@tempo 80
@inst guitar

-- Arriving Somewhere But Not Here (Porcupine Tree)
Em.w
C.w
G.h  D.h
Em.w`,
    },
    {
      type: "music",
      source: `@key Bm
@tempo 120
@inst guitar

-- The Sound of Muzak (Porcupine Tree)
Bm  A  G  F#m
Bm  A  G  F#m`,
    },
    {
      type: "music",
      source: `@key Bm
@tempo 70
@inst guitar

-- Deform to Form a Star (Steven Wilson)

-- [INTRO - PIANO]
Bm F#m/A G
Bm F#m/C# G
Em Bm/D A/C#
F/C Em/B Asus A
Bm

-- [INTRO]
Bm F#sus
G/A A E/F# F#
Bm F#sus F#
G/A A E/F# F#

-- [VERSE 1]
Bm F#sus
G/A A E/F# F#
Bm F#m
G/A A E/F# F#

-- [INTERLUDE 1]
E/F# F#
D/E E D/E E
C/D D C/D D
D/E E D/E E
E/F# F#

-- [VERSE 2]
Bm F#sus
G/A A E/F# F#
Bm F#sus F#m
G/A A E/F# F#

-- [PRE-CHORUS] 3/8
D/E E D/E E
C/D D C/D D
D/E E D/E E
C/D D C/D D
BbM7 Am7 D/G E/F# F#/E G/D A/C#

-- [CHORUS]
B F#m
B F#m
G A
B F#m
B F#m
G A

-- [INTERLUDE 2]
Bsus F#sus
Bm F#sus
G/A A E/F# F#
Bm F#sus F#m
G/A A E/F# F# E/F# F#
D/E E D/E E
C/D D C/D D
D/E E D/E E E/F# F#

-- [VERSE 3]
Bm F#sus
G/A A E/F# F#
Bm F#sus
G/A A E/F# F#

-- [PRE-CHORUS 2] 3/8
E/F# F#
D/E E D/E E
C/D D C/D D
BbM7 Am7 D/G E/F# F#/E G/D A/C#

-- [CHORUS]
B F#m
B F#m
G A
B F#m
B F#m
G A

-- [CHORUS - INSTRUMENTAL]
B F#m
B F#m
G A
B F#m
B F#m
G A

-- [TRANSITION] 6/8
D Asus A
FM7 Em A AM7
DM7 D Asus/E A
FM7 Em AM7 C#m/G#
DM7 D C/G B

-- [OUTRO]
B GM7 F#m/A
B GM7 F#m/A
B GM7 F#m/A
B GM7 F#m/A
B GM7 F#m/A
B GM7 F#m/A
B GM7 F#m/A
B GM7 F#m/A
B GM7 F#m/A
B GM7`,
    },
  ],
}
