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
import { checkBars, classifyDecl, defineBlock, defineWord, patternHint } from "./declare.ts"
import { blockClip, checkSection } from "./eval.ts"
import { classify, EVERY_RE, PLACE_RE, TYPED_RE } from "./lines.ts"
import { Scope } from "./resolve.ts"
import { applySetting, readWithHeader, setInBlock, WITH_HELP, withState } from "./settings.ts"
import { Parser } from "./parser.ts"
import {
  cloneState,
  describe,
  initialState,
  type Line,
  type LineBlock,
  type State,
} from "./state.ts"
import type { Block, Statement, Text } from "./syntax.ts"
import { fmt, lengthPrefix, MAX_SECONDS, singularLength, TPQ } from "./time.ts"
import { joinOf, ofShown } from "./values/notes.ts"
import { SETTINGS } from "./vocab.ts"

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
  const tree = Parser.parse(raws.join("\n"))
  // A } that closes nothing is said where it is; a { that isn't closed, by what opened it
  for (const e of tree.errors)
    if (e.code === "brace.stray") err(e.span.line, "This } doesn't close anything")
  const at = (b: Block) => `${b.span.line}:${b.span.col}`
  const unclosed = new Set(
    tree.errors
      .filter((e) => e.code === "brace.unclosed")
      .map((e) => at({ span: e.span } as Block)),
  )
  // A line as written, without its comment: what messages quote
  const lineAt = (ln: number) => joinOf(raws[ln - 1].replace(/\/\/.*$/, "").trim())

  let anonCount = 0
  // A with that transposes, in a block or around one: the line it's on, for the check that
  // something pitched plays
  const noteTranspose = (body: Line[]) => {
    for (const l of body) {
      if (/\bwith\b[^{]*\btranspose\s+-?\(?[1-9]/.test(l.text)) transposeLine ??= l.ln
      for (const b of Object.values(l.blocks || {})) noteTranspose(b.lines)
    }
  }

  // Text as the engine reads it: each line trimmed, and a line that starts with | joined to
  // the line above it, at a bar line.
  const tidy = (text: string) => {
    const out: string[] = []
    for (const line of text.split("\n").map((l) => l.trim())) {
      // the line above, passing over the ones that were only a comment
      let above = out.length - 1
      while (above >= 0 && !out[above]) above--
      if (line.startsWith("|") && above >= 0) {
        out[above] = `${out[above].replace(/\|\s*$/, "")} ${line}`
      } else out.push(line)
    }
    return out.join("\n").trim()
  }

  // Parts of a statement read as one line: its text, with each block in it written {#1} and
  // kept in `blocks`. `what` names the statement when one of these braces isn't closed.
  // Whether a line in its blocks was left out as a mistake comes back as `dropped`.
  const lineOf = (
    parts: (Text | Block)[],
    ln: number,
    what: string,
  ): { line: Line; dropped: boolean } => {
    let text = ""
    let blocks: Record<string, LineBlock> | null = null
    let dropped = false
    let last = 0 // the line the part before ended on
    // A part goes on a line of its own when it starts on a later line than the one before
    const add = (more: string, from: { line: number; endLine: number }) => {
      text = !text ? more : `${text}${from.line > last ? "\n" : " "}${more}`
      last = from.endLine
    }
    for (const p of parts) {
      if (p.kind === "text") {
        add(tidy(p.text), p.span)
        continue
      }
      if (unclosed.has(at(p))) err(p.span.line, `${what} needs a } to close it`)
      const inner = blockLines(p.statements)
      dropped ||= inner.dropped
      if (!inner.body.length) {
        // Unless what was in them was a mistake, already said
        if (!inner.dropped) err(ln, "These braces have nothing in them")
        text = ""
        continue
      }
      const key = `{#${++anonCount}}`
      blocks = { ...(blocks ?? {}), [key]: { key, anon: true, ln, lines: inner.body, bars: 0 } }
      add(key, p.span)
    }
    const line: Line = { ln, text: joinOf(text), blocks }
    return { line, dropped }
  }

  // A block's statements as its lines. play goes at the top, and a pattern takes =, so
  // either inside braces is said and left out.
  const blockLines = (statements: Statement[]): { body: Line[]; dropped: boolean } => {
    const body: Line[] = []
    let dropped = false
    for (const s of statements) {
      const ln = s.span.line
      if (s.kind === "play") {
        err(ln, "play goes at the top, not inside braces")
        dropped = true
        continue
      }
      const first = s.parts[0]
      const head = first?.kind === "text" ? tidy(first.text) : ""
      const braced = s.parts.some((p) => p.kind === "block")
      if (braced && /^pattern(\s|$)/.test(head) && !TYPED_RE.test(head)) {
        err(ln, patternHint(head))
        dropped = true
        continue
      }
      const read = lineOf(s.parts, ln, "This {")
      dropped ||= read.dropped
      if (read.line.text.trim()) body.push(read.line)
    }
    return { body, dropped }
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

  // The statements of the cell, or of a with at the top of it, read into `state`. `inWith`
  // is whether they're a with's, whose settings go on the with.
  const run = (statements: Statement[], state: State, inWith: boolean): void => {
    for (const s of statements) {
      const ln = s.span.line
      // The statement's first line, as messages quote it
      const text = lineAt(ln)
      const braces = s.parts.filter((p): p is Block => p.kind === "block")

      if (singularLength(text, ln, err)) continue
      // pattern groove {: a pattern without its =
      if (/^pattern(\s+[A-Za-z][A-Za-z0-9]*)?\s*(=.*)?$/.test(text) && !TYPED_RE.test(text)) {
        err(ln, patternHint(text))
        continue
      }

      if (/^play\s*[:=]/.test(text)) {
        err(
          ln,
          /^play\s*=/.test(text)
            ? "play is a keyword, not a name, so it takes no =: play { ... }"
            : "play is a keyword, not an instrument, so it takes no colon: play groove",
        )
        continue
      }

      // with key E, mode minor { ... }: the statements in its braces, with those settings,
      // which end at its }. What's named inside stays inside, and nothing carries on.
      if (s.kind === "with") {
        const block = braces[0]
        if (!block) {
          err(ln, WITH_HELP)
          continue
        }
        const head = s.settings.parts.map((p) => (p.kind === "text" ? tidy(p.text) : "")).join(" ")
        const settings = readWithHeader(head, ln, err)
        if (unclosed.has(at(block))) {
          err(ln, "This with needs a } to close it")
          break
        }
        const after = s.parts.slice(s.parts.indexOf(block) + 1)
        if (after.length) err(block.span.endLine, "Nothing can follow a }")
        if (!block.statements.length) err(ln, "These braces have nothing in them")
        const inner = settings && withState(settings, state, ln, err)
        if (inner?.transpose && inner.transpose !== state.transpose) transposeLine ??= ln
        // A mistake in the header still has its block read, for the mistakes in that
        run(block.statements, inner || cloneState(state), true)
        continue
      }

      if (s.kind === "play") {
        // play plays what's after it: a block in braces, or one line. play groove and
        // play { groove } are the same thing.
        let parts = s.value.parts
        let bars = 0
        let ok = true
        const lead = parts[0]?.kind === "text" ? lengthPrefix(tidy(parts[0].text)) : null
        if (lead?.has) {
          // play 3 bars { ... }, play 3 bars groove: how long the output is
          ok = checkBars(lead.bars, ln, err)
          bars = lead.bars
          const rest = lead.rest.trim()
          parts = rest ? [{ ...(parts[0] as Text), text: rest }, ...parts.slice(1)] : parts.slice(1)
        }
        if (!parts.length) {
          err(
            ln,
            bars
              ? `${text} of what? Put a pattern or its name after it: ${text} { ... }`
              : "play needs something after it: play groove, or play { ... }",
          )
          continue
        }
        let arg: Line[]
        let label = text
        const lengthAfter = (tail: string) => /^\S+\s+bars$/.test(tail)
        const firstPart = parts[0]
        if (firstPart.kind === "block") {
          const block = firstPart
          if (unclosed.has(at(block))) err(block.span.line, "play needs a } to close it")
          const read = blockLines(block.statements)
          if (block.span.endLine > ln) label = text.replace(/\{.*$/, "{ … }")
          if (!read.body.length) {
            err(ln, "This play has nothing in its braces")
            ok = false
          }
          const tail = parts
            .slice(1)
            .map((p) => (p.kind === "text" ? tidy(p.text) : "{ ... }"))
            .join(" ")
          if (tail && !lengthAfter(tail) && read.body.length) {
            // play { ... } outro: things in order go in brackets
            err(block.span.endLine, `What plays in order goes in brackets: play ({ ... } ${tail})`)
            ok = false
          } else if (!checkTail(tail, block.span.endLine, (n) => `play ${n} bars { ... }`)) {
            ok = false
          }
          arg = read.body
        } else if (braces.length || s.span.endLine > ln) {
          // play ({ ... } outro): blocks in a group, or a group that runs over several lines
          const read = lineOf(parts, ln, "This {")
          if (s.span.endLine > ln) {
            const size = bars ? `${fmt(bars)} bars ` : ""
            label = `play ${size}${read.line.text
              .replace(/\{#\d+\}/g, "{ … }")
              .replace(/\s+/g, " ")
              .trim()}`
          }
          arg = read.line.text.trim() ? [read.line] : []
          if (!arg.length) ok = false
        } else {
          arg = [{ ln, text: lineOf(parts, ln, "This {").line.text }]
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
      // pattern groove { without its =: said once, and still named, so nothing else breaks
      let decl: { type: string | null; name: string; parts: (Text | Block)[] } | null =
        s.kind === "decl" ? { type: s.type, name: s.name, parts: s.value.parts } : null
      const noEquals = !decl && /^pattern\s+([A-Za-z][A-Za-z0-9]*)\s+(.+)$/.exec(text)
      if (noEquals) {
        err(ln, patternHint(text))
        const first = s.parts[0] as Text
        const rest = tidy(first.text).replace(/^pattern\s+[A-Za-z][A-Za-z0-9]*\s*/, "")
        decl = {
          type: "pattern",
          name: noEquals[1],
          parts: rest ? [{ ...first, text: rest }, ...s.parts.slice(1)] : s.parts.slice(1),
        }
      }
      if (decl) {
        const read = lineOf(decl.parts, ln, decl.name)
        if (!read.line.text.trim()) continue // its braces were a mistake, already said
        noteTranspose([read.line])
        const after = /^\{#\d+\}\s+(\S+)\s+bars$/.exec(read.line.text)
        if (after) {
          err(
            ln,
            `A length goes in front of what it measures: pattern ${decl.name} = ${after[1]} bars {`,
          )
          continue
        }
        const value = read.line.text
        const l = classifyDecl(
          { type: decl.type, name: decl.name, value },
          { ln, blocks: read.line.blocks },
          err,
          state,
        )
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
        continue
      }
      // every 3 steps { ... } on its own: nothing plays it
      if (EVERY_RE.test(text)) {
        const shown = text.replace(/\{.*$/, "{ ... }")
        err(ln, `Nothing plays this. Put play in front, or give it a name: pattern slow = ${shown}`)
        lineOf(s.parts, ln, "This {")
        continue
      }
      // bar 2 { ... } on its own: it says where in a pattern or play, so it goes inside one
      if (PLACE_RE.test(text)) {
        err(
          ln,
          `${text.replace(/\{.*$/, "{ ... }")} goes inside a pattern or a play, to say where in it`,
        )
        lineOf(s.parts, ln, "This {")
        continue
      }
      // { ... } or 3 bars { ... } on its own: a block, but nothing plays it
      if (lengthPrefix(text).rest.startsWith("{")) {
        err(
          ln,
          `Nothing plays this pattern. Put play in front: play ${text.replace(/\{.*$/, "{ ... }")}`,
        )
        lineOf(s.parts, ln, "This {")
        continue
      }

      const line = braces.length ? text : lineOf(s.parts, ln, "This {").line.text
      const l = classify({ ln, text: line }, err, state)
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
  run(tree.statements, state, false)

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
