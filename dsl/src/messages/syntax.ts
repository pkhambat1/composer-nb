/* What the engine says about how a cell is put together: braces, commas, brackets, play,
   print and with. */

export const SYNTAX_MESSAGES = {
  // Braces and the commas between entries
  "syntax.retiredOf": () =>
    '"of" expressions are no longer supported. Use interval functions such as fifth(5) or third(1); they follow the active scale',
  "brace.stray": () => "This } doesn't close anything",
  "brace.unclosed": ({ what }: { what: string }) => `${what} needs a } to close it`,
  "brace.empty": () => "These braces have nothing in them",
  "brace.topOnly": ({ kind }: { kind: string }) => `${kind} goes at the top, not inside braces`,
  "brace.trailing": () => "Nothing can follow a }",
  "brace.untyped": () =>
    "These braces need a type: pattern { ... } repeats, block { ... } plays once",
  "separator.semicolon": () =>
    "Use commas between entries in braces instead of semicolons; a trailing comma is allowed",
  "separator.empty": () => "A comma needs an entry before it; only the final comma may go before }",
  "separator.top": () => "Outside braces, put each statement on its own line",
  "separator.missing": () => "Put a comma between entries in braces",

  // A line of patterns, and the brackets that group them
  "group.multiply": ({ said }: { said: string }) =>
    `* only multiplies numbers. To repeat, put a length in front: 4 bars ${said}`,
  "group.lengthOf": ({ written }: { written: string }) =>
    `${written} of what? Put a pattern or its name after it`,
  "group.needsBars": ({ tok }: { tok: string }) =>
    `"${tok}" needs bars after it, e.g. 3 bars groove`,
  "group.notHere": ({ tok }: { tok: string }) =>
    `"${tok}" doesn't belong here. A line plays a pattern's name, a block, or ( ) ` +
    "with what plays in order in it, and a length can go in front: 4 bars groove",
  "group.unclosed": () => "A ( is missing its )",
  "group.empty": () => "These brackets have nothing in them",
  "group.stray": () => "This ) doesn't close anything",
  "group.inOrder": ({ written }: { written: string }) =>
    `What plays in order goes in brackets: (${written})`,

  // with and its header
  "with.help": () =>
    "with takes the settings its block plays with, then the block: with octave 2 { ... }",
  "with.comma": () => "A comma goes between two settings: with key E, mode minor { ... }",
  "with.noSet": ({ fixed }: { fixed: string }) =>
    `A with's settings have no set in front: with ${fixed} { ... }`,
  "with.needsComma": ({ fixed }: { fixed: string }) =>
    `Settings in a with are separated by commas: with ${fixed} { ... }`,
  "with.twice": ({ name }: { name: string }) =>
    `${name} is in this with twice. A with sets each setting once`,
  "with.settingInBlock": ({ name, value }: { name: string; value: string }) =>
    `Inside a block, settings go on a with: with ${name} ${value} { ... }`,
  "with.sharedPace": ({ name, value }: { name: string; value: string }) =>
    `The lines of a play or a pattern play together, so they share one ${name}. Put the with around the whole play, ` +
    `with ${name} ${value} { play ... }, or on a part that plays in order: ( with ${name} ${value} { ... } )`,

  // play
  "play.untyped": () =>
    "These braces need a type: play pattern { ... } repeats, play block { ... } plays once",
  "play.noEquals": () => "play is a keyword, not a name, so it takes no =: play groove",
  "play.noColon": () => "play is a keyword, not an instrument, so it takes no colon: play groove",
  "play.durationAfter": () => "A play's duration follows its music: play groove for 2 bars",
  "play.needsMusic": () => "play needs music before for: play groove for 2 bars",
  "play.needsSomething": () => "play needs something after it: play groove, or play block { ... }",
  "play.emptyBraces": () => "This play has nothing in its braces",
  "play.inOrder": ({ kind, tail }: { kind: string; tail: string }) =>
    `What plays in order goes in brackets: play (${kind} { ... } ${tail})`,
  "play.lengthAfter": ({ kind, bars }: { kind: string; bars: string }) =>
    `Write the length like this: play ${kind} { ... } for ${bars} bars`,
  "play.tooLong": () => "This plays for over 10 minutes. Use a shorter length",
  "play.nothingPlays": ({ kind, size }: { kind: string; size: string }) =>
    `Nothing plays this. Write play ${kind} { ... }${size}`,
  "play.nothingPlaysEvery": ({ shown }: { shown: string }) =>
    `Nothing plays this. Put play in front, or give it a name: pattern slow = ${shown}`,
  "play.placeOutside": ({ shown }: { shown: string }) =>
    `${shown} goes inside a pattern or a play, to say where in it`,
  "play.instrumentLine": ({ text }: { text: string }) =>
    `An instrument's line goes inside braces: in a pattern, or play block { ${text} }`,
  "play.lineNothing": ({ text }: { text: string }) => `Nothing plays this line. Write play ${text}`,
  "play.transposeDrums": () =>
    "transpose moves notes and chords, and only drums play here. Give an instrument some: piano: chords C G",

  // print
  "print.noBraces": () => "print takes musical values, without braces",
  "print.needsValue": () => "print needs a value after its type",
  "print.notMusical": () =>
    "print inspects notes, chords and steps; give it a musical value from the block",
  "print.mixedTypes": () =>
    "These values have different types. Give print separate arguments: print(melody, harmony)",
  "print.finite": () => "print needs a finite value; ... needs a containing block",
  "print.needsMusical": () => "print needs a musical value",
  "print.parens": () => "print takes parentheses: print(1, 2, 3)",
  "print.unclosed": () => "print(...) is missing its closing )",
  "print.trailing": () => "Nothing follows print(...); put the next statement on its own line",
  "print.emptyArgument": () => "print needs a value for each argument: print(1, 2, 3)",
} as const
