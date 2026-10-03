// components/DocsPanel.jsx — Built-in DSL documentation
import React from "react"
import { marked } from "marked"
import { highlightMusic } from "@composer-nb/dsl/highlight"

// ---------------------------------------------------------------------------
// Doc pages — plain markdown (converted from MDX)
// ---------------------------------------------------------------------------

const PAGES = [
  {
    id: "intro",
    title: "Introduction",
    group: "Getting Started",
    body: `# Composer.nb

A Jupyter-style notebook for sketching music: chord progressions, drum grooves, and the two together.

In a **music cell**, chords go on a line of their own and each drum gets its own line. Run the cell to hear it, see chord diagrams and a drum grid, and export a WAV.

## Cell types

| Type | What it holds |
|------|---------------|
| **Music cells** | Instruments, settings and words. They render to audio. |
| **Text cells** | Markdown notes: headings, **bold**, *italic*, \`code\`, lists and links. |

## Quick example

\`\`\`
time: 4/4
tempo: 100
sound: guitar
Am F|C G
kick: 1 3
snare: 2 4
hat: x.
\`\`\`

Lines next to each other play together. This block lasts 2 bars because the chords do; the drum lines repeat to fill it.`,
  },
  {
    id: "quickstart",
    title: "Quickstart",
    group: "Getting Started",
    body: `# Quickstart

## 1. Set the time and tempo

\`\`\`
time: 4/4
tempo: 100
\`\`\`

Settings apply from where you write them onward, including in the cells below.

## 2. Add chords

Write them on a line of their own. \`|\` separates bars, and the chords in a bar split it evenly. They play on piano unless you pick another \`sound\`:

\`\`\`
sound: guitar
C Am|F G
\`\`\`

## 3. Add drums

Give each drum its own line and list the beats it plays in every bar:

\`\`\`
kick: 1 3
snare: 2 4
\`\`\`

## 4. Run it

Press **Shift+Enter**. You'll get playback, chord diagrams, a drum grid and a WAV button.

> **Tip:** Lines in the same block play together. A blank line starts a new block, which plays after the one before it.`,
  },
  {
    id: "settings",
    title: "Settings",
    group: "Language Reference",
    body: `# Settings

Settings are written \`name: value\`. A setting applies to the whole block it's in and to everything after it, including the cells below, so a cell can inherit its tempo from the cell above. A cell's output lists anything it inherited.

|Setting|Default|Meaning|
|---------|---------|---------|
|\`time\`|\`4/4\`|Beats per bar over the note that gets the beat: \`4/4\`, \`7/8\`, \`(3+4)/4\`|
|\`tempo\`|\`120\`|Quarter notes per minute|
|\`step\`|\`1/16\`|How long each step of a loop is: \`1/16\`, \`1/8\`, or \`1/12\` for triplets|
|\`bars\`|automatic|How many bars this block plays (this block only)|
|\`sound\`|\`piano\`|Instrument for chord lines: \`piano\`, \`epiano\`, \`organ\`, \`pad\`, \`bass\`, \`guitar\`|
|\`key\`|\`C\`|Key for Roman numeral chords: \`C\`, \`Am\`, \`Bb\`, \`F#m\`|
|\`capo\`|\`0\`|Capo fret for guitar lines, 0 to 12|
|\`octave\`|\`3\`|Octave chords are voiced in, 1 to 6|
|\`kit\`|\`rock\`|Drum sound: \`rock\` (a recorded kit) or \`synth\`|

## Counting

A beat is a quarter note everywhere: \`tempo\` counts quarter notes, and drum beats are counted \`1 e & a 2 e & a\`. A 7/8 bar is three and a half beats long, so it ends on \`4e\`.

## Added-up time

Bars that group unevenly are written with brackets: \`(3+4)/4\` is a bar of seven quarter notes, felt as 3 then 4. The drum grid shades the groups.`,
  },
  {
    id: "chords",
    title: "Chords",
    group: "Language Reference",
    body: `# Chords

## Instruments

Chords go on a line of their own and play on the \`sound\` setting: \`piano\` (the default), \`epiano\`, \`organ\`, \`pad\`, \`bass\` or \`guitar\`. Like any setting, it carries on into the cells below, so you set it once.

\`\`\`
sound: guitar
Am E7|G D|F C|Dm E7
\`\`\`

To play a second instrument at the same time, start its line with its name:

\`\`\`
sound: piano
C Am|F G
bass: C A|F G
\`\`\`

## Bars and rhythm

|You write|Meaning|
|-----------|---------|
|\`\\|\`|A bar line|
|\`Am F\`|The chords in a bar split it evenly|
|\`.\`|Hold the chord before for another slot|
|\`_\`|Silence for a slot|
|\`%\`|Repeat the bar before|

\`\`\`
C . . G|Am . F G|%|F . _ .
\`\`\`

The first bar is C for three beats and G for one. A bar has to split evenly into sixteenth notes, so three chords in a 4/4 bar is an error: write \`Am . F G\` instead.

## Long progressions

Chord lines next to each other carry on from one another, each starting a new bar:

\`\`\`
Am E7|G D|F C|Dm E7
F C|G D
\`\`\`

To play it twice, put \`repeat 2:\` above it and indent it (see Repeats). A named line (\`bass:\`, \`hat:\`) continues onto the next line when that line starts with \`|\`.

## Chord names

Any standard chord name works: \`C\`, \`Am\`, \`F#m\`, \`Bb7\`, \`Cmaj7\`, \`Dm9\`, \`G7sus4\`, \`Em7b5\`, \`Cadd9\`. A slash sets the bass note: \`C/E\`.

## Roman numerals

Roman numerals follow the \`key\` setting. Uppercase is major and lowercase is minor; \`°\` (or \`o\`) is diminished and \`ø\` half-diminished. A \`b\` or \`#\` in front moves the root.

\`\`\`
key: C
I vi|IV V7|bVII IV|ii7 vii°
\`\`\`

In C that plays C Am, F G7, Bb F, then Dm7 Bdim.`,
  },
  {
    id: "drums",
    title: "Drums",
    group: "Language Reference",
    body: `# Drums

## The kit

\`kick\`, \`snare\`, \`hat\`, \`ride\`, \`crash\`, \`tom\` and \`floor\` (the floor tom). Each drum gets its own line, and there are two ways to say when it plays.

## Beats

List the beats a drum plays in every bar. A beat is a quarter note, split as \`1 e & a\`:

\`\`\`
kick: 1 2& 3
snare: 2 4
crash: 1|.
\`\`\`

\`|\` separates bars, \`.\` is an empty bar and \`%\` repeats the bar before. The crash line above hits once every 2 bars.

A word after a beat changes how it's played:

|Word|Meaning|
|------|---------|
|\`accent\`|Hit it harder|
|\`ghost\`|Barely touch it|
|\`double\`|Two quick strokes|
|\`open\`|Open hi-hat (\`hat\` only)|
|\`pedal\`|Hi-hat closed with the foot (\`hat\` only)|
|\`bell\`|The bell of the ride (\`ride\` only)|

\`\`\`
snare: 2 accent 4 4a ghost
hat: 1 2 3 4 open 4& pedal
\`\`\`

## Loops

A loop is a row of steps that repeats on its own, whatever the bar lines are doing. Each step lasts one \`step\` (a sixteenth note unless you change it).

|Step|Meaning|
|------|---------|
|\`x\`|Hit|
|\`g\`|Ghost note|
|\`d\`|Double stroke|
|\`o\`|Open hi-hat (\`hat\` only)|
|\`p\`|Pedal hi-hat (\`hat\` only)|
|\`b\`|Ride bell (\`ride\` only)|
|\`.\`|Rest|

A capital letter adds an accent: \`X\`, \`O\`, \`B\`.

\`\`\`
hat: X.x.X.x.X.x.X.O.
\`\`\`

## Loops against the bar

Loops of different lengths drift against each other and against the bar line, which makes polyrhythms easy:

\`\`\`
time: 7/8
crash: 1|.|.
ride: b..
kick: x..x...
snare: ....x..
\`\`\`

The ride bell repeats every 3 steps against a 7-step kick and snare. A block plays until all of its lines line up again, here after 3 bars, and the crash only hits at the start of them. Indent it under \`repeat 2:\` to play it all twice.`,
  },
  {
    id: "words",
    title: "Words and blocks",
    group: "Language Reference",
    body: `# Words and blocks

## Lines

Every line is one of these:

|Line|Meaning|
|------|---------|
|\`tempo: 120\`|A setting|
|\`snare: 2 4\`|An instrument and what it plays|
|\`Am F \\|C G\`|Chords, played on the \`sound\` setting|
|\`repeat 2:\`|Plays the lines indented under it again|
|\`fill = x x d d\`|A word you can reuse|
|\`-- note\`|A comment|

## Words

A word names a rhythm or a progression once so you can reuse it. Define it with \`=\`, then use it in a loop or a chord line:

\`\`\`
pair = X.x.
intro = Am E7|G D

hat: pair pair pair pair
intro intro
\`\`\`

A chord word always covers whole bars. Like settings, words carry on into the cells below.

## Blocks

Lines next to each other form a block and play together. A blank line starts a new block, which plays after the one before it; the editor draws a dashed line there. A block with only settings or words in it doesn't play anything, it just sets things up.

Every line in a block repeats: a chord or beat line every few bars, a loop every few steps. The block lasts until they all line up again, up to 16 bars. Write \`bars:\` to choose the length yourself.

## Repeats

\`repeat 2:\` plays the lines indented under it twice. The repeat ends at the first line that isn't indented under it, and whatever comes next plays after it:

\`\`\`
time: 7/8
repeat 2:
  crash: 1|.|.
  ride: b..
  kick: x..x...
  snare: ....x..
snare: 1 2 3 4
\`\`\`

That plays the 3-bar groove twice, so the crash hits at the start of each time through, then one bar of snare.

Indent further to put a repeat inside a repeat. Blank lines inside a repeat still start a new block, and every block inside it repeats:

\`\`\`
time: 7/8
repeat 2:
  repeat 3:
    kick: x..x...
  crash: 1
  snare: 2 4
\`\`\`

That's the kick figure three times, then a bar of crash and snare, and all of that twice. Settings changed inside a repeat stay changed after it. A repeat plays 1 to 16 times. In the editor, Tab indents and Enter keeps the indentation, adding a level after a \`repeat\` line.`,
  },
  {
    id: "shortcuts",
    title: "Keyboard Shortcuts",
    group: "App",
    body: `# Keyboard Shortcuts

## Cell execution

|Key|Action|
|-----|--------|
|\`Shift+Enter\`|Run cell and move to next (or insert new cell at end)|
|\`Ctrl+Enter\` / \`Cmd+Enter\`|Run cell without moving|
|\`Alt+Enter\`|Run cell and insert new cell below|

## Navigation

|Key|Action|
|-----|--------|
|\`J\` or \`↓\`|Select next cell|
|\`K\` or \`↑\`|Select previous cell|
|\`Enter\`|Enter edit mode on selected cell|
|\`Esc\`|Exit edit mode (back to command mode)|

## Cell management

|Key|Action|
|-----|--------|
|\`A\`|Insert new music cell above|
|\`B\`|Insert new music cell below|
|\`DD\`|Delete selected cell (press D twice quickly)|
|\`Z\`|Undo last delete|

## Code editing

|Key|Action|
|-----|--------|
|\`Cmd+/\` or \`Ctrl+/\`|Toggle comment on selected lines|
|\`Tab\` / \`Shift+Tab\`|Indent / outdent the selected lines (for \`repeat\`)|
|\`Enter\`|New line at the same indentation, one level in after \`repeat 2:\`|

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

function DocsPanel({ style }) {
  const contentRef = React.useRef(null)
  const scrollLockRef = React.useRef(false)
  const [activeId, setActiveId] = React.useState(() => {
    const hash = window.location.hash.replace("#", "")
    if (hash.startsWith("docs-")) {
      const id = hash.replace("docs-", "")
      if (PAGES.some((p) => p.id === id)) return id
    }
    return PAGES[0].id
  })

  // Ref to hold scrollTo for use in mount effect (avoids temporal dead zone)
  const scrollToRef = React.useRef(null)

  // Track which section is visible while scrolling
  React.useEffect(() => {
    const container = contentRef.current
    if (!container) return
    const onScroll = () => {
      if (scrollLockRef.current) return
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
    setActiveId(id)
    scrollLockRef.current = true
    setTimeout(() => { scrollLockRef.current = false }, 600)
    const container = contentRef.current
    const el = container?.querySelector(`#docs-${id}`)
    if (el && container) {
      const target = el.offsetTop
      const start = container.scrollTop
      const dist = target - start
      const duration = 250
      const t0 = performance.now()
      const step = (now) => {
        const p = Math.min((now - t0) / duration, 1)
        const ease = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2
        container.scrollTop = start + dist * ease
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }
    history.replaceState(null, "", `#docs-${id}`)
  }, [])
  scrollToRef.current = scrollTo

  // Scroll to hash target on mount
  React.useEffect(() => {
    const hash = window.location.hash.replace("#", "")
    if (hash.startsWith("docs-")) {
      const id = hash.replace("docs-", "")
      setTimeout(() => scrollToRef.current(id), 100)
    }
  }, [])

  const renderer = React.useMemo(() => {
    const r = new marked.Renderer()
    r.heading = function ({ text, depth }) {
      const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
      if (depth === 1) {
        return `<h1 class="docs-heading-link">${escaped}<svg class="docs-link-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 8.5a3 3 0 0 0 4.2.4l2-2a3 3 0 0 0-4.2-4.2L7.3 3.9"/><path d="M9.5 7.5a3 3 0 0 0-4.2-.4l-2 2a3 3 0 0 0 4.2 4.2l1.2-1.2"/></svg></h1>`
      }
      return `<h${depth}>${escaped}</h${depth}>`
    }
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
    const linkIcon = e.target.closest(".docs-link-icon")
    if (linkIcon) {
      const article = linkIcon.closest(".docs-article")
      if (article) {
        const pageId = article.id.replace("docs-", "")
        const url = `${window.location.origin}${window.location.pathname}#docs-${pageId}`
        navigator.clipboard.writeText(url).then(() => {
          linkIcon.classList.add("docs-link-copied")
          setTimeout(() => linkIcon.classList.remove("docs-link-copied"), 1500)
        }, () => {})
        scrollTo(pageId)
      }
      return
    }
    const heading = e.target.closest(".docs-heading-link")
    if (heading) {
      const article = heading.closest(".docs-article")
      if (article) {
        const pageId = article.id.replace("docs-", "")
        scrollTo(pageId)
      }
      return
    }
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
                  key= {p.id}
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
              key= {page.id}
              id= {`docs-${page.id}`}
              className="docs-article"
              dangerouslySetInnerHTML={{ __html: page.html }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default React.memo(DocsPanel, (prev, next) =>
  prev.style?.display === next.style?.display,
)
