/* A cell, read and played: parseCell. It reads the cell's lines in order: settings at the
   top, names, withs and plays. Each play is evaluated into a clip (eval.ts), and the clips
   are put back to back into one timeline, with the blocks the grid and the sheet draw. */
import {
  isChord,
  isNote,
  outputCtx,
  patternPlayCtx,
  type ChordSound,
  type HitEvent,
  type NoteSound,
  type SoundEvent,
  type Span,
  type Timed,
} from "./clips.ts"
import { checkBars, classifyDecl, defineBlock, defineWord, patternHint } from "./declare.ts"
import { blockClip, checkSection } from "./eval.ts"
import { classify, EVERY_RE, PLACE_RE, TYPED_RE } from "./lines.ts"
import { playDuration } from "./play-duration.ts"
import { Scope } from "./resolve.ts"
import { applySetting, readWithHeader, setInBlock, WITH_HELP, withState } from "./settings.ts"
import { Parser } from "./parser.ts"
import { bareValue, isBareValue, printValue, type PrintOutput } from "./print.ts"
import { cloneState, describe, initialState, type Line, type Piece, type State } from "./state.ts"
import { bracesIn, isBraces, located, plain, sourceOf } from "./parts.ts"
import type { Block, Span as SourceSpan, Statement, Text } from "./syntax.ts"
import { locator, overlaps, reportIn, type Diagnostic } from "./diagnostics.ts"
import { SourceText } from "./source.ts"
import { fmt, lengthPrefix, MAX_SECONDS, singularLength, TPQ, type Report } from "./time.ts"
import { SETTINGS, TYPED_BRACES_RE } from "./vocab.ts"

// The braces after play say their type, as any others do
const UNTYPED_PLAY =
  "These braces need a type: play pattern { ... } repeats, play block { ... } plays once"

// What one play plays
// One block of a play's output, as the grid and the sheet draw it
export type GridBlock = ReturnType<typeof gridBlocks>[number]

export type Output = {
  line: number
  label: string
  durSec: number
  totalSec: number
  events: SoundEvent[]
  chords: ChordSound[]
  notes: NoteSound[]
  drumEvents: HitEvent[]
  blocks: ReturnType<typeof gridBlocks>
  // Set once its audio is rendered: what couldn't be loaded
  warnings?: string[]
}

