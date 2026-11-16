/* What the engine says about a line that isn't one: a placement (on bar), a pace (every),
   and a line that starts like something it isn't. */

export const LINE_MESSAGES = {
  // on bar
  "place.follows": () => "Placement follows its value: block { crash: x } on bar 2",
  "place.needsBars": () =>
    "on bar takes a bar number or range: fill on bar 2, or fill on bar 3 to 4",
  "place.range": ({ max }: { max: number }) =>
    `Bars are counted from 1, up to ${max}: bar 1, bar 2`,
  "place.backwards": ({ from, until }: { from: number; until: number }) =>
    `bar ${from} to ${until} runs backwards. The first bar comes first`,
  "place.ends": () => "Placement ends the value: fill on bar 2, or fill on bar 3 to 4",
  "place.needsValue": () => "Put what plays before on bar: block { crash: x } on bar 2",
  "place.barsAlone": () =>
    "bars is a length, and goes after a number: 6 bars groove. Placement follows its value: fill on bar 3 to 4",

  // every
  "pace.beats": () => "every sets a step's length in beats: every 1/2 beats { kick: x }",
  "pace.needsValue": ({ shown }: { shown: string }) =>
    `${shown} needs what plays at that pace: ${shown} { ... }`,
  "pace.typed": ({ shown }: { shown: string }) =>
    `What plays at a pace is a pattern, so its braces take no type: ${shown} { ... }`,
  "pace.sameStep": ({ shown }: { shown: string }) =>
    `${shown} repeats the current step length. Leave out this every`,
  "pace.cantLast": ({ length }: { length: string }) =>
    `A step can't last ${length}. Try every 1/2 beats or every 1/3 beats`,

  // A line that starts like something it isn't
  "line.shapes": () =>
    "Each line is a setting (set tempo 90), a name with its type (chords verse = Am F, " +
    "pattern groove = { ... }), play, or inside braces an instrument and what it plays " +
    "(kick: x--x---, guitar: notes F---G---) or patterns to play (intro verse)",
  "line.barLine": () =>
    "A line that starts with | continues the line above it, and there's no line above to continue",
  "line.soundStartsWithSet": ({ name, sound }: { name: string; sound: string }) =>
    `${name} ${sound} is a setting, so it starts with set: set ${name} ${sound}`,
  "line.startsWithSet": ({ name, value }: { name: string; value: string }) =>
    `${name} is a setting, so it starts with set: set ${name} ${value}`,
  "line.needsColon": ({ first, after }: { first: string; after: string }) =>
    `Put a colon after ${first}: ${first}: ${after}`,
  "line.chordsOnInstrument": ({ text }: { text: string }) =>
    `Chords go on an instrument's line: piano: ${text}`,
  "line.notesOnInstrument": ({ notes }: { notes: string }) =>
    `Notes go on an instrument's line: guitar: notes ${notes}`,
  "line.chordsExample": ({ text }: { text: string }) =>
    `Chords go on an instrument's line, e.g. piano: chords ${text}`,
  "line.notesExample": ({ notes }: { notes: string }) =>
    `Notes go on an instrument's line, e.g. guitar: notes ${notes}`,
  "line.lengthLike": () =>
    "Write the length like this: pattern groove = 3 bars {, or play groove for 3 bars",
  "line.settingNotInstrument": ({ name, value }: { name: string; value: string }) =>
    `${name} is a setting, not an instrument, so it takes no colon: set ${name} ${value}`,
  "line.needsAfterColon": ({ name }: { name: string }) =>
    `${name}: needs something after the colon`,
} as const
