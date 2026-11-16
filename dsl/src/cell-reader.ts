/* The reader of a cell: it goes through the cell's statements in order, and keeps the
   mistakes, the plays' outputs and the state they leave. */
import { gridBlocks, type Output } from "./cell-grid.ts"
import {
  isChord,
  isNote,
  outputCtx,
  patternPlayCtx,
  type HitEvent,
  type SoundEvent,
  type Timed,
} from "./clips.ts"
import { checkBars, classifyDecl, defineBlock, defineWord, patternHint } from "./declare.ts"
import { blockClip, checkSection } from "./eval.ts"
import { classify } from "./lines.ts"
import { playDuration } from "./play-duration.ts"
import { Scope } from "./resolve.ts"
import { applySetting, readWithHeader, setInBlock, withState } from "./settings.ts"
import { Parser } from "./parser.ts"
import { bareValue, isBareValue, printValue, type PrintOutput } from "./print.ts"
import { cloneState, describe, initialState, type Line, type Piece, type State } from "./state.ts"
import { bracesIn, isBraces, located, plain, sourceOf } from "./parts.ts"
import type { Block, Span as SourceSpan, Statement, Text } from "./syntax.ts"
import {
  locator,
  message,
  overlaps,
  reportIn,
  type Diagnostic,
  type Report,
} from "./diagnostics.ts"
import { SourceText } from "./source.ts"
import { fmt, lengthPrefix, MAX_SECONDS, singularLength } from "./time.ts"
import { SETTINGS, TYPED_BRACES_RE, EVERY_RE, PLACE_RE, TYPED_RE } from "./vocab.ts"

type WithStatement = Extract<Statement, { kind: "with" }>
type PlayStatement = Extract<Statement, { kind: "play" }>
type PrintStatement = Extract<Statement, { kind: "print" }>
// A play's length, and the music it follows
type Duration = NonNullable<ReturnType<typeof playDuration>>
// A name given to something: its type, its name and what's after the =
type Declaration = { type: string | null; name: string; parts: (Text | Block)[] }
// What a play plays, as lines, and how it's named in the output
type PlayArgument = { arg: Line[]; label: string; ok: boolean }

const at = (b: Block) => `${b.span.line}:${b.span.col}`

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

// One cell being read. It holds what's found so far: the mistakes, each play's output, the
// values printed and the state the cell hands on.
export class CellReader {
  // What's wrong, each with the one span it's about. A mistake over code already said to be
  // wrong is left out: it follows from that one, and each mark an editor draws has one
  // message.
  private readonly errors: Diagnostic[] = []
  private readonly cellId = Symbol("cell source")
  private readonly raws: string[]
  private readonly tree
  private readonly unclosed: Set<string>
  // The statement being read, where a mistake on its line is looked for first
  private within: SourceSpan | null = null
  private err: Report
  private readonly report: Report
  // The mistakes in how the cell's braces and commas are put together
  private readonly syntax = new Set<Diagnostic>()
  private readonly inherited: State
  private readonly state: State
  private readonly setHere = new Map<string, number>() // setting name → the line in this cell that set it
  private readonly outputs: Output[] = []
  private readonly prints: PrintOutput[] = []
  private transposeLine: number | null = null

  constructor(src: unknown, inherited: State) {
    this.inherited = inherited
    const source = String(src || "")
    const locate = locator(source)
    this.err = (line, msg, at) => {
      const span = locate(line, msg, at, this.within)
      if (this.errors.some((e) => overlaps(e, span))) return
      this.errors.push({ ...span, msg })
    }
    this.report = this.err
    this.report.cell = this.cellId
    this.state = Scope.forCell(inherited, cloneState)
    this.raws = source.split("\n")
    this.tree = Parser.parse(this.raws.join("\n"))
    this.unclosed = new Set(
      this.tree.errors
        .filter((e) => e.code === "brace.unclosed")
        .map((e) => at({ span: e.span } as Block)),
    )
  }

  // Reads the whole cell into the reader
  read(): void {
    this.reportTreeErrors()
    if (!this.tree.errors.some((error) => error.code === "syntax.retiredOf"))
      this.run(this.tree.statements, this.state, false)
    this.within = null
  }