// Grid cells per quarter note: the coarsest that still shows every hit, and where every
// note stops.
function gridResolution(drumEvents: HitEvent[], noteEvents: NoteSound[], barTicks: number): number {
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
  noteEvents: NoteSound[],
  chordEvents: ChordSound[] = [],
) {
  const merged: Span[] = []
  for (const s of [...spans].sort((a, b) => a.startSec - b.startSec)) {
    const last = merged[merged.length - 1]
    if (
      last &&
      last.time === s.time &&
      last.tempo === s.tempo &&
      last.swing === s.swing &&
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
    const within = <E extends SoundEvent>(events: E[]): E[] =>
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
// A cell, read: each play's output, the same back to back, the errors, and the state it
// hands on
export type Parsed = ReturnType<typeof parseCell> & { warnings?: string[] }

export function parseCell(src: unknown, inherited: State = initialState()) {
  // What's wrong, each with the one span it's about. A mistake over code already said to be
  // wrong is left out: it follows from that one, and each mark an editor draws has one
  // message.
  const errors: Diagnostic[] = []
  const cellId = Symbol("cell source")
  const source = String(src || "")
  const locate = locator(source)
  // The statement being read, where a mistake on its line is looked for first
  let within: SourceSpan | null = null
  let err: Report = (line, msg, at) => {
    const span = locate(line, msg, at, within)
    if (errors.some((e) => overlaps(e, span))) return
    errors.push({ ...span, msg })
  }
  const report = err
  report.cell = cellId
  // The mistakes in how the cell's braces and commas are put together
  const syntax = new Set<Diagnostic>()
  const syntaxErr: Report = (line, msg, at) => {
    const n = errors.length
    err(line, msg, at)
    if (errors.length > n) syntax.add(errors[n])
  }
  const state = Scope.forCell(inherited, cloneState)
  const setHere = new Map() // setting name → the line in this cell that set it
  const outputs: Output[] = []
  const prints: PrintOutput[] = []
  let transposeLine: number | null = null

  const raws = source.split("\n")
  const tree = Parser.parse(raws.join("\n"))
  // A } that closes nothing is said where it is; a { that isn't closed, by what opened it
  for (const e of tree.errors)
    if (e.code === "syntax.retiredOf")
      syntaxErr(
        e.span.line,
        '"of" expressions are no longer supported. Use interval functions such as fifth(5) or third(1); they follow the active scale',
        e.span,
      )
    else if (e.code === "brace.stray")
      syntaxErr(e.span.line, "This } doesn't close anything", e.span)
    else if (e.code === "separator.semicolon")
      syntaxErr(
        e.span.line,
        "Use commas between entries in braces instead of semicolons; a trailing comma is allowed",
        e.span,
      )
    else if (e.code === "separator.empty")
      syntaxErr(
        e.span.line,
        "A comma needs an entry before it; only the final comma may go before }",
        e.span,
      )
    else if (e.code === "separator.top")
      syntaxErr(e.span.line, "Outside braces, put each statement on its own line", e.span)
    else if (e.code === "separator.missing")
      syntaxErr(e.span.line, "Put a comma between entries in braces", e.span)
  const at = (b: Block) => `${b.span.line}:${b.span.col}`
  const unclosed = new Set(
    tree.errors
      .filter((e) => e.code === "brace.unclosed")
      .map((e) => at({ span: e.span } as Block)),
  )
  // The { a block opens with: what's marked when it isn't closed, or has no type
  const opening = (b: Block): SourceSpan => ({
    line: b.span.line,
    col: b.span.col,
    endLine: b.span.line,
    endCol: b.span.col + 1,
  })
  // Where parts of a statement were written, from the first to the end of the last. A text
  // ends where its words do, since a reader may have cut some off the end.
  const spanOver = (parts: (Text | Block)[]): SourceSpan => {
    const first = parts[0].span
    const last = parts[parts.length - 1]
    if (last.kind === "block")
      return { ...first, endLine: last.span.endLine, endCol: last.span.endCol }
    const rows = last.text.split("\n")
    const endLine = last.span.line + rows.length - 1
    const endCol = (rows.length > 1 ? 0 : last.span.col) + rows[rows.length - 1].length
    return { line: first.line, col: first.col, endLine, endCol }
  }
  // A line as written, without its comment: what messages quote
  const lineAt = (span: Statement["span"]) =>
    raws[span.line - 1]
      .slice(span.col, span.line === span.endLine ? span.endCol : undefined)
      .replace(/\/\/.*$/, "")
      .trim()

  // A with that transposes, in a block or around one: the line it's on, for the check that
  // something pitched plays
  const noteTranspose = (body: Line[]) => {
    for (const l of body) {
      const text = l.parts.filter((p) => !isBraces(p)).join(" ")
      if (/\bwith\b[^{]*\btranspose\s+-?\(?[1-9]/.test(text)) transposeLine ??= l.ln
      for (const b of bracesIn(l.parts)) noteTranspose(b.lines)
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

  // Parts of a statement read as one line: its text and the blocks in it, each block's
  // statements read as its lines. `what` names the statement when one of these braces isn't
  // closed. Whether a line in its blocks was left out as a mistake comes back as `dropped`.
  const lineOf = (
    parts: (Text | Block)[],
    ln: number,
    what: string,
    layout = false,
  ): { line: Line; dropped: boolean } => {
    let out: Piece[] = []
    let sources: SourceText[] = []
    let dropped = false
    let last = 0 // the line the part before ended on
    // A part goes on a line of its own when it starts on a later line than the one before
    const add = (more: Piece, from: SourceSpan, written: SourceText) => {
      const gap = out.length && from.line > last && !layout ? "\n" : out.length ? " " : ""
      const before = out[out.length - 1]
      if (typeof more === "string" && typeof before === "string") {
        out[out.length - 1] += gap + more
        sources[sources.length - 1] = SourceText.join([sources[sources.length - 1], written], gap)
      } else if (typeof more === "string") {
        out.push(gap + more)
        sources.push(SourceText.join([SourceText.writtenAs(gap, from), written]))
      } else {
        if (gap === "\n") {
          out.push("\n")
          sources.push(SourceText.writtenAs(gap, from))
        }
        out.push(more)
        sources.push(written)
      }
      last = from.endLine
    }
    for (const p of parts) {
      if (p.kind === "text") {
        const written = SourceText.from(p.text, p.span, cellId).tidy(layout)
        add(written.text, p.span, written)
        continue
      }
      if (unclosed.has(at(p))) syntaxErr(p.span.line, `${what} needs a } to close it`, opening(p))
      const inner = blockLines(p.statements)
      dropped ||= inner.dropped
      if (!inner.body.length) {
        // Unless what was in them was a mistake, already said
        if (!inner.dropped) err(ln, "These braces have nothing in them", p.span)
        dropped = true
        out = []
        sources = []
        continue
      }
      add(
        { kind: "braces", ln: p.span.line, lines: inner.body },
        p.span,
        SourceText.block(p.span, cellId),
      )
    }
    // A line has no space at its ends. Line breaks inside it stay: in a group in brackets, a
    // line of its own ends at one.
    if (typeof out[0] === "string") {
      sources[0] = sources[0].slice(out[0].length - out[0].trimStart().length)
      out[0] = out[0].trimStart()
    }
    const end = out[out.length - 1]
    if (typeof end === "string") {
      sources[out.length - 1] = sources[out.length - 1].slice(0, end.trimEnd().length)
      out[out.length - 1] = end.trimEnd()
    }
    return {
      line: {
        ln,
        parts: located(
          out.filter((p) => isBraces(p) || p),
          sources.filter((_, i) => isBraces(out[i]) || out[i]),
        ),
      },
      dropped,
    }
  }

  // A block's statements as its lines. play goes at the top, and a pattern takes =, so
  // either inside braces is said and left out.
  const blockLines = (statements: Statement[]): { body: Line[]; dropped: boolean } => {
    const body: Line[] = []
    let dropped = false
    const outer = within
    const outerReport = err
    for (const s of statements) {
      const ln = s.span.line
      within = s.span
      err = reportIn(
        report,
        SourceText.join(
          s.parts.map((p) =>
            p.kind === "text"
              ? SourceText.from(p.text, p.span, cellId)
              : SourceText.block(p.span, cellId),
          ),
          " ",
        ),
      )
      if (s.kind === "play" || s.kind === "print") {
        err(ln, `${s.kind} goes at the top, not inside braces`, s.kind)
        dropped = true
        continue
      }
      const first = s.parts[0]
      const head = first?.kind === "text" ? tidy(first.text) : ""
      const braced = s.parts.some((p) => p.kind === "block")
      if (braced && /^pattern\s/.test(head) && !TYPED_RE.test(head)) {
        // What's before its braces: the pattern that needs a name and =
        err(ln, patternHint(head), first.span)
        dropped = true
        continue
      }
      const read = lineOf(s.parts, ln, "This {", true)
      dropped ||= read.dropped
      if (read.line.parts.length) body.push(read.line)
    }
    within = outer
    err = outerReport
    return { body, dropped }
  }

  // Nothing follows a closing brace. `front(n)` is the right way to write a length there,
  // and `written` is the parts the tail was read from.
  const checkTail = (
    tail: string,
    ln: number,
    front: (n: string) => string,
    written: (Text | Block)[],
  ) => {
    if (!tail) return true
    const after = /^(\S+)\s+bars$/.exec(tail)
    const msg = after ? `Write the length like this: ${front(after[1])}` : "Nothing can follow a }"
    err(ln, msg, spanOver(written))
    return false
  }

  // The statements of the cell, or of a with at the top of it, read into `state`. `inWith`
  // is whether they're a with's, whose settings go on the with.
  const run = (statements: Statement[], state: State, inWith: boolean): void => {
    for (const s of statements) {
      const ln = s.span.line
      within = s.span
      err = reportIn(
        report,
        SourceText.join(
          s.parts.map((p) =>
            p.kind === "text"
              ? SourceText.from(p.text, p.span, cellId)
              : SourceText.block(p.span, cellId),
          ),
          " ",
        ),
      )
      // The statement's first line, as messages quote it
      const text = lineAt(s.span)
      const braces = s.parts.filter((p): p is Block => p.kind === "block")

      if (singularLength(text, ln, err)) continue
      // pattern groove {: a pattern without its =
      if (/^pattern(\s+[A-Za-z][A-Za-z0-9]*)?\s*(=.*)?$/.test(text) && !TYPED_RE.test(text)) {
        err(ln, patternHint(text), s.parts[0]?.kind === "text" ? s.parts[0].span : text)
        continue
      }

      if (/^play\s*[:=]/.test(text)) {
        err(
          ln,
          /^play\s*=/.test(text)
            ? "play is a keyword, not a name, so it takes no =: play groove"
            : "play is a keyword, not an instrument, so it takes no colon: play groove",
          "play",
        )
        continue
      }

      // with key E, mode minor { ... }: the statements in its braces, with those settings,
      // which end at its }. What's named inside stays inside, and nothing carries on.
      if (s.kind === "with") {
        const block = braces[0]
        if (!block) {
          err(ln, WITH_HELP, "with")
          continue
        }
        const head = s.settings.parts.map((p) => (p.kind === "text" ? tidy(p.text) : "")).join(" ")
        const settings = readWithHeader(head, ln, err)
        if (unclosed.has(at(block))) {
          syntaxErr(ln, "This with needs a } to close it", opening(block))
          break
        }
        const after = s.parts.slice(s.parts.indexOf(block) + 1)
        if (after.length) err(block.span.endLine, "Nothing can follow a }", spanOver(after))
        if (!block.statements.length) err(ln, "These braces have nothing in them", block.span)
        const inner = settings && withState(settings, state, ln, err)
        if (inner?.transpose && inner.transpose !== state.transpose) transposeLine ??= ln
        // A mistake in the header still has its block read, for the mistakes in that
        run(block.statements, inner || cloneState(state), true)
        continue
      }

      if (s.kind === "print") {
        if (braces.length) err(ln, "print takes musical values, without braces", braces[0].span)
        else {
          const value = s.value.parts.map((p) => (p.kind === "text" ? p.text : "")).join(" ")
          const printed = printValue(value, state, ln, err)
          if (printed) prints.push(printed)
        }
        continue
      }

      if (s.kind === "play") {
        // play plays what's after it: a name, a group, one line, or braces with their type.
        // play block { ... } plays its lines once and play pattern { ... } repeats them, and
        // either way a length after them is the braces' own, so what repeats fills it.
        const duration = playDuration(s.value.parts, ln, err)
        if (!duration) continue
        if (duration.parts[0]?.kind === "block") {
          err(ln, UNTYPED_PLAY, opening(duration.parts[0]))
          continue
        }
        const head = duration.parts[0]?.kind === "text" ? tidy(duration.parts[0].text) : ""
        const tailPart = duration.parts[duration.parts.length - 1]
        const placed = tailPart?.kind === "text" && PLACE_RE.test(tailPart.text)
        const typed =
          duration.parts[1]?.kind === "block" && /^(pattern|block)$/.test(head) && !placed
        const repeats = typed && head === "pattern"
        const parts = typed ? duration.parts.slice(1) : duration.parts
        const bars = duration.bars
        let ok = !duration.has || checkBars(bars, ln, err, duration.at!)
        const lead = parts[0]?.kind === "text" ? lengthPrefix(tidy(parts[0].text)) : null
        if (lead?.has) {
          // The length as written, in front of the music
          const written = (parts[0] as Text).text
          const shown = written.slice(0, written.length - lengthPrefix(written).rest.length)
          err(ln, "A play's duration follows its music: play groove for 2 bars", shown)
          continue
        }
        if (!parts.length) {
          err(
            ln,
            bars
              ? "play needs music before for: play groove for 2 bars"
              : "play needs something after it: play groove, or play block { ... }",
            "play",
          )
          continue
        }
        let arg: Line[]
        let label = text
        const lengthAfter = (tail: string) => /^\S+\s+bars$/.test(tail)
        const firstPart = parts[0]
        if (firstPart.kind === "block") {
          const block = firstPart
          if (unclosed.has(at(block)))
            syntaxErr(block.span.line, "play needs a } to close it", opening(block))
          const read = blockLines(block.statements)
          if (block.span.endLine > ln)
            label = text.replace(/\{.*$/, "{ … }") + (duration.has ? ` for ${fmt(bars)} bars` : "")
          if (!read.body.length) {
            // Unless what was in them was a mistake, already said
            if (!read.dropped) err(ln, "This play has nothing in its braces", block.span)
            ok = false
          }
          const kind = repeats ? "pattern" : "block"
          const tail = parts
            .slice(1)
            .map((p) => (p.kind === "text" ? tidy(p.text) : `${kind} { ... }`))
            .join(" ")
          if (tail && !lengthAfter(tail) && read.body.length) {
            // play block { ... } outro: things in order go in brackets
            err(
              block.span.endLine,
              `What plays in order goes in brackets: play (${kind} { ... } ${tail})`,
              spanOver(parts.slice(1)),
            )
            ok = false
          } else if (
            !checkTail(
              tail,
              block.span.endLine,
              (n) => `play ${kind} { ... } for ${n} bars`,
              parts.slice(1),
            )
          ) {
            ok = false
          }
          arg = read.body
        } else if (braces.length || s.span.endLine > ln) {
          // play ({ ... } outro): blocks in a group, or a group that runs over several lines
          const read = lineOf(parts, ln, "This {", inWith)
          if (s.span.endLine > ln) {
            const size = bars ? ` for ${fmt(bars)} bars` : ""
            const shown = read.line.parts.map((p) => (isBraces(p) ? "{ … }" : p)).join(" ")
            label = `play ${shown.replace(/\s+/g, " ").trim()}${size}`
          }
          arg = read.line.parts.length ? [read.line] : []
          if (!arg.length) ok = false
        } else {
          arg = [lineOf(parts, ln, "This {", inWith).line]
        }
        noteTranspose(arg)
        const ctx = repeats ? patternPlayCtx(ln) : outputCtx(ln)
        const out = ok ? blockClip(arg, state, err, ctx, [], bars) : null
        if (out && out.durSec > MAX_SECONDS) {
          err(ln, "This plays for over 10 minutes. Use a shorter length", text)
        } else if (
          out &&
          !errors.some((error) => error.line >= s.span.line && error.line <= s.span.endLine)
        ) {
          outputs.push({
            line: ln,
            label,
            durSec: out.durSec,
            totalSec: out.durSec,
            events: out.events,
            chords: out.events.filter(isChord),
            notes: out.events.filter(isNote),
            drumEvents: out.drumEvents,
            blocks: gridBlocks(
              out.spans,
              out.drumEvents,
              out.events.filter(isNote),
              out.events.filter(isChord),
            ),
          })
        }
        continue
      }

      // steps pair = ^-x-, chords verse = Am F, pattern groove = 3 bars { ... }: a name.
      const decl = s.kind === "decl" ? { type: s.type, name: s.name, parts: s.value.parts } : null
      const noEquals = !decl && /^(pattern|block)\s+([A-Za-z][A-Za-z0-9]*)\s+(.+)$/.exec(text)
      if (noEquals) {
        err(
          ln,
          noEquals[1] === "pattern"
            ? patternHint(text)
            : `A block gets its name with =: block ${noEquals[2]} = { ... }`,
          // What's before its braces: the type and name that need an = after them
          s.parts[0]?.kind === "text" ? s.parts[0].span : text,
        )
        continue
      }
      if (decl) {
        const read = lineOf(decl.parts, ln, decl.name, inWith)
        const value = read.line.parts
        if (!value.length && read.dropped) continue // its braces were a mistake, already said
        noteTranspose([read.line])
        // pattern groove = { ... } 4 bars: the length after the braces
        const tail = isBraces(value[0]) && value.length === 2 ? value[1] : null
        const after = typeof tail === "string" ? /^(\S+)\s+bars$/.exec(tail.trim()) : null
        if (after) {
          err(
            ln,
            `A length goes in front of what it measures: pattern ${decl.name} = ${after[1]} bars {`,
            spanOver(decl.parts.slice(-1)),
          )
          continue
        }
        const l = classifyDecl({ type: decl.type, name: decl.name, value }, ln, err, state)
        if (!l) continue
        if (l.kind === "word")
          defineWord(l.type, l.name, l.value, ln, state, reportIn(err, sourceOf(l.value)))
        else {
          const sec = defineBlock(l, state, err)
          if (sec) checkSection(sec, state, err)
        }
        continue
      }
      // { ... }, pattern { ... } or 3 bars { ... } on its own: a block, but nothing plays it
      const alone = lengthPrefix(text)
      if (alone.rest.startsWith("{") || TYPED_BRACES_RE.test(alone.rest)) {
        const size = alone.has ? ` for ${fmt(alone.bars)} bars` : ""
        const kind = alone.rest.startsWith("pattern") ? "pattern" : "block"
        err(ln, `Nothing plays this. Write play ${kind} { ... }${size}`, text)
        lineOf(s.parts, ln, "This {")
        continue
      }
      const bare = /^([A-Za-z][A-Za-z0-9]*)\s*\{/.exec(text)
      if (bare) {
        err(ln, `${bare[1]} needs a type and = to name its braces: pattern ${bare[1]} = {`, bare[1])
        continue
      }
      // every 3/4 beats { ... } on its own: nothing plays it
      if (EVERY_RE.test(text)) {
        const shown = text.replace(/\{.*$/, "{ ... }")
        err(
          ln,
          `Nothing plays this. Put play in front, or give it a name: pattern slow = ${shown}`,
          text,
        )
        lineOf(s.parts, ln, "This {")
        continue
      }
      // fill on bar 2 on its own: placement goes inside a pattern or play
      if (PLACE_RE.test(text)) {
        err(
          ln,
          `${text.replace(/\{.*$/, "{ ... }")} goes inside a pattern or a play, to say where in it`,
          text,
        )
        lineOf(s.parts, ln, "This {")
        continue
      }

      // A value on a line of its own is evaluated, and shown when it ends the cell, as
      // the last expression of a notebook cell is. print(...) shows one anywhere.
      if (s.kind === "line" && !braces.length) {
        const value = s.parts.map((p) => (p.kind === "text" ? p.text : "")).join(" ")
        if (isBareValue(value, state)) {
          const printed = bareValue(value, state, ln, err)
          if (printed && !inWith && s === tree.statements[tree.statements.length - 1])
            prints.push(printed)
          continue
        }
      }

      const line = braces.length ? plain(ln, text) : lineOf(s.parts, ln, "This {").line
      const l = classify(line, err, state)
      if (!l) continue
      if (l.kind === "setting" && inWith) err(ln, setInBlock(l), text)
      else if (l.kind === "setting") {
        if (applySetting(l.name, l.value, ln, state, err)) {
          setHere.set(l.name, ln)
          if (l.name === "transpose" && state.transpose) transposeLine ??= ln
        }
      } else if (l.kind === "part") {
        // Nothing floats at the top: what plays is inside a pattern or a play.
        err(
          ln,
          `An instrument's line goes inside braces: in a pattern, or play block { ${text} }`,
          text,
        )
      } else err(ln, `Nothing plays this line. Write play ${text}`, text)
    }
  }
  if (!tree.errors.some((error) => error.code === "syntax.retiredOf"))
    run(tree.statements, state, false)
  within = null

  // transpose only moves what has pitch, so one in a cell where only drums play is a
  // mistake. One inherited from a cell above is fine.
  const pitched = outputs.some((o) => o.notes.length || o.chords.length)
  if (transposeLine != null && outputs.length && !pitched) {
    err(
      transposeLine,
      "transpose moves notes and chords, and only drums play here. Give an instrument some: piano: chords C G",
      "transpose",
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

  // A malformed statement can cause secondary errors. Keep its syntax diagnostics, while
  // preserving independent mistakes in the cell's other statements.
  if (syntax.size) {
    const broken = tree.statements.filter((s) =>
      [...syntax].some(
        (e) =>
          overlaps(s.span, e) ||
          (s.span.endLine === e.line &&
            s.span.endCol <= e.col &&
            !raws[e.line - 1].slice(s.span.endCol, e.col).trim()),
      ),
    )
    errors.splice(
      0,
      errors.length,
      ...errors.filter((e) => syntax.has(e) || !broken.some((s) => overlaps(s.span, e))),
    )
  }
  errors.sort((a, b) => a.line - b.line || a.col - b.col)
  return {
    kind: "music",
    outputs,
    prints: errors.length ? [] : prints,
    blocks,
    events,
    chords: events.filter(isChord),
    notes: events.filter(isNote),
    drumEvents,
    totalSec: t,
    errors,
    state,
    fromAbove,
  }
}
