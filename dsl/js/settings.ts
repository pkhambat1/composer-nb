/* Settings: set and with. A setting's name and value are read and checked here, then
   applied to a state: time, tempo, swing, key, mode, transpose, octave, kit, and an
   instrument's sound. A set applies from its line to the end of the cell; a with's settings
   apply to its block. */
import { parseKey } from "./chords.ts"
import { message } from "./diagnostics.ts"
import { closest } from "./resolve.ts"
import { cloneState, type State } from "./state.ts"
import { evalNumber, nearWhole, sumTerms, type Report } from "./time.ts"
import { among, KITS, MODES, PITCHED, SETTINGS, SOUNDS, soundsOf, SWING, type Setting } from "./vocab.ts"

// How a setting was written: after set, or in a with's header
type Verb = "set" | "with"
// An instrument with more than one sound
type Sounding = keyof typeof SOUNDS
// A setting's name and its value, as written
export type SettingWords = { name: string; value: string }

// The key a state is in, as the chords and the sheet read it.
export const keyOf = (st: State) => parseKey(st.key, st.mode)

// A key is a note, and the mode a setting of its own. Why `value` isn't a key, as the line
// to write after `verb` (set, or with in a with's header).
function keyProblem(value: string, verb: Verb): string {
  const both = /^([A-G][#b]?)(?:(m)|\s*([A-Za-z]+))$/.exec(value)
  const mode = both && (both[2] ? "minor" : both[3].toLowerCase())
  if (both && mode && among(MODES, mode))
    return message("key.withMode", { verb, root: both[1], mode })
  if (both) return message("key.notAMode", { verb, root: both[1] })
  return message("key.notANote", { verb })
}

// A with in an instrument's block, among its layers: it goes around the line instead.
export const withInLayers = (name: string) => message("with.inLayers", { name })

// Applies a setting to `state`. `verb` is how it was written, set or with, for messages.
// Returns whether it was one.
export function applySetting(
  name: string,
  value: string,
  ln: number,
  state: State,
  err: Report,
  verb: Verb = "set",
): boolean {
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
      )
      return false
    }
    const groups = sumTerms(count)
    if (!groups) {
      err(ln, message("time.count"))
      return false
    }
    if (![1, 2, 4, 8, 16].includes(unit.value)) {
      err(ln, message("time.unit"))
      return false
    }
    if (count.value / unit.value > 8) {
      err(ln, message("time.tooLong"))
      return false
    }
    state.groups = groups
    state.unit = unit.value
    return true
  }
  if (name === "tempo") {
    if (!num || !(num.value >= 20 && num.value <= 400)) {
      err(ln, message("tempo.range"))
      return false
    }
    state.tempo = num.value
    return true
  }
  if (name === "swing") {
    if (!among(SWING, value)) {
      err(ln, message("swing.onOff", { verb }))
      return false
    }
    state.swing = value === "on"
    return true
  }
  if (name === "key") {
    // The root that degrees and numerals count from. The mode is its own setting, so
    // setting one keeps the other.
    if (!parseKey(value)) {
      err(ln, keyProblem(value.trim(), verb))
      return false
    }
    state.key = value.trim()
    return true
  }
  if (name === "mode") {
    // How the key is written: its signature, and how accidentals are spelt. It changes no
    // pitch, since degrees and numerals count on the major scale of the root.
    if (!among(MODES, value)) {
      err(
        ln,
        among(MODES, value.toLowerCase())
          ? message("mode.lowercase", { verb, mode: value.toLowerCase() })
          : message("mode.unknown"),
      )
      return false
    }
    state.mode = value
    return true
  }
  if (name === "transpose") {
    // Every pitched instrument sounds that many semitones from what's written: the chart
    // and the notes stay as written, so a guitar's C shape under set transpose 4 is a capo
    // at the 4th fret. Drums have no pitch, so it leaves them alone.
    const n = whole(-12, 12)
    if (n == null) {
      err(ln, message("transpose.range", { verb }))
      return false
    }
    state.transpose = n
    return true
  }
  if (name === "octave") {
    const n = whole(1, 6)
    if (n == null) {
      err(ln, message("octave.range"))
      return false
    }
    state.octave = n
    return true
  }
  if (name === "kit") {
    if (!among(KITS, value)) {
      err(ln, message("kit.unknown"))
      return false
    }
    state.kit = value
    return true
  }
  if (soundsOf(name)) {
    if (!soundsOf(name)!.includes(value)) {
      err(ln, message("sound.unknown", { name: name as Sounding }))
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
    err(ln, message("set.empty"))
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
// Returns { name, value }, or null after saying what's wrong.
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
    err(ln, message("set.needsValue", { verb, name: name as Setting }))
    return null
  }
  if (soundsOf(name)) {
    if (value) return { name, value }
    err(ln, message("set.needsSound", { verb, name: name as Sounding }))
    return null
  }
  if (among(PITCHED, name)) {
    err(ln, message("set.oneSound", { name }))
    return null
  }
  const [best, far] = closest(name, [...SETTINGS, ...Object.keys(SOUNDS)])
  err(
    ln,
    far <= 2
      ? message("set.unknownNear", { raw, verb, best })
      : message("set.unknown", { raw, verb }),
  )
  return null
}

// The settings in a with's header (key E, mode minor), each a setting and its value, with
// commas between them. Returns [{ name, value }], or null after saying what's wrong.
export const WITH_HELP =
  "with takes the settings its block plays with, then the block: with octave 2 { ... }"
export function readWithHeader(head: string, ln: number, err: Report): SettingWords[] | null {
  if (!head.trim()) {
    err(ln, WITH_HELP)
    return null
  }
  const pieces = head.split(",").map((p) => p.trim())
  const out: SettingWords[] = []
  for (const [k, piece] of pieces.entries()) {
    if (!piece) {
      err(ln, "A comma goes between two settings: with key E, mode minor { ... }")
      return null
    }
    const words = piece.split(/\s+/)
    if (words[0] === "set") {
      const fixed = pieces.map((p) => p.replace(/^set\s+/, "")).join(", ")
      err(ln, `A with's settings have no set in front: with ${fixed} { ... }`)
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
      err(ln, `Settings in a with are separated by commas: with ${fixed.join(", ")} { ... }`)
      return null
    }
    const s = settingWords(words[0], piece.slice(words[0].length).trim(), ln, err, "with")
    if (!s) return null
    if (out.some((o) => o.name === s.name)) {
      err(ln, `${s.name} is in this with twice. A with sets each setting once`)
      return null
    }
    out.push(s)
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
  for (const s of settings) if (!applySetting(s.name, s.value, ln, st, err, "with")) return null
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