  // The mistake in how a cell's braces and commas are put together
  private syntaxErr: Report = (line, msg, at) => {
    const n = this.errors.length
    this.err(line, msg, at)
    if (this.errors.length > n) this.syntax.add(this.errors[n])
  }

  // A } that closes nothing is said where it is; a { that isn't closed, by what opened it
  private reportTreeErrors(): void {
    for (const e of this.tree.errors)
      if (e.code === "syntax.retiredOf")
        this.syntaxErr(e.span.line, message("syntax.retiredOf"), e.span)
      else if (e.code === "brace.stray") this.syntaxErr(e.span.line, message("brace.stray"), e.span)
      else if (e.code === "separator.semicolon")
        this.syntaxErr(e.span.line, message("separator.semicolon"), e.span)
      else if (e.code === "separator.empty")
        this.syntaxErr(e.span.line, message("separator.empty"), e.span)
      else if (e.code === "separator.top")
        this.syntaxErr(e.span.line, message("separator.top"), e.span)
      else if (e.code === "separator.missing")
        this.syntaxErr(e.span.line, message("separator.missing"), e.span)
  }

  // Makes mistakes be reported within this statement, quoting it as written
  private reportWithin(s: Statement): void {
    this.within = s.span
    this.err = reportIn(
      this.report,
      SourceText.join(
        s.parts.map((p) =>
          p.kind === "text"
            ? SourceText.from(p.text, p.span, this.cellId)
            : SourceText.block(p.span, this.cellId),
        ),
        " ",
      ),
    )
  }

  // A line as written, without its comment: what messages quote
  private lineAt(span: Statement["span"]) {
    return this.raws[span.line - 1]
      .slice(span.col, span.line === span.endLine ? span.endCol : undefined)
      .replace(/\/\/.*$/, "")
      .trim()
  }

