/* What the engine says when a cell is wrong, by code. Each message is written here once,
   with what it needs to say passed in, so the wording of a whole area can be read and
   changed in one place, and tsc checks that a code exists and gets what it needs.
   Messages still come out as { line, msg }; the codes are for the code that reports them.
   Moving here so far: settings, defining a name twice, time fitting, and of in a chart. The rest of the
   engine's messages are still written where they're reported. */
import { KITS, MODES, PITCHED, SETTINGS, SETTING_EXAMPLE, SOUNDS } from "./vocab.ts"

// set, or with in a with's header: how the setting was written, so the fix is written so
type Verb = "set" | "with"
// After a with's settings comes its block, so its examples show one
const tail = (verb: Verb) => (verb === "with" ? " { ... }" : "")

export const MESSAGES = {
  // A setting's name and value
  "set.empty": () => "set takes a setting and its value: set tempo 90",
  "set.needsValue": ({ verb, name }: { verb: Verb; name: (typeof SETTINGS)[number] }) =>
    `${verb} ${name} needs a value after it, e.g. ${verb} ${name} ${SETTING_EXAMPLE[name]}${tail(verb)}`,
  "set.needsSound": ({ verb, name }: { verb: Verb; name: keyof typeof SOUNDS }) =>
    `${verb} ${name} needs a sound after it: ${SOUNDS[name]!.join(" or ")}`,
  "set.oneSound": ({ name }: { name: string }) => {
    const choice = Object.entries(SOUNDS).map(([i, s]) => `${i} (${s.join(", ")})`)
    return `${name} has one sound. Instruments with more: ${choice.join(", ")}`
  },
  "set.unknownNear": ({ raw, verb, best }: { raw: string; verb: Verb; best: string }) =>
    `"${raw}" isn't a setting. Did you mean ${verb} ${best}?`,
  "set.unknown": ({ raw, verb }: { raw: string; verb: Verb }) =>
    `"${raw}" isn't a setting. Settings: ${SETTINGS.join(", ")}, and an instrument's sound: ${verb} guitar.electric muted${tail(verb)}`,

  // Each setting's values
  "time.division": ({
    verb,
    value,
    n,
    count,
    unit,
  }: {
    verb: Verb
    value: string
    n: number
    count: string
    unit: string
  }) =>
    `/ is division, so ${value} is the number ${+n.toFixed(4)}, not a time. Write ${verb} time ${count} over ${unit}`,
  "time.shape": ({ verb }: { verb: Verb }) =>
    `time is how many notes over which note: ${verb} time 7 over 8 is seven eighth notes in a bar`,
  "time.count": () =>
    "The first number of time is how many notes are in a bar, a whole number like 7 or 3+4",
  "time.unit": () => "The second number of time is the note being counted: 1, 2, 4, 8 or 16",
  "time.tooLong": () => "A bar can be up to 8 whole notes long",
  "tempo.range": () => "tempo is quarter notes per minute, between 20 and 400",
  "swing.onOff": ({ verb }: { verb: Verb }) =>
    `swing is on or off: ${verb} swing on plays the off-beat eighths late, as a triplet feel`,
  "key.withMode": ({ verb, root, mode }: { verb: Verb; root: string; mode: string }) =>
    verb === "with"
      ? `A key is a note: with key ${root}, mode ${mode} { ... }`
      : `A key is a note: set key ${root}, then set mode ${mode}`,
  "key.notAMode": ({ verb, root }: { verb: Verb; root: string }) =>
    `A key is a note: ${verb} key ${root}. Its mode is a setting of its own, one of ${MODES.join(", ")}`,
  "key.notANote": ({ verb }: { verb: Verb }) =>
    verb === "with"
      ? "A key is a note, A to G with # or b after it: with key E { ... }"
      : "A key is a note, A to G with # or b after it: set key E, set key Bb",
  "mode.camelCase": ({ verb, mode }: { verb: Verb; mode: string }) =>
    `Modes are camelCase: ${verb} mode ${mode}`,
  "mode.unknown": () => `mode is one of: ${MODES.join(", ")}`,
  "transpose.range": ({ verb }: { verb: Verb }) =>
    `transpose is a number of semitones from -12 to 12: ${verb} transpose 2 sounds a whole step up`,
  "octave.range": () => "octave is a number from 1 to 6",
  "kit.unknown": () => `kit is one of: ${KITS.join(", ")}`,
  "sound.unknown": ({ name }: { name: keyof typeof SOUNDS }) =>
    `${name}'s sound is one of: ${SOUNDS[name]!.join(", ")}`,
  "with.inLayers": ({ name }: { name: string }) =>
    `A with goes around ${name}'s line, not among its layers: with ${(PITCHED as readonly string[]).includes(name) ? "octave 5" : "kit synth"} { ${name}: { ... } }`,

  // Names
  "name.defined": ({ name, line }: { name: string; line: number }) =>
    `${name} is already defined on line ${line}. A name is defined once, so pick another name`,

  // What repeats has to fit what it's in a whole number of times
  "fit.whole": ({
    what,
    length,
    total,
    hint,
  }: {
    what: string
    length: string
    total: string
    hint: string
  }) => `${what} is ${length} long, which doesn't fit ${total} a whole number of times. ${hint}`,
  "fit.ownTempo": ({ what, total }: { what: string; total: string }) =>
    `${what} sets its own tempo, and doesn't fit ${total} a whole number of times`,
  "fit.hint": ({ many, when }: { many: boolean; when: string }) =>
    many ? `The things repeating here line up ${when}` : `It lines up ${when}`,

  // of in a chart: V7 of V
  "of.leftNumeral": () =>
    "In a chart, of takes a numeral in front of it, counted from the chord after it: V7 of V",
  "of.openBracket": () => "The ( after of closes on its line: V7 of (V of V)",
  "of.chainBrackets": () => "A chain of of's takes brackets: V7 of (V of V)",
  "chord.unknown": ({ chord }: { chord: string }) => `"${chord}" isn't a chord I know`,
} as const

export type Code = keyof typeof MESSAGES

// The message for `code`, said with `args`
export function message<C extends Code>(
  code: C,
  ...args: Parameters<(typeof MESSAGES)[C]>
): string {
  return (MESSAGES[code] as (...a: unknown[]) => string)(...args)
}
