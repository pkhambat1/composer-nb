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

A notebook for sketching music: chord progressions, drum grooves, and the two together.

A **music cell** is a short script. Run it to hear it, see chord diagrams and a drum grid, and export a WAV. A **text cell** holds Markdown notes.

## Quick example

\`\`\`
tempo 100
sound guitar

pattern beat = {
  kick: x-------
  snare: ----x---
  hat: x-
}

play {
  chords: Am F|C G
  beat
}
\`\`\`

A **pattern** is lines that play together, over and over: \`beat\` is half a bar long, and repeats until what it's in ends. A **play** is a timeline, and its own lines play once: the chords play their 2 bars, with the beat repeating under them.`,
  },
  {
    id: "lines",
    title: "Lines and types",
    group: "Getting Started",
    body: `# Lines and types

Every line starts by saying what it is.

| Line | What it is |
|------|------------|
| \`tempo 90\` | A **setting**: a reserved word and its value. No \`=\`, because it isn't a name |
| \`steps pair = X-x-\` | A **name**, with its **type** in front |
| \`kick: x--x---\` | Inside braces, an **instrument** and what it plays |
| \`bar 2 { ... }\` | Inside braces, what plays in **one bar** of the pattern or play it's in |
| \`play { ... }\` | **Plays** what's after it: a pattern, or one line |

\`//\` starts a comment. Blank lines and indentation mean nothing.

## Three types

A name's type goes in front of it, and \`=\` gives it its value.

| Type | What it holds | Where it goes |
|------|---------------|---------------|
| \`steps\` | A drum's hits: \`steps pair = X-x-\` | On a drum's line: \`hat: pair pair\` |
| \`chords\` | Bars of chords: \`chords verse = Am F\\|C G\` | On the chords line: \`chords: verse\` |
| \`pattern\` | Lines in braces that play together, over and over: \`pattern groove = { ... }\` | On a line of its own, or after \`play\` |

A name only holds its type, and only goes where that type goes. Chords on a drum's line, or steps where a pattern belongs, is an error that names both types. A name without a type is an error too, and the message shows the line to write.

## One meaning per symbol

| Symbol | Meaning |
|--------|---------|
| \`:\` | This instrument plays this |
| \`=\` | This name is this |
| \`{ }\` | A **block**: its lines play together as one value. Usually a pattern; after a drum's colon, that drum's steps |
| \`( )\` | A group: \`8 bars (verse chorus)\` |
| \`\\|\` | A bar line, in chords and in steps |
| \`-\` | Nothing new on this step or slot: a rest for a drum, and a held chord |
| \`,\` | On a drum's line, the end of one part and the start of the next |
| \`*\` \`/\` | Arithmetic, between two numbers. In \`C/E\` the slash is part of a chord's name |

## One way to do each thing

| You want | You write |
|----------|-----------|
| To repeat something | Put it in a pattern. Everything in a pattern repeats until the pattern ends |
| To play something once | Put it on a play's own line: \`crash: 1\` |
| To say how long | A length in front of it: \`3 bars\`, always plural. In front of a pattern, it repeats the pattern for that long |
| To say which bar | The bar in front of it: \`bar 2 { ... }\` |
| To rest for a while | A length in front of \`rest\`: \`2 beats rest\` |
| To say how a drum is hit | Draw it in steps: \`x\` hit, \`X\` accent, \`g\` ghost, \`d\` double |
| Two rhythms on one drum | A block of layers on its line: \`snare.ghost: { ... }\` |

## Nothing floats

Nothing plays unless it's inside a \`play\`. An instrument's line on its own, outside braces, is an error.`,
  },
  {
    id: "settings",
    title: "Settings",
    group: "Language Reference",
    body: `# Settings

A setting is a reserved word followed by its value. It applies from where it's written onward, including in the cells below. A cell's output lists anything it inherited. A setting written inside braces only applies inside them.

| Setting | Default | Meaning |
|---------|---------|---------|
| \`time\` | \`4 over 4\` | How many notes are in a bar, over which note: \`7 over 8\`, \`3+4 over 4\` |
| \`tempo\` | \`120\` | Quarter notes per minute |
| \`step\` | \`1/16\` | How long one step lasts, as a fraction of a whole note: \`1/8\`, or \`1/12\` for triplets |
| \`sound\` | \`piano\` | What chords play on: \`piano\`, \`epiano\`, \`organ\`, \`pad\`, \`bass\`, \`guitar\` |
| \`key\` | \`C\` | Key for Roman numeral chords: \`C\`, \`Am\`, \`Bb\`, \`F#m\` |
| \`capo\` | \`0\` | Capo fret, 0 to 12. Only works with \`sound guitar\` |
| \`octave\` | \`3\` | Octave chords are voiced in, 1 to 6 |
| \`kit\` | \`rock\` | Drum sound: \`rock\` (a recorded kit) or \`synth\` |

## Numbers are arithmetic

Wherever a number goes, arithmetic goes: \`tempo 60*2\`, \`(1+2) bars groove\`, \`2*3 bars groove\`. So \`*\` and \`/\` only ever multiply and divide.

That's why a time isn't written with a slash. \`7/8\` is the number 0.875, and a time is two numbers: \`time 7 over 8\`. \`6 over 8\` and \`3 over 4\` are different times, though they'd divide to the same thing. Write \`3+4 over 4\` for a bar felt as 3 then 4; the drum grid shades the groups.

## Counting

A beat is a quarter note everywhere: \`tempo\` counts quarter notes, and drum beats are counted \`1 e & a 2 e & a\`. A \`7 over 8\` bar is three and a half beats long, so it ends on \`4e\`.`,
  },
  {
    id: "chords",
    title: "Chords",
    group: "Language Reference",
    body: `# Chords

Chords go on a \`chords:\` line and play on the \`sound\` setting.

\`\`\`
sound guitar
play chords: Am E7|G D|F C|Dm E7
\`\`\`

## Bars and rhythm

| You write | Meaning |
|-----------|---------|
| \`\\|\` | A bar line |
| \`Am F\` | The chords in a bar split it evenly |
| \`-\` | Hold the chord before for another slot |
| \`_\` | Silence for a slot |
| \`%\` | Repeat the bar before |

\`\`\`
play chords: C - - G|Am - F G|%|F - _ -
\`\`\`

The first bar is C for three beats and G for one. A bar has to split evenly into sixteenth notes, so three chords in a 4 over 4 bar is an error: write \`Am - F G\` instead.

## Chord names

Any standard chord name works: \`C\`, \`Am\`, \`F#m\`, \`Bb7\`, \`Cmaj7\`, \`Dm9\`, \`G7sus4\`, \`Em7b5\`, \`Cadd9\`. A slash sets the bass note: \`C/E\`.

## Roman numerals

Roman numerals follow the \`key\` setting. Uppercase is major and lowercase is minor; \`°\` (or \`o\`) is diminished and \`ø\` half-diminished. A \`b\` or \`#\` in front moves the root.

\`\`\`
key C
play chords: I vi|IV V7|bVII IV|ii7 vii°
\`\`\`

In C that plays C Am, F G7, Bb F, then Dm7 Bdim.

## Naming a progression

A name of type \`chords\` holds chords so you can reuse them:

\`\`\`
chords verse = Am E7|G D
play chords: verse verse
\`\`\``,
  },
  {
    id: "drums",
    title: "Drums",
    group: "Language Reference",
    body: `# Drums

## One line per drum

\`kick\`, \`snare\`, \`hat\`, \`ride\`, \`crash\`, \`tom\` and \`floor\` (the floor tom) are the drums. A line says which one, and what follows the colon says when it's hit. Some drums have other sounds with lines of their own: \`ride.bell\`, \`hat.open\`, \`hat.pedal\`, \`snare.rim\` (a rimshot) and \`snare.ghost\` (the snare's ghost notes, so they can sit under its main line).

Lines play together, so two drums on the same step is two lines with a hit in the same place.

Each drum has one line in a block. To layer it, its line takes a block of steps, one layer a line. The layers repeat until they line up again, and where two hit the same step, the lower line wins. A rest never wins, so a layer only changes the steps it hits:

\`\`\`
pattern ghosts = {
  snare.ghost: {
    --x-
    ------------ddd-
  }
}
\`\`\`

The ghost notes play on every \`&\`, and the burst at the end of the bar replaces the last one. A block of steps is steps, so it can be named too: \`steps ghosts = { ... }\`. Patterns played together work the same way: where two of their lines hit the same drum at once, the lower line wins.

An open hi-hat rings until the next hi-hat hit closes it, like a real one, whether that's a stick on \`hat\` or the foot on \`hat.pedal\`. It also replaces a closed hit at the same moment, so the \`hat\` line can keep going under it:

\`\`\`
pattern hats = {
  hat: X-x-
  hat.open: ------X-
}
\`\`\`

## Steps

A drum's line is a picture of time: a row of steps, one character each. Each step lasts one \`step\` (a sixteenth note unless you change it).

| Step | Meaning |
|------|---------|
| \`x\` | Hit |
| \`X\` | Accented hit |
| \`g\` | Ghost note. On the snare, ghost notes go on \`snare.ghost\` |
| \`d\` | Double stroke |
| \`-\` | Nothing |

\`\`\`
play {
  kick: x---x---x-x-----
  snare: ----X-------X---
  snare.ghost: --------------x-
}
\`\`\`

Spaces mean nothing, so group the steps by beat to make a bar easy to read. \`\\|\` marks the end of a bar, and it's checked: one in the wrong place is an error that says how many steps came before it.

\`\`\`
play kick: x--- ---- x--- ---- | x--- --x- x--- ----
\`\`\`

## Beats

For plain hits, you can list the beats a drum hits on instead. A beat is a quarter note, counted \`1 e & a\`, and the line is one bar:

\`\`\`
play {
  kick: 1 2& 3
  snare: 2 4
  crash: 1
}
\`\`\`

Beats and steps don't mix on a line. Beats only say where, so anything about how a hit is played (an accent, a ghost note, a double) is drawn in steps.

## One bar only

In a pattern every line repeats, so a line of beats or a bar of steps plays in every bar. To play something in one bar only, put the bar in front of it:

\`\`\`
time 7 over 8

pattern groove = {
  kick: x--x---
  snare: 2e 4
  snare.ghost: --x----
  hat: X-x-
  bar 2 {
    snare.ghost: 2 beats rest, dd, 1 beats rest
    hat.open:    2 beats rest, --X-, 2 steps rest
    hat.pedal:   4
  }
}
\`\`\`

\`bar 2 { ... }\` is what happens in bar 2 of the pattern, each time through it. What's inside repeats to fill that bar, like any pattern. Its lines are lower, so where they hit a drum at the same moment as a line above, they win: here the burst of doubles replaces the ghost note under it.

One line needs no braces (\`bar 2 hat.pedal: 4\`), a named pattern can go there (\`bar 4 fill\`), and \`bar 3 to 4 { ... }\` takes a run of bars. A pattern without a length is long enough to have the bars it names.

## Rests with a length

A long run of \`-\` is hard to read and to count. Put a length in front of \`rest\` instead, in \`steps\`, \`beats\` or \`bars\`:

\`\`\`
play {
  snare: 2 beats rest, dd, 1.5 beats rest
  crash: 1 bars rest, x
}
\`\`\`

Commas separate the parts of a line. A part is steps as they're drawn (\`dd\`, or \`x--- x---\` with spaces for the eye), or a length with what fills it. So the snare line is two beats of rest, the doubles, then a beat and a half of rest.

A length can also repeat steps, up to the next comma: \`2 beats x-\` is \`x-x-x-x-\`. The steps have to fit the length a whole number of times.

Lengths are always plural, whatever the number: \`1 bars\`, \`1 beats\`. That way \`bars\` only ever says how long, and \`bar\` only ever says which one.

## Naming steps

A name of type \`steps\` holds steps so you can reuse them on any drum's line:

\`\`\`
steps pair = X-x-
play hat: pair pair
\`\`\`

## Lines of different lengths

In a pattern, every line repeats until the pattern ends, so lines of different lengths drift against each other. That's how you write a polyrhythm:

\`\`\`
time 7 over 8

pattern groove = 3 bars {
  kick: x--x---
  snare: ----x--
  ride.bell: x--
}

play groove
\`\`\`

The bell repeats every 3 steps against a 7-step kick and snare. A line has to fit its pattern a whole number of times, and 3 bars is where these line up. With \`4 bars\` the bell would stop partway through, so it's an error, and the message says the lines line up every 3 bars.`,
  },
  {
    id: "patterns",
    title: "Patterns and play",
    group: "Language Reference",
    body: `# Patterns and play

## Patterns

A pattern is lines in braces that play together, over and over: everything in it repeats until the pattern ends. Give it a name with its type in front, and it doesn't play until you play it.

\`\`\`
time 7 over 8

pattern groove = {
  kick: x--x---
  snare: ----x--
  ride.bell: x--
}
\`\`\`

Without a length, a pattern lasts until its lines line up again. Here the 7-step kick and snare and the 3-step bell line up after 21 steps, a bar and a half of 7 over 8.

Named patterns, like settings and other names, carry on into the cells below. A pattern without a name plays right where it's written, anywhere a name could go:

\`\`\`
play groove { snare: xxxx } groove
play {
  2 bars {
    kick: x---
  }
}
\`\`\`

## play

\`play\` plays what's after it and gives one output. What's after it is a pattern, or one line:

\`\`\`
play groove
play 6 bars {
  crash: 1
  groove
}
\`\`\`

A play is a timeline: its own lines play once, and a pattern on a line of its own repeats until the play ends. So the second play above is one crash, with the groove repeating under it for 6 bars.

## In order

| You write | Meaning |
|-----------|---------|
| \`intro verse\` | One after the other |
| \`verse verse\` | Twice |
| \`(verse chorus)\` | A group, to give a length |

\`\`\`
play intro 16 bars (verse chorus) outro
\`\`\`

Names in a row play once each, even on a line of their own in a play. In a pattern they repeat, like everything else.

## Repeating

There's one way to repeat something: put it in a pattern. An instrument's line repeats until its pattern ends, and so does a pattern on a line of its own:

\`\`\`
pattern beat = {
  hat: x-
  kick: x---
}

pattern verse = 4 bars {
  chords: Am F|C G
  beat
}
\`\`\`

A length in front of a pattern repeats it for that long: \`8 bars verse\`.

Whatever repeats has to fit what it's in a whole number of times. A 3-bar groove repeats in 6 bars or 9, not in 4, and the error says where it lines up.

## Lengths

A length is the one way to say how long, and goes in front of what it measures:

\`\`\`
pattern fill = 2 bars { hat: x- }
play 6 bars groove
play 2 bars { crash: 1 }
\`\`\`

Without one, a pattern lasts until its lines line up again (and long enough to have any bar it names), and a play lasts as long as the longest thing in it. A play can be longer than its lines, and the rest is silent: the last play above is one crash, left to ring for 2 bars.`,
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
| \`Cmd+/\` or \`Ctrl+/\` | Toggle \`//\` comment on selected lines |
| \`Tab\` / \`Shift+Tab\` | Indent / outdent the selected lines |
| \`Enter\` | New line at the same indentation, one level in after \`{\` |

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
