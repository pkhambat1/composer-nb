/* Syntax highlighter for music cells (see language.js).
   Exposes highlightMusic(src) -> lines of token parts for React rendering.
   Each part: { c: className | null, s: text }
   Token classes (used by CSS):
     .tk-comment, .tk-directive-key, .tk-directive-val, .tk-inst, .tk-word, .tk-punct,
     .tk-bar, .tk-root, .tk-quality, .tk-ext, .tk-rest, .tk-slash, .tk-bass,
     .tk-beat, .tk-mod, .tk-step, .tk-step-acc, .tk-error, .tk-blank (block divider)
   Indentation is kept as plain text: it decides what a repeat line covers.
*/
import { DRUMS, INSTRUMENTS, MODIFIERS, SETTINGS } from "./language.js"
import { isRoman } from "./chords.js"

const ROMAN_RE = /^([#b])?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)([°oø]?)(.*)$/
const STEP_RE = /^[xXoOpPbBgdD]$/

function raw(parts, s) {
  if (s) parts.push({ c: null, s })
}

function span(parts, cls, s) {
  if (s) parts.push({ c: cls, s })
}

function highlightChordToken(token) {
  const parts = []
  let core = token
  let slashTail = []
  if (core.includes("/")) {
    const [main, bass] = core.split("/")
    core = main
    slashTail = [
      { c: "tk-slash", s: "/" },
      { c: "tk-bass", s: bass },
    ]
  }

  let rest = ""
  const rm = ROMAN_RE.exec(core)
  if (rm) {
    const numeral = rm[2]
    const isLower = numeral === numeral.toLowerCase()
    span(parts, "tk-root " + (isLower ? "tk-root-min" : "tk-root-maj"), (rm[1] || "") + numeral)
    span(parts, "tk-quality", rm[3])
    rest = rm[4] || ""
  } else {
    const am = /^([A-G][b#]?)(.*)$/.exec(core)
    if (!am) return [{ c: "tk-error", s: token }]
    span(parts, "tk-root tk-root-abs", am[1])
    rest = am[2] || ""
  }

  let i = 0
  while (i < rest.length) {
    const r = rest.slice(i)
    const q = /^(maj|min|sus2|sus4|sus|dim|aug|m|M|°|o|\+|ø|Δ)/.exec(r)
    const e = q ? null : /^(add9|b5|#5|b9|#9|#11|b13|13|11|9|7|6|2|4)/.exec(r)
    const m = q || e
    if (!m) {
      span(parts, "tk-error", rest.slice(i))
      break
    }
    span(parts, q ? "tk-quality" : "tk-ext", m[0])
    i += m[0].length
  }

  return parts.concat(slashTail)
}

// One value token, coloured for the kind of line it's on ("drum", "chord" or "word").
function valueToken(t, kind) {
  if (t === "|" || t === "%") return [{ c: "tk-bar", s: t }]
  if (t === "." || t === "_") return [{ c: "tk-rest", s: t }]
  if (t === ",") return [{ c: "tk-punct", s: t }]
  if (kind !== "chord") {
    // x..x... — a run of loop steps typed without spaces, coloured step by step. In a
    // word it could also be a chord (Bb), so there it needs a . or an x to count.
    if (t.length > 1 && /^[.xXoOpPbBgdD]+$/.test(t) && (kind === "drum" || /[.xX]/.test(t))) {
      return [...t].map((ch) =>
        ch === "." ? { c: "tk-rest", s: ch } : { c: ch === ch.toUpperCase() ? "tk-step tk-step-acc" : "tk-step", s: ch },
      )
    }
    if (/^\d+(e|&|a)?$/.test(t)) return [{ c: "tk-beat", s: t }]
    if (MODIFIERS.includes(t)) return [{ c: "tk-mod", s: t }]
    if (STEP_RE.test(t)) return [{ c: t === t.toUpperCase() ? "tk-step tk-step-acc" : "tk-step", s: t }]
  }
  if (/^[a-z][a-z0-9]+$/.test(t) && !isRoman(t)) return [{ c: "tk-word", s: t }]
  if (kind === "drum") return [{ c: "tk-error", s: t }]
  return highlightChordToken(t)
}

function values(parts, text, kind) {
  for (const piece of text.split(/(\s+|,|\|)/)) {
    if (!piece) continue
    if (/^\s+$/.test(piece)) raw(parts, piece)
    else parts.push(...valueToken(piece, kind))
  }
}

// Mirrors language.js: a line that starts with a chord (or a word, which may name a
// progression) is a chord line played by the sound setting.
function startsWithChords(body) {
  const first = body.split(/[\s,|]+/)[0]
  if (/^[a-z][a-z0-9]+$/.test(first) && !isRoman(first)) {
    return ![...SETTINGS, ...DRUMS, ...INSTRUMENTS, "repeat"].includes(first)
  }
  return !highlightChordToken(first).some((p) => p.c === "tk-error")
}

function kindOf(name) {
  if (DRUMS.includes(name)) return "drum"
  if (INSTRUMENTS.includes(name)) return "chord"
  return null
}

function highlightLine(line, prevKind) {
  const cm = /(^|\s)--/.exec(line)
  const cut = cm ? cm.index + cm[1].length : line.length
  const code = line.slice(0, cut)
  const comment = line.slice(cut)
  const parts = []
  let kind = null

  const lead = /^\s*/.exec(code)[0]
  const body = code.slice(lead.length)
  raw(parts, lead)
  const named = /^([A-Za-z][A-Za-z0-9]*)(\s*)([:=])(.*)$/.exec(body)
  const head = /^(repeat)(\s+)(\S+?)(\s*)(:)(\s*)$/i.exec(body)
  if (!body) {
    // blank or comment-only
  } else if (body.startsWith("|")) {
    kind = prevKind
    values(parts, body, prevKind || "chord")
  } else if (body.startsWith("@")) {
    span(parts, "tk-error", body)
  } else if (head) {
    // repeat 2: — the lines indented under it play again
    span(parts, "tk-directive-key", head[1])
    raw(parts, head[2])
    span(parts, /^\d+$/.test(head[3]) ? "tk-directive-val" : "tk-error", head[3])
    raw(parts, head[4])
    span(parts, "tk-punct", head[5])
    raw(parts, head[6])
  } else if (named && named[3] === "=") {
    span(parts, "tk-word", named[1])
    raw(parts, named[2])
    span(parts, "tk-punct", "=")
    values(parts, named[4], "word")
  } else if (named) {
    const name = named[1].toLowerCase()
    kind = kindOf(name)
    if (kind) span(parts, "tk-inst", named[1])
    else span(parts, SETTINGS.includes(name) ? "tk-directive-key" : "tk-error", named[1])
    raw(parts, named[2])
    span(parts, "tk-punct", ":")
    if (kind) values(parts, named[4], kind)
    else span(parts, "tk-directive-val", named[4])
  } else if (startsWithChords(body)) {
    kind = "chord"
    values(parts, body, "chord")
  } else {
    span(parts, "tk-error", body)
  }

  span(parts, "tk-comment", comment)
  return { parts, kind }
}

export function highlightMusic(src) {
  const lines = src.split("\n")
  let prevKind = null
  const out = lines.map((line) => {
    const { parts, kind } = highlightLine(line, prevKind)
    prevKind = kind || (line.trim().startsWith("|") ? prevKind : null)
    return { parts, kind, blank: !line.trim() }
  })

  // Draw a divider on a blank line that separates two blocks with instruments in them,
  // since the block after it plays after the one before it.
  const playsAt = out.map((l) => !!l.kind)
  let seenMusic = false
  for (let i = 0; i < out.length; i++) {
    if (playsAt[i]) seenMusic = true
    if (!out[i].blank || !seenMusic || (i > 0 && out[i - 1].blank)) continue
    let j = i + 1
    while (j < out.length && !playsAt[j]) j++
    if (j < out.length) {
      out[i].parts = [{ c: "tk-blank", s: "" }]
      seenMusic = false
    }
  }
  return out.map((l) => l.parts)
}