  // A with that transposes, in a block or around one: the line it's on, for the check that
  // something pitched plays
  private noteTranspose(body: Line[]): void {
    for (const l of body) {
      const text = l.parts.filter((p) => !isBraces(p)).join(" ")
      if (/\bwith\b[^{]*\btranspose\s+-?\(?[1-9]/.test(text)) this.transposeLine ??= l.ln
      for (const b of bracesIn(l.parts)) this.noteTranspose(b.lines)
    }
  }

  // Parts of a statement read as one line: its text and the blocks in it, each block's
  // statements read as its lines. `what` names the statement when one of these braces isn't
  // closed. Whether a line in its blocks was left out as a mistake comes back as `dropped`.
  private lineOf(
    parts: (Text | Block)[],
    ln: number,
    what: string,
    layout = false,
  ): { line: Line; dropped: boolean } {
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
        const written = SourceText.from(p.text, p.span, this.cellId).tidy(layout)
        add(written.text, p.span, written)
        continue
      }
      if (this.unclosed.has(at(p)))
        this.syntaxErr(p.span.line, message("brace.unclosed", { what }), opening(p))
      const inner = this.blockLines(p.statements)
      dropped ||= inner.dropped
      if (!inner.body.length) {
        // Unless what was in them was a mistake, already said
        if (!inner.dropped) this.err(ln, message("brace.empty"), p.span)
        dropped = true
        out = []
        sources = []
        continue
      }
      add(
        { kind: "braces", ln: p.span.line, lines: inner.body },
        p.span,
        SourceText.block(p.span, this.cellId),
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
  private blockLines(statements: Statement[]): { body: Line[]; dropped: boolean } {
    const body: Line[] = []
    let dropped = false
    const outer = this.within
    const outerReport = this.err
    for (const s of statements) {
      const ln = s.span.line
      this.reportWithin(s)
      if (s.kind === "play" || s.kind === "print") {
        this.err(ln, message("brace.topOnly", { kind: s.kind }), s.kind)
        dropped = true
        continue
      }
      const first = s.parts[0]
      const head = first?.kind === "text" ? tidy(first.text) : ""
      const braced = s.parts.some((p) => p.kind === "block")
      if (braced && /^pattern\s/.test(head) && !TYPED_RE.test(head)) {
        // What's before its braces: the pattern that needs a name and =
        this.err(ln, patternHint(head), first.span)
        dropped = true
        continue
      }
      const read = this.lineOf(s.parts, ln, "This {", true)
      dropped ||= read.dropped
      if (read.line.parts.length) body.push(read.line)
    }
    this.within = outer
    this.err = outerReport
    return { body, dropped }
  }

  // Nothing follows a closing brace. A length there goes after `play kind { ... }`, and
  // `written` is the parts the tail was read from.
  private checkTail(tail: string, ln: number, kind: string, written: (Text | Block)[]) {
    if (!tail) return true
    const after = /^(\S+)\s+bars$/.exec(tail)
    const msg = after
      ? message("play.lengthAfter", { kind, bars: after[1] })
      : message("brace.trailing")
    this.err(ln, msg, spanOver(written))
    return false
  }

  // The statements of the cell, or of a with at the top of it, read into `state`. `inWith`
  // is whether they're a with's, whose settings go on the with.
  private run(statements: Statement[], state: State, inWith: boolean): void {
    for (const s of statements) {
      const ln = s.span.line
      this.reportWithin(s)
      // The statement's first line, as messages quote it
      const text = this.lineAt(s.span)
      const braces = s.parts.filter((p): p is Block => p.kind === "block")

      if (this.checkHead(s, ln, text)) continue
      if (s.kind === "with") {
        if (this.readWith(s, ln, braces, state)) break
        continue
      }
      if (s.kind === "print") {
        this.readPrint(s, ln, braces, state)
        continue
      }
      if (s.kind === "play") {
        this.readPlay(s, ln, text, braces, state, inWith)
        continue
      }
      if (this.readDeclaration(s, ln, text, state, inWith)) continue
      if (this.readStrayBraces(s, ln, text)) continue
      if (this.readBareValue(s, ln, braces, state, inWith)) continue
      this.readLine(s, ln, text, braces, state, inWith)
    }
  }

  // The mistakes any statement can make at its start, whatever it is: a length with no
  // unit, a pattern without its =, play with a colon or =. Whether one was said.
  private checkHead(s: Statement, ln: number, text: string): boolean {
    if (singularLength(text, ln, this.err)) return true
    // pattern groove {: a pattern without its =
    if (/^pattern(\s+[A-Za-z][A-Za-z0-9]*)?\s*(=.*)?$/.test(text) && !TYPED_RE.test(text)) {
      this.err(ln, patternHint(text), s.parts[0]?.kind === "text" ? s.parts[0].span : text)
      return true
    }

    if (/^play\s*[:=]/.test(text)) {
      this.err(
        ln,
        /^play\s*=/.test(text) ? message("play.noEquals") : message("play.noColon"),
        "play",
      )
      return true
    }
    return false
  }

  // with key E, mode minor { ... }: the statements in its braces, with those settings,
  // which end at its }. What's named inside stays inside, and nothing carries on. Whether
  // the statements after it are left unread, since its { isn't closed.
  private readWith(s: WithStatement, ln: number, braces: Block[], state: State): boolean {
    const block = braces[0]
    if (!block) {
      this.err(ln, message("with.help"), "with")
      return false
    }
    const head = s.settings.parts.map((p) => (p.kind === "text" ? tidy(p.text) : "")).join(" ")
    const settings = readWithHeader(head, ln, this.err)
    if (this.unclosed.has(at(block))) {
      this.syntaxErr(ln, message("brace.unclosed", { what: "This with" }), opening(block))
      return true
    }
    const after = s.parts.slice(s.parts.indexOf(block) + 1)
    if (after.length) this.err(block.span.endLine, message("brace.trailing"), spanOver(after))
    if (!block.statements.length) this.err(ln, message("brace.empty"), block.span)
    const inner = settings && withState(settings, state, ln, this.err)
    if (inner?.transpose && inner.transpose !== state.transpose) this.transposeLine ??= ln
    // A mistake in the header still has its block read, for the mistakes in that
    this.run(block.statements, inner || cloneState(state), true)
    return false
  }

  // print(...): the value shown, evaluated without playing
  private readPrint(s: PrintStatement, ln: number, braces: Block[], state: State): void {
    if (braces.length) this.err(ln, message("print.noBraces"), braces[0].span)
    else {
      const value = s.value.parts.map((p) => (p.kind === "text" ? p.text : "")).join(" ")
      const printed = printValue(value, state, ln, this.err)
      if (printed) this.prints.push(printed)
    }
  }

  // play plays what's after it: a name, a group, one line, or braces with their type.
  // play block { ... } plays its lines once and play pattern { ... } repeats them, and
  // either way a length after them is the braces' own, so what repeats fills it.
  private readPlay(
    s: PlayStatement,
    ln: number,
    text: string,
    braces: Block[],
    state: State,
    inWith: boolean,
  ): void {
    const duration = playDuration(s.value.parts, ln, this.err)
    if (!duration) return
    if (duration.parts[0]?.kind === "block") {
      this.err(ln, message("play.untyped"), opening(duration.parts[0]))
      return
    }
    const head = duration.parts[0]?.kind === "text" ? tidy(duration.parts[0].text) : ""
    const tailPart = duration.parts[duration.parts.length - 1]
    const placed = tailPart?.kind === "text" && PLACE_RE.test(tailPart.text)
    const typed = duration.parts[1]?.kind === "block" && /^(pattern|block)$/.test(head) && !placed
    const repeats = typed && head === "pattern"
    const parts = typed ? duration.parts.slice(1) : duration.parts
    const bars = duration.bars
    const ok = !duration.has || checkBars(bars, ln, this.err, duration.at!)
    const lead = parts[0]?.kind === "text" ? lengthPrefix(tidy(parts[0].text)) : null
    if (lead?.has) {
      // The length as written, in front of the music
      const written = (parts[0] as Text).text
      const shown = written.slice(0, written.length - lengthPrefix(written).rest.length)
      this.err(ln, message("play.durationAfter"), shown)
      return
    }
    if (!parts.length) {
      this.err(ln, bars ? message("play.needsMusic") : message("play.needsSomething"), "play")
      return
    }
    const made = this.playArgument(s, ln, text, braces, inWith, duration, parts, repeats, ok)
    this.noteTranspose(made.arg)
    this.playOutput(s, ln, text, made, repeats, bars, state)
  }

  // The lines a play plays: those in its braces, a group of braces, or the line it names.
  // Whether it can be played comes back as `ok`, and what to call it as `label`.
  private playArgument(
    s: PlayStatement,
    ln: number,
    text: string,
    braces: Block[],
    inWith: boolean,
    duration: Duration,
    parts: (Text | Block)[],
    repeats: boolean,
    ok: boolean,
  ): PlayArgument {
    const firstPart = parts[0]
    if (firstPart.kind === "block")
      return this.playBraces(firstPart, ln, text, duration, parts, repeats, ok)
    let label = text
    const bars = duration.bars
    if (braces.length || s.span.endLine > ln) {
      // play ({ ... } outro): blocks in a group, or a group that runs over several lines
      const read = this.lineOf(parts, ln, "This {", inWith)
      if (s.span.endLine > ln) {
        const size = bars ? ` for ${fmt(bars)} bars` : ""
        const shown = read.line.parts.map((p) => (isBraces(p) ? "{ … }" : p)).join(" ")
        label = `play ${shown.replace(/\s+/g, " ").trim()}${size}`
      }
      const arg = read.line.parts.length ? [read.line] : []
      if (!arg.length) ok = false
      return { arg, label, ok }
    }
    return { arg: [this.lineOf(parts, ln, "This {", inWith).line], label, ok }
  }

  // The lines of the braces a play opens with, and the mistakes in what follows them
  private playBraces(
    block: Block,
    ln: number,
    text: string,
    duration: Duration,
    parts: (Text | Block)[],
    repeats: boolean,
    startOk: boolean,
  ): PlayArgument {
    let ok = startOk
    let label = text
    const bars = duration.bars
    const lengthAfter = (tail: string) => /^\S+\s+bars$/.test(tail)
    if (this.unclosed.has(at(block)))
      this.syntaxErr(block.span.line, message("brace.unclosed", { what: "play" }), opening(block))
    const read = this.blockLines(block.statements)
    if (block.span.endLine > ln)
      label = text.replace(/\{.*$/, "{ … }") + (duration.has ? ` for ${fmt(bars)} bars` : "")
    if (!read.body.length) {
      // Unless what was in them was a mistake, already said
      if (!read.dropped) this.err(ln, message("play.emptyBraces"), block.span)
      ok = false
    }
    const kind = repeats ? "pattern" : "block"
    const tail = parts
      .slice(1)
      .map((p) => (p.kind === "text" ? tidy(p.text) : `${kind} { ... }`))
      .join(" ")
    if (tail && !lengthAfter(tail) && read.body.length) {
      // play block { ... } outro: things in order go in brackets
      this.err(
        block.span.endLine,
        message("play.inOrder", { kind, tail }),
        spanOver(parts.slice(1)),
      )
      ok = false
    } else if (!this.checkTail(tail, block.span.endLine, kind, parts.slice(1))) {
      ok = false
    }
    return { arg: read.body, label, ok }
  }

  // Plays what the play names, and keeps its output unless something in the statement was
  // a mistake
  private playOutput(
    s: PlayStatement,
    ln: number,
    text: string,
    made: PlayArgument,
    repeats: boolean,
    bars: number,
    state: State,
  ): void {
    const { arg, label, ok } = made
    const ctx = repeats ? patternPlayCtx(ln) : outputCtx(ln)
    const out = ok ? blockClip(arg, state, this.err, ctx, [], bars) : null
    if (out && out.durSec > MAX_SECONDS) {
      this.err(ln, message("play.tooLong"), text)
    } else if (
      out &&
      !this.errors.some((error) => error.line >= s.span.line && error.line <= s.span.endLine)
    ) {
      this.outputs.push({
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
  }

  // steps pair = ^-x-, chords verse = Am F, pattern groove = 3 bars { ... }: a name, or a
  // type and name left without their =. Whether the statement was one of these.
  private readDeclaration(
    s: Statement,
    ln: number,
    text: string,
    state: State,
    inWith: boolean,
  ): boolean {
    const decl = s.kind === "decl" ? { type: s.type, name: s.name, parts: s.value.parts } : null
    const noEquals = !decl && /^(pattern|block)\s+([A-Za-z][A-Za-z0-9]*)\s+(.+)$/.exec(text)
    if (noEquals) {
      this.err(
        ln,
        noEquals[1] === "pattern"
          ? patternHint(text)
          : message("decl.blockNeedsEquals", { name: noEquals[2] }),
        // What's before its braces: the type and name that need an = after them
        s.parts[0]?.kind === "text" ? s.parts[0].span : text,
      )
      return true
    }
    if (decl) {
      this.readDecl(decl, ln, state, inWith)
      return true
    }
    return false
  }

  // A name and what it is set to, defined in `state`
  private readDecl(decl: Declaration, ln: number, state: State, inWith: boolean): void {
    const read = this.lineOf(decl.parts, ln, decl.name, inWith)
    const value = read.line.parts
    if (!value.length && read.dropped) return // its braces were a mistake, already said
    this.noteTranspose([read.line])
    // pattern groove = { ... } 4 bars: the length after the braces
    const tail = isBraces(value[0]) && value.length === 2 ? value[1] : null
    const after = typeof tail === "string" ? /^(\S+)\s+bars$/.exec(tail.trim()) : null
    if (after) {
      this.err(
        ln,
        message("decl.lengthAfterBraces", { name: decl.name, bars: after[1] }),
        spanOver(decl.parts.slice(-1)),
      )
      return
    }
    const l = classifyDecl({ type: decl.type, name: decl.name, value }, ln, this.err, state)
    if (!l) return
    if (l.kind === "word")
      defineWord(l.type, l.name, l.value, ln, state, reportIn(this.err, sourceOf(l.value)))
    else {
      const sec = defineBlock(l, state, this.err)
      if (sec) checkSection(sec, state, this.err)
    }
  }

  // Braces on a line of their own that nothing plays or names, or a placement outside any
  // pattern or play. Whether the statement was one of these.
  private readStrayBraces(s: Statement, ln: number, text: string): boolean {
    // { ... }, pattern { ... } or 3 bars { ... } on its own: a block, but nothing plays it
    const alone = lengthPrefix(text)
    if (alone.rest.startsWith("{") || TYPED_BRACES_RE.test(alone.rest)) {
      const size = alone.has ? ` for ${fmt(alone.bars)} bars` : ""
      const kind = alone.rest.startsWith("pattern") ? "pattern" : "block"
      this.err(ln, message("play.nothingPlays", { kind, size }), text)
      this.lineOf(s.parts, ln, "This {")
      return true
    }
    const bare = /^([A-Za-z][A-Za-z0-9]*)\s*\{/.exec(text)
    if (bare) {
      this.err(ln, message("decl.noNameForBraces", { name: bare[1] }), bare[1])
      return true
    }
    // every 3/4 beats { ... } on its own: nothing plays it
    if (EVERY_RE.test(text)) {
      const shown = text.replace(/\{.*$/, "{ ... }")
      this.err(ln, message("play.nothingPlaysEvery", { shown }), text)
      this.lineOf(s.parts, ln, "This {")
      return true
    }
    // fill on bar 2 on its own: placement goes inside a pattern or play
    if (PLACE_RE.test(text)) {
      this.err(ln, message("play.placeOutside", { shown: text.replace(/\{.*$/, "{ ... }") }), text)
      this.lineOf(s.parts, ln, "This {")
      return true
    }
    return false
  }

  // A value on a line of its own is evaluated, and shown when it ends the cell, as
  // the last expression of a notebook cell is. print(...) shows one anywhere. Whether the
  // statement was one.
  private readBareValue(
    s: Statement,
    ln: number,
    braces: Block[],
    state: State,
    inWith: boolean,
  ): boolean {
    if (s.kind === "line" && !braces.length) {
      const value = s.parts.map((p) => (p.kind === "text" ? p.text : "")).join(" ")
      if (isBareValue(value, state)) {
        const printed = bareValue(value, state, ln, this.err)
        if (printed && !inWith && s === this.tree.statements[this.tree.statements.length - 1])
          this.prints.push(printed)
        return true
      }
    }
    return false
  }

  // Any other line: a setting at the top of the cell, or a line that plays nothing
  private readLine(
    s: Statement,
    ln: number,
    text: string,
    braces: Block[],
    state: State,
    inWith: boolean,
  ): void {
    const line = braces.length ? plain(ln, text) : this.lineOf(s.parts, ln, "This {").line
    const l = classify(line, this.err, state)
    if (!l) return
    if (l.kind === "setting" && inWith) this.err(ln, setInBlock(l), text)
    else if (l.kind === "setting") {
      if (applySetting(l.name, l.value, ln, state, this.err)) {
        this.setHere.set(l.name, ln)
        if (l.name === "transpose" && state.transpose) this.transposeLine ??= ln
      }
    } else if (l.kind === "part") {
      // Nothing floats at the top: what plays is inside a pattern or a play.
      this.err(ln, message("play.instrumentLine", { text }), text)
    } else this.err(ln, message("play.lineNothing", { text }), text)
  }

  // transpose only moves what has pitch, so one in a cell where only drums play is a
  // mistake. One inherited from a cell above is fine.
  private checkTranspose(): void {
    const pitched = this.outputs.some((o) => o.notes.length || o.chords.length)
    if (this.transposeLine != null && this.outputs.length && !pitched) {
      this.err(this.transposeLine, message("play.transposeDrums"), "transpose")
    }
  }

  // What this cell plays with from the cells above: every setting they changed, and every
  // instrument they set to another sound, unless this cell sets it again.
  private settingsFromAbove(): string[] {
    const start = initialState()
    const inherited = this.inherited
    return [
      ...SETTINGS.filter(
        (k) => !this.setHere.has(k) && describe(k, inherited) !== describe(k, start),
      ).map((k) => describe(k, inherited)),
      ...Object.entries(inherited.sounds)
        .filter(([instrument]) => !this.setHere.has(instrument))
        .map(([instrument, sound]) => `${instrument} ${sound}`),
    ]
  }

  // A malformed statement can cause secondary errors. Keep its syntax diagnostics, while
  // preserving independent mistakes in the cell's other statements.
  private dropSecondaryErrors(): void {
    const { errors, syntax, raws } = this
    if (syntax.size) {
      const broken = this.tree.statements.filter((s) =>
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
  }

  // What the cell came to: each play's output and the same back to back, the errors, and
  // the state it hands on
  result() {
    const { outputs, errors } = this
    this.checkTranspose()
    const fromAbove = this.settingsFromAbove()

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

    this.dropSecondaryErrors()
    return {
      kind: "music",
      outputs,
      prints: errors.length ? [] : this.prints,
      blocks,
      events,
      chords: events.filter(isChord),
      notes: events.filter(isNote),
      drumEvents,
      totalSec: t,
      errors,
      state: this.state,
      fromAbove,
    }
  }
}
