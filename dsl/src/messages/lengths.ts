/* What the engine says about lengths: how a length is written, and whether what repeats
   fits what it's in. */

export const LENGTH_MESSAGES = {
  // A length as written
  "length.range": ({ max }: { max: number }) =>
    `A length is a number of bars up to ${max}, e.g. 3 bars`,
  "length.plural": ({ number, unit }: { number: string; unit: string }) =>
    `Lengths are always plural, whatever the number: ${number} ${unit}s`,

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
  "fit.ownPace": ({
    what,
    which,
    value,
  }: {
    what: string
    which: string
    value: string | number
  }) =>
    `${what} changes the ${which}, so it can't sound together with other lines. ` +
    `Play it on its own, or put the with around the whole play: with ${which} ${value} { play ... }`,
  "fit.openEnded": ({ where, sized }: { where: string; sized: string | undefined }) =>
    `Every line ${where} ends in ..., so nothing says how long it is. Say so: ${sized}`,
  "fit.tooShort": ({ bars }: { bars: string }) =>
    `${bars} bars is shorter than the shortest note, so nothing fits in it`,
  "fit.tooLong": ({
    where,
    max,
    sized,
  }: {
    where: string
    max: number
    sized: string | undefined
  }) =>
    `What's ${where} only lines up again after more than ${max} bars. Say how long it is: ${sized}`,
  "fit.layersTooLong": ({ max }: { max: number }) =>
    `This block's layers only line up again after more than ${max} bars`,
  "fit.noBar": ({ what, length, bar }: { what: string; length: string; bar: number }) =>
    `${what} is ${length} long, so it has no bar ${bar}`,
  "fit.openRuns": ({
    what,
    length,
    part,
    hits,
  }: {
    what: string
    length: string
    part: string
    hits: string
  }) => `${what} is ${length} long, and the ${part} line's hits run ${hits} before its ...`,
} as const
