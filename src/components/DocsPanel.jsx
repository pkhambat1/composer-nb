// components/DocsPanel.jsx — Built-in DSL documentation
import React from "react"
import { marked } from "marked"
import { highlightMusic } from "../lib/highlight.js"

// ---------------------------------------------------------------------------
// Doc pages — plain markdown (converted from MDX)
// ---------------------------------------------------------------------------

const PAGES = [
  {
    id: "intro",
    title: "Introduction",
    group: "Getting Started",
    body: `# Composer.nb

A Jupyter-style notebook for sketching chord progressions. Each **code cell** is parsed as music using a simple DSL — set directives like key, tempo, and instrument, then write chord tokens.

The app renders audio from your chord progressions, displays waveforms, guitar/piano chord diagrams, and lets you export to WAV.

## How it works

1. Write chord progressions in code cells using the music DSL
2. Hit **Shift+Enter** to render a cell, or **Run All** to render everything
3. Listen to playback, view chord diagrams, and export audio

## Cell types

| Type | Description |
|------|-------------|
| **Music cells** | Write chord progressions using the DSL. Each cell is parsed, rendered to audio, and displayed with chord diagrams. |
| **Text cells** | Markdown cells for notes, section headers, and annotations. Supports headings, bold, italic, code, lists, and links. |

## Quick example

\`\`\`
@tempo 120
@inst guitar

-- Verse
Am F C G
Am F C.h G.h

-- Chorus
F G Am Em
F G C
\`\`\``,
  },
  {
    id: "quickstart",
    title: "Quickstart",
    group: "Getting Started",
    body: `# Quickstart

Write your first chord progression in 60 seconds.

## Step 1: Set up directives

Every music cell starts with directives that configure the key, tempo, and instrument.

\`\`\`
@key C
@tempo 100
@inst piano
\`\`\`

## Step 2: Write chords

Each line is one bar. Chords on a line split the bar evenly.

\`\`\`
C Am F G
\`\`\`

This gives you four chords, one beat each, in a single bar.

## Step 3: Add structure with comments

Use \`--\` for comments. Section labels help organize your progression:

\`\`\`
@key G
@tempo 90
@inst guitar

-- Verse
G Em C D
G Em C D

-- Chorus
C D G Em
C D G
\`\`\`

## Step 4: Run the cell

Press **Shift+Enter** to render. You'll see:
- A waveform with playback controls
- Chord diagrams (guitar fingerings or piano keys)
- Export to WAV button

## Step 5: Customize rhythm

Add duration suffixes to control how long each chord lasts:

\`\`\`
-- Half notes (2 beats each)
Am.h G.h

-- One chord per bar (whole note)
Am
G
F
E
\`\`\`

> **Tip:** If you don't add a duration suffix, chords on a line split the bar evenly. One chord per line = one whole bar.`,
  },
  {
    id: "directives",
    title: "Directives",
    group: "Language Reference",
    body: `# Directives

Directives start with \`@\` and configure the cell. Place them at the top of a cell before any chord tokens.

## Available directives

| Directive | Default | Description |
|-----------|---------|-------------|
| \`@key\` | \`C\` | Key signature (only affects roman numeral chords) |
| \`@tempo\` | \`96\` | Beats per minute |
| \`@inst\` | \`piano\` | Instrument (\`piano\` or \`guitar\`) |
| \`@beats\` | \`4\` | Beats per bar (time signature numerator) |
| \`@octave\` | \`3\` | Base octave (0–8) |

## Key signatures

The \`@key\` directive accepts a root note with optional mode:

\`\`\`
@key C        -- C major
@key Am       -- A minor
@key F#m      -- F# minor
@key Bb       -- Bb major
\`\`\`

\`@key\` only affects roman numeral chords. \`IV\` in the key of C resolves to F major, but in the key of G it resolves to C major. Absolute chords like \`Am\` or \`F#m\` are unaffected.

## Instruments

| Value | Description |
|-------|-------------|
| \`piano\` | Piano voicing with keyboard chord diagrams |
| \`guitar\` | Guitar voicing with fingering chord diagrams |

## Changing directives mid-cell

You can change directives partway through a cell. This is useful for time signature changes:

\`\`\`
@key Am
@tempo 120

-- Verse (4/4)
@beats 4
Am G F E

-- Bridge (3/4)
@beats 3
Dm Am G
\`\`\``,
  },
  {
    id: "chords",
    title: "Chord Tokens",
    group: "Language Reference",
    body: `# Chord Tokens

Chord tokens are the core of the music DSL. Each token represents a chord to be played.

## Absolute chords

Standard chord names with any quality suffix:

\`\`\`
C       -- C major
Am      -- A minor
F#m     -- F# minor
Bb7     -- Bb dominant 7th
Cmaj7   -- C major 7th
Dm9     -- D minor 9th
G7sus4  -- G dominant 7th suspended 4th
Em7b5   -- E half-diminished 7th
\`\`\`

## Supported qualities

| Suffix | Quality |
|--------|---------|
| _(none)_ | Major |
| \`m\` | Minor |
| \`7\` | Dominant 7th |
| \`maj7\` | Major 7th |
| \`m7\` | Minor 7th |
| \`dim\` | Diminished |
| \`dim7\` | Diminished 7th |
| \`aug\` | Augmented |
| \`sus2\` | Suspended 2nd |
| \`sus4\` | Suspended 4th |
| \`6\` | Major 6th |
| \`m6\` | Minor 6th |
| \`9\` | Dominant 9th |
| \`m9\` | Minor 9th |
| \`11\` | Dominant 11th |
| \`add9\` | Add 9 |
| \`m7b5\` | Half-diminished |
| \`7sus4\` | Dominant 7th sus4 |

## Slash chords

Use \`/\` to specify a bass note:

\`\`\`
C/E     -- C major over E bass
Am/G    -- A minor over G bass
F#m/C#  -- F# minor over C# bass
\`\`\`

## Roman numeral chords

Roman numerals are resolved against the \`@key\` directive. Uppercase = major, lowercase = minor:

\`\`\`
@key C

I       -- C major
ii      -- D minor
iii     -- E minor
IV      -- F major
V       -- G major
vi      -- A minor
viidim  -- B diminished
\`\`\`

### Chromatic alterations

Use \`b\` or \`#\` before the numeral:

\`\`\`
bVII    -- Bb major (in key of C)
#IV     -- F# (in key of C)
\`\`\`

### Quality suffixes on roman numerals

\`\`\`
V7      -- G dominant 7th (in key of C)
Imaj7   -- C major 7th
ii7     -- D minor 7th
\`\`\`

`,
  },
  {
    id: "rhythm",
    title: "Rhythm & Duration",
    group: "Language Reference",
    body: `# Rhythm & Duration

## Duration suffixes

Suffix a chord token with a dot and a letter to set its duration:

| Suffix | Beats | Name |
|--------|-------|------|
| \`.w\` | 4 | Whole note |
| \`.h\` | 2 | Half note |
| \`.q\` | 1 | Quarter note |
| \`.e\` | 0.5 | Eighth note |
| \`.s\` | 0.25 | Sixteenth note |

### Examples

\`\`\`
Am.w    -- A minor for 4 beats (whole bar)
Am.h    -- A minor for 2 beats
Am.q    -- A minor for 1 beat
Am.e    -- A minor for half a beat
\`\`\`

## Implicit duration

Chords without a duration suffix split the remaining beats in the bar evenly:

\`\`\`
@beats 4

Am F C G     -- 1 beat each (4 chords, 4 beats)
Am G         -- 2 beats each (2 chords, 4 beats)
Am           -- 4 beats (1 chord, entire bar)
\`\`\`

### Mixing explicit and implicit

\`\`\`
Am.h F G     -- Am gets 2 beats, F and G split the remaining 2 (1 each)
\`\`\`

## Rests

Use \`~\` or \`_\` for rests. Duration suffixes work on rests too:

\`\`\`
Am.h ~.h     -- A minor for 2 beats, then 2 beats of silence
C ~ G ~      -- Alternating chords and rests, 1 beat each
\`\`\``,
  },
  {
    id: "shortcuts",
    title: "Keyboard Shortcuts",
    group: "App",
    body: `# Keyboard Shortcuts

## Cell execution

| Key | Action |
|-----|--------|
| \`Shift+Enter\` | Run cell and move to next (or insert new cell at end) |
| \`Ctrl+Enter\` / \`Cmd+Enter\` | Run cell without moving |
| \`Alt+Enter\` | Run cell and insert new cell below |

## Navigation

| Key | Action |
|-----|--------|
| \`J\` or \`↓\` | Select next cell |
| \`K\` or \`↑\` | Select previous cell |
| \`Enter\` | Enter edit mode on selected cell |
| \`Esc\` | Exit edit mode (back to command mode) |

## Cell management

| Key | Action |
|-----|--------|
| \`A\` | Insert new music cell above |
| \`B\` | Insert new music cell below |
| \`DD\` | Delete selected cell (press D twice quickly) |
| \`Z\` | Undo last delete |

## Code editing

| Key | Action |
|-----|--------|
| \`Cmd+/\` or \`Ctrl+/\` | Toggle comment on selected lines |

> **Note:** Navigation and cell management shortcuts only work in **command mode** (when not editing a cell). Press \`Esc\` first to exit edit mode.`,
  },
]

