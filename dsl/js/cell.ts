/* A cell, read and played: parseCell. It reads the cell's lines in order: settings at the
   top, names, withs and plays. Each play is evaluated into a clip (eval.ts), and the clips
   are put back to back into one timeline, with the blocks the grid and the sheet draw. */
import {
  checkStickings,
  outputCtx,
  type HitEvent,
  type SoundEvent,
  type Span,
  type Timed,
} from "./clips.ts"
import {
  checkBars,
  classifyDecl,
  defineBlock,
  defineWord,
  patternHint,
  readDecl,
} from "./declare.ts"
import { blockClip, checkSection } from "./eval.ts"
import { classify, EVERY_RE, PLACE_RE, TYPED_RE } from "./lines.ts"
import { Scope } from "./resolve.ts"
import { openParens } from "./sequence.ts"
import { applySetting, readWithHeader, setInBlock, WITH_HELP, withState } from "./settings.ts"
import { cloneState, describe, initialState, type Line, type State } from "./state.ts"
import { fmt, lengthPrefix, MAX_SECONDS, singularLength, TPQ } from "./time.ts"
import { joinOf, ofShown } from "./values/notes.ts"
import { SETTINGS } from "./vocab.ts"

// A block read from the cell's lines: its lines, the index of its last line, what follows
// its closing }, and whether a line in it was left out as a mistake
type ReadBlock = { body: Line[]; end: number; tail: string; dropped: boolean }
// What one play plays
type Output = {
  line: number
  label: string
  durSec: number
  totalSec: number
  events: SoundEvent[]
  chords: SoundEvent[]
  notes: SoundEvent[]
  drumEvents: HitEvent[]
  blocks: ReturnType<typeof gridBlocks>
}

// Grid cells per quarter note: the coarsest that still shows every hit, and where every
// note stops.
function gridResolution(
  drumEvents: HitEvent[],
  noteEvents: SoundEvent[],
  barTicks: number,
): number {
  const ticks = [
    ...drumEvents.filter((e) => !e.hidden).map((e) => e.tick),
    ...noteEvents.flatMap((e) => [e.tick, e.tick + e.ticks]),
  ]
  for (const res of [1, 2, 4, 3, 6, 8, 12]) {
    const cell = TPQ / res
    if (barTicks % cell === 0 && ticks.every((t) => t % cell === 0)) return res
  }
  return 24
}

