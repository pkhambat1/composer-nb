/* What the engine says about names: declaring one, what it can be called, which instrument
   a line is for, and where a name of each type can go. */
import type { Type } from "../vocab.ts"

// A word between a count and a list: "a, b and c"
const listed = (items: string[]) => `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`

export const NAME_MESSAGES = {
  // A name defined
  "name.defined": ({ name, line }: { name: string; line: number }) =>
    `${name} is already defined on line ${line}. A name is defined once, so pick another name`,
  "name.lowercase": ({ type, fixed }: { type: string; fixed: string }) =>
    `Names start with a lowercase letter: ${type} ${fixed}`,
  "name.tooShort": () => "Names need at least two characters, because single letters are steps",
  "name.chord": ({ name }: { name: string }) => `${name} is a chord, so pick another name`,
  "name.capitals": ({ name, twin }: { name: string; twin: string }) =>
    `${name} differs from ${twin} only in its capitals, so pick another name or write ${twin}`,
  "name.instrument": ({ name, plays }: { name: string; plays: string }) =>
    `${name} is an instrument, so it takes a colon: ${name}: ${plays}`,
  "name.taken": ({ name }: { name: string }) =>
    `${name} already means something, so pick another name`,
  "name.double": ({ name }: { name: string }) =>
    `${name} is a double on a beat, so pick another name`,
  "name.needsEquals": ({ type, name, value }: { type: string; name: string; value: string }) =>
    `${type} ${name} needs = before what it holds: ${type} ${name} = ${value}`,
  "name.needsName": ({ word }: { word: string }) =>
    `${word} needs a name after it: ${word} ${word === "pattern" ? "groove" : "riff"} = ...`,

  // A name used
  "name.cantBe": ({ name, fixed }: { name: string; fixed: string }) =>
    `"${name}" can't be a name, since names start with a lowercase letter: ${fixed}`,
  "name.undefinedPatterns": ({ name, names }: { name: string; names: string[] }) =>
    `"${name}" isn't defined. Patterns so far: ${names.join(", ")}`,
  "name.undefined": ({ name }: { name: string }) =>
    `"${name}" isn't defined. Name it first: pattern ${name} = { ... }`,
  "name.undefinedAbove": ({ tok, type }: { tok: string; type: string }) =>
    `"${tok}" isn't defined above. Name it first: ${type} ${tok} = ...`,
  "name.wrongType": ({ name, type, into }: { name: string; type: string; into: string }) =>
    `${name} is ${type}, so it can't go in ${into}`,
  "name.wrongSection": ({ name, type, into }: { name: string; type: string; into: string }) =>
    `${name} is a ${type}, so it can't go in ${into}`,
  "name.isSteps": ({
    tok,
    name,
    into,
    value,
  }: {
    tok: string
    name: string
    into: string
    value: string
  }) => `"${tok}" is steps, and ${name} is ${into}. For steps, write steps ${name} = ${value}`,
  "name.isNotes": ({
    tok,
    name,
    type,
    notes,
  }: {
    tok: string
    name: string
    type: string
    notes: string
  }) => `"${tok}" is notes, and ${name} is ${type}. For notes, write notes ${name} = ${notes}`,
  "name.isChord": ({ tok, name, value }: { tok: string; name: string; value: string }) =>
    `"${tok}" is a chord, and ${name} is steps. For chords, write chords ${name} = ${value}`,

  // A declaration's value
  "decl.needsValue": ({ type, name }: { type: string | null; name: string }) =>
    `${type ? type + " " : ""}${name} = needs something after the =`,
  "decl.withValue": ({ type, name }: { type: string; name: string }) =>
    `A with's block plays, so it goes around a line or a play, not after ${type} ${name} =`,
  "decl.typedBraces": ({ name, type }: { name: string; type: string }) =>
    `${name} is a ${type}, so its braces take no type: ${type} ${name} = { ... }`,
  "decl.settingNotName": ({ name, value }: { name: string; value: string }) =>
    `${name} is a setting, not a name, so it takes no =: set ${name} ${value}`,
  "decl.settingsList": ({ name, settings }: { name: string; settings: readonly string[] }) =>
    `"${name}" isn't a setting. Settings: ${settings.join(", ")}`,
  "decl.needsType": ({ shape, name, shown }: { shape: string; name: string; shown: string }) =>
    `Say what ${name} is. Put its type in front: ${shape} ${name} = ${shown}`,
  "decl.notPattern": ({
    shown,
    shape,
    name,
    line,
  }: {
    shown: string
    shape: string
    name: string
    line: string
  }) =>
    `${shown} is ${shape}, not a pattern. Write ${shape} ${name} = ${shown}, ` +
    `or give them an instrument: pattern ${name} = ${line}${shown}`,
  "decl.isPattern": ({ type, name }: { type: string; name: string }) =>
    `That's a pattern, not ${type}. Write pattern ${name} = ...`,
  "decl.noNameForBraces": ({ name }: { name: string }) =>
    `${name} needs a type and = to name its braces: pattern ${name} = {`,
  "decl.blockNeedsEquals": ({ name }: { name: string }) =>
    `A block gets its name with =: block ${name} = { ... }`,
  "decl.patternNeedsEquals": ({ name, size }: { name: string; size: string }) =>
    `A pattern gets its name with =: pattern ${name} = ${size}{ ... }`,
  "decl.lengthBehindType": ({ bars }: { bars: string }) =>
    `A length goes in front of what it measures: ${bars} bars pattern { ... }`,
  "decl.lengthAfterBraces": ({ name, bars }: { name: string; bars: string }) =>
    `A length goes in front of what it measures: pattern ${name} = ${bars} bars {`,
  "decl.notesNameOpen": ({ name }: { name: string }) =>
    `A name's notes have a length of their own. ... is the rest of a block, so it goes on the instrument's line: piano: notes ${name} ...5`,
  "decl.stepsNameOpen": ({ name }: { name: string }) =>
    `A name's steps have a length of their own. ... is the rest of a block, so it goes on the drum's line: snare: ${name} ...x-`,
  "decl.chordsRepeat": ({ name, again }: { name: string; again: string }) =>
    `${name} repeats ${again}. Write chords ${name} = ${again}: a pattern repeats it`,
  "decl.chordsBlock": () =>
    "Chords play one at a time, so they can't be layered in a block. Put them on one line: piano: chords Am F|C G",
  "decl.notesBlock": () =>
    "A name holds one line of notes. Notes that play together go in a block on the instrument's line: piano: { ... }",
  // A block of steps is the whole of what it's written on, so nothing goes beside it
  "block.beside": ({ what, fig, example }: { what: string; fig: string; example: string }) =>
    `A block is everything ${what}, so nothing goes beside it. ` +
    `To put steps in a row with a block, name it: steps ${fig} = { ... } and ${example}`,

  // Which instrument a line is for
  "instrument.closedHat": () =>
    "The closed hi-hat is hat on its own; hat.open is the open one, and hat.pedal the foot",
  "instrument.notDrumSplit": ({
    name,
    drum,
    lanes,
  }: {
    name: string
    drum: string
    lanes: string[]
  }) => `"${name}" isn't a drum. The ${drum}s are ${listed(lanes)}`,
  "instrument.otherSound": ({
    name,
    drum,
    sounds,
  }: {
    name: string
    drum: string
    sounds: string[]
  }) => `"${name}" isn't an instrument. ${drum}'s other sound is ${sounds.join(", ")}`,
  "instrument.oneSound": ({ name, drum }: { name: string; drum: string }) =>
    `"${name}" isn't an instrument. ${drum} has one sound: ${drum}: notes F---G---`,
  "instrument.nearDrum": ({ name, close }: { name: string; close: string }) =>
    `"${name}" isn't a drum. Did you mean ${close}?`,
  "instrument.drumSounds": ({ name, second }: { name: string; second: string[] }) =>
    `"${name}" isn't a drum. Drums with a second sound: ${second.join(", ")}`,
  "instrument.near": ({ name, best }: { name: string; best: string }) =>
    `"${name}" isn't an instrument. Did you mean ${best}?`,
  "instrument.unknown": ({ name, parts }: { name: string; parts: readonly string[] }) =>
    `"${name}" isn't an instrument. Instruments: ${parts.join(", ")}`,

  // Where a name of each type goes
  "misplaced.ownLine": ({ name, type }: { name: string; type: Type }) =>
    `${name} is a ${type}, so it goes on a line of its own, not on an instrument's line`,
  "misplaced.beats": ({ name, type }: { name: string; type: Type }) =>
    `${name} is ${type}, which don't go in a list of beats`,
  "misplaced.layer": ({ name, type }: { name: string; type: Type }) =>
    `${name} is ${type === "pattern" || type === "block" ? `a ${type}` : type}, so it can't be a layer of steps`,
  "misplaced.drum": ({ name, type }: { name: string; type: Type }) =>
    `${name} is ${type}, so it goes on a line like piano: ${type} ${name}, not on a drum's`,
  "misplaced.stepsOnPitched": ({ name, part }: { name: string; part: string }) =>
    `${name} is steps, so it goes on a drum's line, not on ${part}'s`,
  "misplaced.chordsInFront": ({ name, part, text }: { name: string; part: string; text: string }) =>
    `${name} is chords, so chords goes in front of it: ${part}: chords ${text}`,
  "misplaced.chordsAmongNotes": ({ name }: { name: string }) =>
    `${name} is chords, and the rest of this line is notes. A line plays one or the other`,
  "misplaced.notesInFront": ({ name, part }: { name: string; part: string }) =>
    `${name} is notes, so notes goes in front of it: ${part}: notes ${name}`,
  "misplaced.stepsAmongChords": ({ name }: { name: string }) =>
    `${name} is steps, so it goes on a drum's line, not among chords`,
  "misplaced.notesAmongChords": ({ name }: { name: string }) =>
    `${name} is notes, and the rest of this line is chords. A line plays one or the other`,
  "misplaced.stepsOnOwn": ({ name }: { name: string }) =>
    `${name} is steps, so it goes on a drum's line: hat: ${name}`,
  "misplaced.onInstrument": ({ name, type }: { name: string; type: Type }) =>
    `${name} is ${type}, so it goes on an instrument's line: piano: ${type} ${name}`,
} as const
