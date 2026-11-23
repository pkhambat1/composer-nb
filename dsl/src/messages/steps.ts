/* What the engine says about steps: a drum's line, its beats, its layers and its repeats. */

const STEP_HELP = "Use x (hit), ^ (accent), ~ (ghost), d (double) or - (nothing)"

export const STEP_MESSAGES = {
  // A step, and what isn't one
  "step.notAStep": ({ tok, where = "" }: { tok: string; where?: string }) =>
    `"${tok}"${where} isn't a step. ${STEP_HELP}`,
  "step.notAStepWord": ({ word }: { word: string }) => `"${word}" isn't a step word. ${STEP_HELP}`,
  "step.undefined": ({ tok }: { tok: string }) =>
    `"${tok}" isn't defined above. Name it first: steps ${tok} = ^-x-`,
  "step.isNotes": ({
    tok,
    where = "",
    part,
    notes,
  }: {
    tok: string
    where?: string
    part: string
    notes: string
  }) =>
    `"${tok}"${where} is notes, and ${part} is a drum. Notes go on a pitched instrument's line: guitar: notes ${notes}`,
  "step.isChord": ({ tok, where = "", part }: { tok: string; where?: string; part: string }) =>
    `"${tok}"${where} is a chord, and ${part} is a drum. Chords go on a pitched instrument's line: piano: chords ${tok}`,
  "step.ghostOnSnare": () => "the snare's ghost notes go on a line of their own: snare.ghost: --x-",
  "step.ghostAccented": () => "snare.ghost hits are ghost notes, so they can't be accented",
  "step.ghostGhost": () => "every hit on snare.ghost is a ghost note already, so write x",
  // A token with what's wrong with it, where `where` says which name it came from
  "step.problem": ({
    tok,
    where = "",
    problem,
  }: {
    tok: string
    where?: string
    problem: string
  }) => `"${tok}"${where}: ${problem}`,
  "step.barLine": ({ after, time, bar }: { after: string; time: string; bar: string }) =>
    `This | isn't at the end of a bar: it's after ${after}, and a ${time} bar is ${bar}`,

  // Beats
  "step.beatsAlone": ({ drum }: { drum: string }) =>
    "Beats are one bar's hits, with nothing else on the line. To say how a beat is hit, " +
    `put its step in front: ^4 (accent), ~4 (ghost), d4 (double). For one bar only, name it: bar 2 ${drum}: 2 4`,
  "step.beatPlain": ({ tok, beat }: { tok: string; beat: string }) =>
    `${tok}: a beat on its own is already a plain hit, so write ${beat}`,
  "step.beatPastEnd": ({ beat, time, last }: { beat: string; time: string; last: string }) =>
    `${beat} is past the end of a ${time} bar, which ends on ${last}`,
  "step.beatTwice": ({ beat }: { beat: string }) => `${beat} is on this line twice`,
  "step.notABeat": ({ tok }: { tok: string }) =>
    `"${tok}" isn't a beat. Beats look like 1, 2&, 3e or 4a, or ^4 with a step in front`,
  "step.beatsNotWhole": ({ time }: { time: string }) =>
    `A ${time} bar isn't a whole number of steps, so these beats can't be steps`,
  "step.beatOffStep": ({ tok }: { tok: string }) =>
    `${tok} isn't on a step, so these beats can't be steps`,

  // A kit line's step words
  "step.needsWord": () => "A repeat needs a step word or a group: 3*x- or 2*(x- --^)",
  "step.silence": () => "A step of silence is -. Repeat internal silence with 8*-; trailing silence is automatic",
  "step.lengths": () =>
    "Kit lines use step words, not lengths: repeat with 4*x- or fill the block with ...x-",
  "step.beatList": () => "Kit lines use step words, not beat lists: draw the hits with x and -",
  "step.repeatCount": () => "A repeat count is an integer of at least 2: 2*x- or 3*(x- --^)",
  "step.nested": () => "Step repeats are nested too deeply",
  "step.repeatUnclosed": () => "A step repeat's ( is missing its )",
  "step.repeatEmpty": () => "A step repeat's parentheses need at least one word",
  "step.repeatStray": () => "This ) doesn't close a step repeat",
  "step.parens": () => "Parentheses in steps need a repeat count: 2*(x- --^)",
  "step.tooLong": ({ max }: { max: number }) => `A step sequence can be at most ${max} bars long`,
  "step.euclidFew": ({ euclid }: { euclid: string }) =>
    `${euclid} needs at least as many steps as hits`,
  "step.euclidMany": ({ euclid }: { euclid: string }) =>
    `${euclid} is more than 64 steps. Spread the hits over fewer`,
  "step.afterFill": () => "... is the rest of the block, so nothing goes after its word",
  "step.spaceBetween": () => "Put a space between step words and repeats: x- 2*(-- ^-)",
  "step.commas": () => "Kit lines separate step words with spaces, not commas: x- --^ ...-",
  "step.needsWords": () => "A kit line needs step words: x- --^",
  "step.repeats": ({ head, value, short }: { head: string; value: string; short: string }) =>
    `${head}${value} repeats ${short}. Write ${head}${short}: a pattern repeats it. ` +
    "Use a block to play an explicit finite sequence once",

  // A block of steps and its layers
  "block.layersOpen": () =>
    "Every layer here ends in ..., so nothing says how long the block is. One layer needs a length of its own",
  "step.layerRuns": ({ hits, length }: { hits: string; length: string }) =>
    `This layer's hits run ${hits} before its ..., and the block is only ${length} long`,
  "step.layerInstrument": ({ text }: { text: string }) =>
    `A block of steps holds step layers separated by commas, like --x-, ----^-. ${text} is an instrument's line, which goes in a pattern`,
  "step.withInLayers": () =>
    "A with holds lines that play, so it goes around a drum's line, not among its steps",
  "fill.insideRepeat": () =>
    "... fills the containing block, so it cannot go inside a bounded repeat",
} as const