// Group pages for TOC nav
const GROUPS = []
const seen = new Set()
for (const p of PAGES) {
  if (!seen.has(p.group)) {
    seen.add(p.group)
    GROUPS.push(p.group)
  }
}

export default function DocsPanel({ style }) {
  const contentRef = React.useRef(null)
  const [activeId, setActiveId] = React.useState(PAGES[0].id)

  // Track which section is visible while scrolling
  React.useEffect(() => {
    const container = contentRef.current
    if (!container) return
    const onScroll = () => {
      const top = container.scrollTop + 40
      let current = PAGES[0].id
      for (const p of PAGES) {
        const el = container.querySelector(`#docs-${p.id}`)
        if (el && el.offsetTop <= top) current = p.id
      }
      setActiveId(current)
    }
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => container.removeEventListener("scroll", onScroll)
  }, [])

  const scrollTo = React.useCallback((id) => {
    const el = contentRef.current?.querySelector(`#docs-${id}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const renderer = React.useMemo(() => {
    const r = new marked.Renderer()
    r.code = function ({ text }) {
      const lines = highlightMusic(text)
      const highlighted = lines
        .map((parts) =>
          parts
            .map((p) =>
              p.c
                ? `<span class="${p.c}">${p.s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`
                : p.s.replace(/&/g, "&amp;").replace(/</g, "&lt;"),
            )
            .join(""),
        )
        .join("\n")
      const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")
      return `<div class="docs-code-wrap"><button class="docs-copy-btn" data-code="${escaped}" title="Copy to clipboard"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5v-7A1.5 1.5 0 0 1 3.5 1h7A1.5 1.5 0 0 1 12 2.5V5"/></svg></button><pre><code>${highlighted}</code></pre></div>`
    }
    return r
  }, [])

  const allHtml = React.useMemo(() => {
    return PAGES.map((page) => ({
      id: page.id,
      html: marked.parse(page.body, { renderer }),
    }))
  }, [renderer])

  const handleContentClick = React.useCallback((e) => {
    const btn = e.target.closest(".docs-copy-btn")
    if (!btn) return
    const code = btn.getAttribute("data-code")
    if (!code) return
    navigator.clipboard.writeText(code).then(() => {
      btn.classList.add("docs-copy-done")
      setTimeout(() => btn.classList.remove("docs-copy-done"), 1500)
    })
  }, [])

  return (
    <div className="docs-panel" style={style}>
      <header className="panel-header">
        <div>
          <h1 className="panel-title">Language reference</h1>
          <p className="panel-subtitle">DSL documentation</p>
        </div>
      </header>
      <div className="docs-body">
        <nav className="docs-nav">
          {GROUPS.map((g) => (
            <div key={g} className="docs-nav-group">
              <div className="docs-nav-group-label">{g}</div>
              {PAGES.filter((p) => p.group === g).map((p) => (
                <button
                  key={p.id}
                  className={"docs-nav-item" + (p.id === activeId ? " docs-nav-active" : "")}
                  onClick={() => scrollTo(p.id)}
                >
                  {p.title}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="docs-scroll" ref={contentRef} onClick={handleContentClick}>
          {allHtml.map((page) => (
            <article
              key={page.id}
              id={`docs-${page.id}`}
              className="docs-article"
              dangerouslySetInnerHTML={{ __html: page.html }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
