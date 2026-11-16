/* Settings: set and with. A setting's name and value are read and checked here, then
   applied to a state: time, tempo, swing, key, mode, transpose, octave, kit, and an
   instrument's sound. A set applies from its line to the end of the cell; a with's settings
   apply to its block. */
import { parseKey } from "./chords.ts"
import { atOffset, message, reportIn, type Report, closest } from "./diagnostics.ts"
import { cloneState, type State } from "./state.ts"
import { evalNumber, nearWhole, sumTerms } from "./time.ts"
import type { SourceText } from "./source.ts"
import {
  among,
  KITS,
  MODES,
  modeNamed,
  PITCHED,
  SETTINGS,
  SOUNDS,
  soundsOf,
  SWING,
  type Setting,
} from "./vocab.ts"

// How a setting was written: after set, or in a with's header
type Verb = "set" | "with"
// An instrument with more than one sound
type Sounding = keyof typeof SOUNDS
// A setting's name and its value, as written
export type SettingWords = { name: string; value: string; source?: SourceText }

// A key is a note, and the mode a setting of its own. Why `value` isn't a key, as the line
// to write after `verb` (set, or with in a with's header).
function keyProblem(value: string, verb: Verb): string {
  const both = /^([A-G][#b]?)(?:(m)|\s*([A-Za-z]+))$/.exec(value)
  const mode = both && modeNamed(both[2] ? "minor" : both[3].toLowerCase())
  if (both && mode) return message("key.withMode", { verb, root: both[1], mode })
  if (both) return message("key.notAMode", { verb, root: both[1] })
  return message("key.notANote", { verb })
}

// Applies a setting to `state`. `verb` is how it was written, set or with, for messages.
// Returns whether it was one. A value that isn't right is the mistake, so that's what's
// reported.
export function applySetting(
  name: string,
  value: string,
  ln: number,
  state: State,
  err: Report,
  verb: Verb = "set",
): boolean {
  err = reportIn(err, err.source?.select(value))
  const num = evalNumber(value)
  const whole = (lo: number, hi: number) =>
    num && nearWhole(num.value) && num.value >= lo && num.value <= hi ? Math.round(num.value) : null
  if (name === "time") {
    // A time is two numbers, how many over which note: 7 over 8. It isn't a division,
    // so / has no business in it.
    const m = /^(.+?)\s+over\s+(.+)$/.exec(value)
    const count = m && evalNumber(m[1])
    const unit = m && evalNumber(m[2])
    if (!count || !unit) {
      const divided = /^(.*\S)\s*\/\s*(\d+)$/.exec(value)
      err(
        ln,
        divided && num
          ? message("time.division", {
              verb,
              value,
              n: num.value,
              count: divided[1].replace(/^\((.*)\)$/, "$1"),
              unit: divided[2],
            })
          : message("time.shape", { verb }),
        value,
      )
      return false
    }
    const groups = sumTerms(count)
    if (!groups) {
      err(ln, message("time.count"), atOffset(err, 0, m[1].length, m[1]))
      return false
    }
    if (![1, 2, 4, 8, 16].includes(unit.value)) {
      err(ln, message("time.unit"), atOffset(err, value.length - m[2].length, value.length, m[2]))
      return false
    }
    if (count.value / unit.value > 8) {
      err(ln, message("time.tooLong"), value)
      return false
    }
    state.groups = groups
    state.unit = unit.value
    return true
  }
  if (name === "tempo") {
    if (!num || !(num.value >= 20 && num.value <= 400)) {
      err(ln, message("tempo.range"), value)
      return false
    }
    state.tempo = num.value
    return true
  }
  if (name === "swing") {
    if (!among(SWING, value)) {
      err(ln, message("swing.onOff", { verb }), value)
      return false
    }
    state.swing = value === "on"
    return true
  }
  if (name === "key") {
    // The root that degrees and numerals count from. The mode is its own setting, so
    // setting one keeps the other.
    if (!parseKey(value)) {
      err(ln, keyProblem(value.trim(), verb), value)
      return false
    }
    state.key = value.trim()
    return true
  }
  if (name === "mode") {
    // The key's scale: degrees and numerals count on it, so in D minor 3 is F and III is F
    // major. It also gives the sheet its signature and how accidentals are spelt.
    const mode = modeNamed(value)
    if (!mode) {
      const found = MODES.find((m) => m.toLowerCase() === value.toLowerCase())
      err(
        ln,
        found ? message("mode.camelCase", { verb, mode: found }) : message("mode.unknown"),
        value,
      )
      return false
    }
    state.mode = mode
    return true
  }
  if (name === "transpose") {
    // Every pitched instrument sounds that many semitones from what's written: the chart
    // and the notes stay as written, so a guitar's C shape under set transpose 4 is a capo
    // at the 4th fret. Drums have no pitch, so it leaves them alone.
    const n = whole(-12, 12)
    if (n == null) {
      err(ln, message("transpose.range", { verb }), value)
      return false
    }
    state.transpose = n
    return true
  }
  if (name === "octave") {
    const n = whole(1, 6)
    if (n == null) {
      err(ln, message("octave.range"), value)
      return false
    }
    state.octave = n
    return true
  }
  if (name === "kit") {
    if (!among(KITS, value)) {
      err(ln, message("kit.unknown"), value)
      return false
    }
    state.kit = value
    return true
  }
  if (soundsOf(name)) {
    if (!soundsOf(name)!.includes(value)) {
      err(ln, message("sound.unknown", { name: name as Sounding }), value)
      return false
    }
    if (value === soundsOf(name)![0]) delete state.sounds[name]
    else state.sounds[name] = value
    return true
  }
  return false
}

// set tempo 90, set key D, set guitar.electric muted: a setting and its value, from here to
// the end of the cell and into later cells. Returns { kind: "setting" } or null after saying
// what's wrong.
export function readSetting(
  text: string,
  tokens: string[],
  ln: number,
  err: Report,
): { kind: "setting"; ln: number; name: string; value: string } | null {
  const raw = tokens[1] || ""
  if (!raw) {
    err(ln, message("set.empty"), "set")
    return null
  }
  const s = settingWords(
    raw,
    text
      .replace(/^set\s+/, "")
      .slice(raw.length)
      .trim(),
    ln,
    err,
    "set",
  )
  return s && { kind: "setting", ln, ...s }
}

// A setting's name and its value, as written after `verb`: set, or with in a with's header.
// Returns { name, value }, or null after saying what's wrong, which is about the name as
// written.
function settingWords(
  raw: string,
  value: string,
  ln: number,
  err: Report,
  verb: Verb,
): SettingWords | null {
  const name = raw.toLowerCase()
  if (among(SETTINGS, name)) {
    if (value) return { name, value }
    err(ln, message("set.needsValue", { verb, name: name as Setting }), raw)
    return null
  }
  if (soundsOf(name)) {
    if (value) return { name, value }
    err(ln, message("set.needsSound", { verb, name: name as Sounding }), raw)
    return null
  }
  if (among(PITCHED, name)) {
    err(ln, message("set.oneSound", { name }), raw)
    return null
  }
  const [best, far] = closest(name, [...SETTINGS, ...Object.keys(SOUNDS)])
  err(
    ln,
    far <= 2
      ? message("set.unknownNear", { raw, verb, best })
      : message("set.unknown", { raw, verb }),
    raw,
  )
  return null
}

// The settings in a with's header (key E, mode minor), each a setting and its value, with
// commas between them. Returns [{ name, value }], or null after saying what's wrong, which
// is about the one setting or comma that's wrong.
export const WITH_HELP =
  "with takes the settings its block plays with, then the block: with octave 2 { ... }"
export function readWithHeader(head: string, ln: number, err: Report): SettingWords[] | null {
  const header = err.source?.select(head)
  const outerReport = err
  if (!head.trim()) {
    err(ln, WITH_HELP, "with")
    return null
  }
  const pieces = head.split(",").map((p) => p.trim())
  const commas = [...head.matchAll(/,/g)].map((m) => m.index)
  const out: SettingWords[] = []
  for (const [k, piece] of pieces.entries()) {
    const source = header?.slice(k ? commas[k - 1] + 1 : 0, commas[k] ?? head.length).trim()
    err = reportIn(outerReport, source)
    if (!piece) {
      // The comma that has no setting on one side: the first one, the two with nothing
      // between them, or the last one. A last comma after others is written with the
      // setting before it, so it's that comma that's found.
      const comma =
        k === 0 || (k === 1 && pieces.length === 2)
          ? ","
          : k < pieces.length - 1
            ? head.slice(commas[k - 1], commas[k] + 1)
            : head.slice(commas[k - 2] + 1, commas[k - 1] + 1).trim()
      err(ln, "A comma goes between two settings: with key E, mode minor { ... }", comma)
      return null
    }
    const words = piece.split(/\s+/)
    if (words[0] === "set") {
      const fixed = pieces.map((p) => p.replace(/^set\s+/, "")).join(", ")
      err(ln, `A with's settings have no set in front: with ${fixed} { ... }`, "set")
      return null
    }
    // with key E mode minor: two settings, without the comma between them
    const next = words.findIndex((w, i) => i > 0 && (among(SETTINGS, w) || soundsOf(w)))
    if (next > 0) {
      const fixed = [
        ...pieces.slice(0, k),
        words.slice(0, next).join(" ") + ", " + words.slice(next).join(" "),
        ...pieces.slice(k + 1),
      ]
      // It's the setting without a comma before it that's wrong
      err(
        ln,
        `Settings in a with are separated by commas: with ${fixed.join(", ")} { ... }`,
        words.slice(next).join(" "),
      )
      return null
    }
    const s = settingWords(words[0], piece.slice(words[0].length).trim(), ln, err, "with")
    if (!s) return null
    if (out.some((o) => o.name === s.name)) {
      // The second one is the one that's wrong
      err(ln, `${s.name} is in this with twice. A with sets each setting once`, piece)
      return null
    }
    out.push({ ...s, source })
  }
  return out
}

// The state inside a with: `state` with the header's settings applied, or null after saying
// what's wrong.
export function withState(
  settings: SettingWords[],
  state: State,
  ln: number,
  err: Report,
): State | null {
  const st = cloneState(state)
  for (const s of settings)
    if (!applySetting(s.name, s.value, ln, st, reportIn(err, s.source), "with")) return null
  return st
}

// What a with's time, tempo and swing set: the block plays at its own pace, so it can't
// sound together with other lines. Returns the first of them, or undefined.
const OWN_PACE: readonly string[] = ["time", "tempo", "swing"]
export const pacing = (settings: SettingWords[]) => settings.find((s) => OWN_PACE.includes(s.name))

// A set inside a block, which takes a with instead
export const setInBlock = (l: SettingWords) =>
  `Inside a block, settings go on a with: with ${l.name} ${l.value} { ... }`

// The key and mode as one name, for headers: E minor, C major.
export const keyName = (s: State) => `${s.key} ${s.mode}`