// Joins neighbouring spans in the same meter, then gives each its drum hits, notes and
// chords as ticks from its start — the shape the grid and the sheet draw.
function gridBlocks(
  spans: Span[],
  drumEvents: HitEvent[],
  noteEvents: SoundEvent[],
  chordEvents: SoundEvent[] = [],
) {
  const merged: Span[] = []
  for (const s of [...spans].sort((a, b) => a.startSec - b.startSec)) {
    const last = merged[merged.length - 1]
    if (
      last &&
      last.time === s.time &&
      last.tempo === s.tempo &&
      last.key === s.key &&
      last.mode === s.mode &&
      Math.abs(last.startSec + last.durSec - s.startSec) < 1e-6
    ) {
      last.durSec += s.durSec
    } else merged.push({ ...s })
  }
  return merged.map((s) => {
    const inside = drumEvents
      .filter((e) => e.secStart >= s.startSec - 1e-9 && e.secStart < s.startSec + s.durSec - 1e-9)
      .map((e) => ({ ...e, tick: Math.round((e.secStart - s.startSec) / s.secPerTick) }))
    const within = (events: SoundEvent[]) =>
      events
        .filter((e) => e.secStart >= s.startSec - 1e-9 && e.secStart < s.startSec + s.durSec - 1e-9)
        .map((e) => ({
          ...e,
          tick: Math.round((e.secStart - s.startSec) / s.secPerTick),
          ticks: Math.round(e.secDur! / s.secPerTick),
        }))
    const notes = within(noteEvents)
    const barSec = s.barTicks * s.secPerTick
    return {
      ...s,
      bars: Math.ceil(s.durSec / barSec - 1e-6), // a part bar still gets a row
      plays: [s.startSec],
      times: 1,
      drumEvents: inside,
      noteEvents: notes,
      chordEvents: within(chordEvents),
      res: gridResolution(inside, notes, s.barTicks),
    }
  })
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

// Parses one music cell. `inherited` is the state left by the cells above (settings and
// definitions); the result's `state` is what this cell passes on. Each play gives one
// output.
export function parseCell(src: unknown, inherited: State = initialState()) {
  const errors: { line: number; msg: string }[] = []
  const err = (line: number, said: string) => {
    const msg = ofShown(said)
    if (!errors.some((e) => e.line === line && e.msg === msg)) errors.push({ line, msg })
  }
  const state = Scope.forCell(inherited, cloneState)
  const setHere = new Map() // setting name → the line in this cell that set it
  const outputs: Output[] = []
  let transposeLine: number | null = null

  const raws = String(src || "").split("\n")
  const lines: Line[] = raws.map((raw, i) => ({
    ln: i + 1,
    text: raw.replace(/\/\/.*$/, "").trim(),
  }))
  // A line that starts with | continues the value of the line above it, at a bar line:
  // notes flats = A3-Ab3-G3-Gb3-, then |F3-E3-Eb3-D3- on the next line. A comment-only line
  // between them is passed over; a blank line, an opening or closing brace end what's above.
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].text.startsWith("|")) continue
    let j = i - 1
    while (j >= 0 && !lines[j].text && raws[j].trim()) j--
    const above = j >= 0 ? lines[j] : null
    if (!above?.text || /[{}]$/.test(above.text) || /^[{}]/.test(above.text)) continue
    above.text = `${above.text.replace(/\|\s*$/, "")} ${lines[i].text}`
    lines[i].text = ""
  }
  for (const l of lines) l.text = joinOf(l.text)

  let anonCount = 0
  // A with that transposes, in a block or around one: the line it's on, for the check that
  // something pitched plays
  const noteTranspose = (body: Line[]) => {
    for (const l of body) {
      if (/\bwith\b[^{]*\btranspose\s+-?\(?[1-9]/.test(l.text)) transposeLine ??= l.ln
      for (const b of Object.values(l.blocks || {})) noteTranspose(b.lines)
    }
  }

  // Reads the statements in `lines`, the cell's or a with's at the top of it, into `state`.
  // `inWith` is whether they're a with's, whose settings go on the with.
  const run = (lines: Line[], state: State, inWith: boolean): void => {
    // Skips to the } that closes a block opened on line `at`, counting the blocks inside it.
    const skipBlock = (at: number) => {
      let depth = 0
      for (let i = at; i < lines.length; i++) {
        for (const c of lines[i].text) {
          if (c === "{") depth++
          else if (c === "}" && --depth <= 0) return i
        }
      }
      return lines.length
    }
    // For a line that's a mistake: if it opened a block, skip the block's lines too, so
    // one mistake gives one message.
    const skipIfOpen = (i: number) => (/\{$/.test(lines[i].text) ? skipBlock(i) : i)
    // Reads a { ... } block that starts with `rest` (the text after the {) on line `at`.
    // Returns its lines, the index of its last line, what follows the closing }, and whether
    // a line was left out as a mistake.
    // A block inside it without a name plays where it's written, like a pattern's name:
    // on its line it becomes {#1}, and the line keeps the block in `blocks`.
    // With `oneLine`, reads a single line instead (the rest of a play), through the line
    // where its last block closes.
    const readBlock = (at: number, rest: string, what: string, oneLine = false): ReadBlock => {
      const body: Line[] = []
      let i = at
      let text = rest
      let cur: Line | null = null // the line being read: { ln, text, blocks }
      let dropped = false // whether a line was left out as a mistake
      const flush = () => {
        const t = cur ? cur.text.replace(/^\s+|\s+$/g, "") : ""
        if (t && /^play(\s|$)/.test(t)) {
          err(cur!.ln, "play goes at the top, not inside braces")
          dropped = true
        } else if (t) body.push({ ...cur!, text: t })
        cur = null
      }
      for (;;) {
        cur ??= { ln: lines[i].ln, text: "", blocks: null }
        const brace = /[{}]/.exec(text)
        if (!brace) {
          cur.text += text
          // A group in brackets runs on until its ) closes it, whatever lines it takes: its
          // newlines are kept, since a line of its own inside it ends at one.
          if (openParens(cur.text) > 0 && i + 1 < lines.length) {
            cur.text += "\n"
            text = lines[++i].text
            continue
          }
          flush()
          if (oneLine) return { body, end: i, tail: "", dropped }
          if (++i >= lines.length) {
            err(lines[at].ln, `${what} needs a } to close it`)
            return { body, end: i, tail: "", dropped }
          }
          text = lines[i].text
          continue
        }
        cur.text += text.slice(0, brace.index)
        text = text.slice(brace.index + 1)
        if (brace[0] === "}") {
          if (oneLine) {
            err(lines[i].ln, "This } doesn't close anything")
            continue
          }
          flush()
          return { body, end: i, tail: text.trim(), dropped }
        }
        // A block inside this one
        const head = cur.text.trim()
        // What to call it if it isn't closed: the name it's given, when that's what this is
        const inner = readBlock(
          i,
          text.trim(),
          oneLine && what && what !== "play" ? what : "This {",
        )
        if (inner.end >= lines.length) {
          flush()
          return { body, end: inner.end, tail: "", dropped }
        }
        i = inner.end
        text = inner.tail
        if (/^play(\s|$)/.test(head)) {
          err(cur.ln, "play goes at the top, not inside braces")
          cur.text = ""
          dropped = true
        } else if (/^pattern(\s|$)/.test(head) && !TYPED_RE.test(head)) {
          err(cur.ln, patternHint(head))
          cur.text = ""
          dropped = true
        } else if (!inner.body.length) {
          // Unless what was in them was a mistake, already reported
          if (!inner.dropped) err(cur.ln, "These braces have nothing in them")
          cur.text = ""
          dropped ||= inner.dropped
        } else {
          const key = `{#${++anonCount}}`
          cur.blocks = {
            ...cur.blocks,
            [key]: { key, anon: true, ln: cur.ln, lines: inner.body, bars: 0 },
          }
          cur.text += ` ${key} `
        }
      }
    }
    // Nothing follows a closing brace. `front(n)` is the right way to write a length there.
    const checkTail = (tail: string, ln: number, front: (n: string) => string) => {
      if (!tail) return true
      const after = /^(\S+)\s+bars$/.exec(tail)
      err(
        ln,
        after
          ? `A length goes in front of what it measures: ${front(after[1])}`
          : "Nothing can follow a }",
      )
      return false
    }

    for (let i = 0; i < lines.length; i++) {
      const { ln, text } = lines[i]
      if (!text) continue

      if (text.startsWith("}")) {
        err(ln, "This } doesn't close anything")
        continue
      }
      if (singularLength(text, ln, err)) {
        i = skipIfOpen(i)
        continue
      }
      // pattern groove {: a pattern without its =
      if (/^pattern(\s+[A-Za-z][A-Za-z0-9]*)?\s*(=.*)?$/.test(text)) {
        if (!TYPED_RE.test(text)) {
          err(ln, patternHint(text))
          i = /\{/.test(text) ? readBlock(i, text, "", true).end : i
          continue
        }
      }

      if (/^play\s*[:=]/.test(text)) {
        err(
          ln,
          /^play\s*=/.test(text)
            ? "play is a keyword, not a name, so it takes no =: play { ... }"
            : "play is a keyword, not an instrument, so it takes no colon: play groove",
        )
        i = skipIfOpen(i)
        continue
      }

      // with key E, mode minor { ... }: the statements in its braces, with those settings,
      // which end at its }. What's named inside stays inside, and nothing carries on.
      if (/^with(\s|\{|$)/.test(text)) {
        const open = text.indexOf("{")
        if (open < 0) {
          err(ln, WITH_HELP)
          continue
        }
        let end: { j: number; c: number } | null = null // the line and column of the } that closes it
        for (let j = i, depth = 0; j < lines.length && !end; j++) {
          const t = lines[j].text
          for (let c = j === i ? open : 0; c < t.length && !end; c++) {
            if (t[c] === "{") depth++
            else if (t[c] === "}" && --depth === 0) end = { j, c }
          }
        }
        const settings = readWithHeader(text.slice(4, open), ln, err)
        if (!end) {
          err(ln, "This with needs a } to close it")
          break
        }
        const last = lines[end.j]
        const body =
          end.j === i
            ? [{ ln, text: text.slice(open + 1, end.c).trim() }]
            : [
                { ln, text: text.slice(open + 1).trim() },
                ...lines.slice(i + 1, end.j),
                { ln: last.ln, text: last.text.slice(0, end.c).trim() },
              ]
        if (last.text.slice(end.c + 1).trim()) err(last.ln, "Nothing can follow a }")
        if (!body.some((l) => l.text)) err(ln, "These braces have nothing in them")
        i = end.j
        const inner = settings && withState(settings, state, ln, err)
        if (inner?.transpose && inner.transpose !== state.transpose) transposeLine ??= ln
        // A mistake in the header still has its block read, for the mistakes in that
        run(body, inner || cloneState(state), true)
        continue
      }

      const play = /^play(?:\s+(.*))?$/.exec(text)
      if (play) {
        // play plays what's after it: a block in braces, or one line. play groove and
        // play { groove } are the same thing.
        let rest = (play[1] || "").trim()
        let bars = 0
        let ok = true
        const len = lengthPrefix(rest)
        if (len.has) {
          // play 3 bars { ... }, play 3 bars groove: how long the output is
          ok = checkBars(len.bars, ln, err)
          bars = len.bars
          rest = len.rest
        }
        if (!rest) {
          err(
            ln,
            bars
              ? `${text} of what? Put a pattern or its name after it: ${text} { ... }`
              : "play needs something after it: play groove, or play { ... }",
          )
          continue
        }
        let arg: Line[] = [{ ln, text: rest }]
        let label = text
        const lengthAfter = (tail: string) => /^\S+\s+bars$/.test(tail)
        if (rest.startsWith("{")) {
          const block = readBlock(i, rest.slice(1).trim(), "play")
          if (block.end > i) label = text.replace(/\{.*$/, "{ … }")
          if (!block.body.length) {
            err(ln, "This play has nothing in its braces")
            ok = false
          }
          if (block.tail && !lengthAfter(block.tail) && block.body.length) {
            // play { ... } outro: things in order go in brackets
            err(
              lines[block.end]?.ln ?? ln,
              `What plays in order goes in brackets: play ({ ... } ${block.tail.replace(/\{.*$/, "{ ... }")})`,
            )
            ok = false
            if (/\{/.test(block.tail))
              block.end = readBlock(block.end, block.tail, "play", true).end
          } else if (
            !checkTail(block.tail, lines[block.end]?.ln ?? ln, (n) => `play ${n} bars { ... }`)
          ) {
            ok = false
          }
          arg = block.body
          i = block.end
        } else if (rest.includes("{") || openParens(rest) > 0) {
          // play ({ ... } outro): blocks in a group, or a group that runs over several lines
          const line = readBlock(i, rest, "play", true)
          if (line.end > i) {
            const size = bars ? `${fmt(bars)} bars ` : ""
            label = `play ${size}${
              line.body[0]?.text
                .replace(/\{#\d+\}/g, "{ … }")
                .replace(/\s+/g, " ")
                .trim() ?? ""
            }`
          }
          i = line.end
          arg = line.body
          if (!arg.length) ok = false
        }
        noteTranspose(arg)
        const out = ok ? blockClip(arg, state, err, outputCtx(ln), [], bars) : null
        if (out) checkStickings(out, err)
        if (out && out.durSec > MAX_SECONDS) {
          err(ln, "This plays for over 10 minutes. Use a shorter length")
        } else if (out) {
          outputs.push({
            line: ln,
            label,
            durSec: out.durSec,
            totalSec: out.durSec,
            events: out.events,
            chords: out.events.filter((e) => "chord" in e),
            notes: out.events.filter((e) => "note" in e),
            drumEvents: out.drumEvents,
            blocks: gridBlocks(
              out.spans,
              out.drumEvents,
              out.events.filter((e) => "note" in e),
              out.events.filter((e) => "chord" in e),
            ),
          })
        }
        continue
      }

      // steps pair = ^-x-, chords verse = Am F, pattern groove = 3 bars { ... }: a name.
      // Read here because a pattern's braces can run over several lines.
      let decl: ReturnType<typeof readDecl> = readDecl(text)
      // pattern groove { without its =: said once, and still named, so nothing else breaks
      const noEquals = !decl && /^pattern\s+([A-Za-z][A-Za-z0-9]*)\s+(.+)$/.exec(text)
      if (noEquals) {
        err(ln, patternHint(text))
        decl = { type: "pattern", name: noEquals[1], value: noEquals[2].trim() }
      }
      if (decl) {
        let blocks: Line["blocks"] = null
        if (decl.value.includes("{") || openParens(decl.value) > 0) {
          const read = readBlock(i, decl.value, decl.name, true)
          i = read.end
          const line = read.body[0]
          if (!line) continue // its braces were a mistake, already reported
          noteTranspose(read.body)
          const after = /^\{#\d+\}\s+(\S+)\s+bars$/.exec(line.text)
          if (after) {
            err(
              ln,
              `A length goes in front of what it measures: pattern ${decl.name} = ${after[1]} bars {`,
            )
            continue
          }
          decl.value = line.text
          blocks = line.blocks
        }
        const l = classifyDecl(decl, { ln, blocks }, err, state)
        if (!l) continue
        if (l.kind === "word") defineWord(l.type, l.name, l.value, ln, state, err, l.blocks)
        else {
          const sec = defineBlock(l, state, err)
          if (sec) checkSection(sec, state, err)
        }
        continue
      }
      const bare = /^([A-Za-z][A-Za-z0-9]*)\s*\{/.exec(text)
      if (bare) {
        err(ln, `${bare[1]} needs a type and = to name its braces: pattern ${bare[1]} = {`)
        i = skipIfOpen(i)
        continue
      }
      // every 3 steps { ... } on its own: nothing plays it
      if (EVERY_RE.test(text)) {
        const shown = text.replace(/\{.*$/, "{ ... }")
        err(ln, `Nothing plays this. Put play in front, or give it a name: pattern slow = ${shown}`)
        i = /\{/.test(text) ? readBlock(i, text, "", true).end : i
        continue
      }
      // bar 2 { ... } on its own: it says where in a pattern or play, so it goes inside one
      if (PLACE_RE.test(text)) {
        err(
          ln,
          `${text.replace(/\{.*$/, "{ ... }")} goes inside a pattern or a play, to say where in it`,
        )
        i = /\{/.test(text) ? readBlock(i, text, "", true).end : i
        continue
      }
      // { ... } or 3 bars { ... } on its own: a block, but nothing plays it
      if (lengthPrefix(text).rest.startsWith("{")) {
        err(
          ln,
          `Nothing plays this pattern. Put play in front: play ${text.replace(/\{.*$/, "{ ... }")}`,
        )
        i = readBlock(i, text, "", true).end
        continue
      }

      const l = classify({ ln, text }, err, state)
      if (!l) continue
      if (l.kind === "setting" && inWith) err(ln, setInBlock(l))
      else if (l.kind === "setting") {
        if (applySetting(l.name, l.value, ln, state, err)) {
          setHere.set(l.name, ln)
          if (l.name === "transpose" && state.transpose) transposeLine ??= ln
        }
      } else if (l.kind === "part") {
        // Nothing floats at the top: what plays is inside a pattern or a play.
        err(ln, `An instrument's line goes inside braces: in a pattern, or play { ${text} }`)
      } else err(ln, `Nothing plays this line. Write play ${text}`)
    }
  }
  run(lines, state, false)

  // transpose only moves what has pitch, so one in a cell where only drums play is a
  // mistake. One inherited from a cell above is fine.
  const pitched = outputs.some((o) => o.notes.length || o.chords.length)
  if (transposeLine != null && outputs.length && !pitched) {
    err(
      transposeLine,
      "transpose moves notes and chords, and only drums play here. Give an instrument some: piano: chords C G",
    )
  }

  const start = initialState()
  // What this cell plays with from the cells above: every setting they changed, and every
  // instrument they set to another sound, unless this cell sets it again.
  const fromAbove = [
    ...SETTINGS.filter((k) => !setHere.has(k) && describe(k, inherited) !== describe(k, start)).map(
      (k) => describe(k, inherited),
    ),
    ...Object.entries(inherited.sounds)
      .filter(([instrument]) => !setHere.has(instrument))
      .map(([instrument, sound]) => `${instrument} ${sound}`),
  ]

  // One timeline with every output back to back, for views that show a single player. An
  // event's tick counts from the start of the block it plays in, as the blocks' own events
  // do; a pattern's events count from the pattern, wherever it falls in the block.
  let t = 0
  const events: SoundEvent[] = []
  const drumEvents: HitEvent[] = []
  const blocks: Output["blocks"] = []
  for (const o of outputs) {
    const place = <E extends Timed & { tick: number }>(e: E): E => {
      const b = o.blocks.find(
        (b) => e.secStart >= b.startSec - 1e-9 && e.secStart < b.startSec + b.durSec - 1e-9,
      )
      const tick = b ? Math.round((e.secStart - b.startSec) / b.secPerTick) : e.tick
      return { ...e, tick, secStart: e.secStart + t }
    }
    events.push(...o.events.map(place))
    drumEvents.push(...o.drumEvents.map(place))
    blocks.push(
      ...o.blocks.map((b) => ({ ...b, startSec: b.startSec + t, plays: [b.startSec + t] })),
    )
    t += o.durSec
  }

  errors.sort((a, b) => a.line - b.line)
  return {
    kind: "music",
    outputs,
    blocks,
    events,
    chords: events.filter((e) => "chord" in e),
    notes: events.filter((e) => "note" in e),
    drumEvents,
    totalSec: t,
    errors,
    state,
    fromAbove,
  }
}
