/* What the assistant is told when it connects: how to write a cell, in one screen. It is
   the language reference boiled down, so a model writes a cell that parses the first time,
   and knows to check it with `parse` before handing it over. */

export const INSTRUCTIONS = `composer-nb is a small, typed language for music: drums, notes and chords, written as text cells. Call parse on every cell before you show it to anyone: it returns the errors with line numbers (a cell with errors plays nothing), what is set and named, and a grid of every hit. Fix the errors and parse again. Then link gives a link that opens the playground on the cell, ready to play, with practice controls; render draws the sheet music or writes a MIDI file; library finds a groove to start from; reference has the full rules.

HOW A CELL READS. Every line says what it is:
  tempo 90                  a setting: a reserved word and its value, no = (time, tempo, swing, key, capo, octave, kit)
  steps pair = ^-x-         a name, its type in front, = its value. Types: steps, sticking, notes, chords, pattern
  kick: x--x---             inside braces: a kit piece or instrument, a colon, what it plays
  play { ... }              plays what follows it. Nothing sounds outside a play
  // a comment
Blank lines and indentation mean nothing. Settings and names carry on into later cells (pass earlier cells as after).

SETTINGS  time 7 over 8 (never 7/8: / divides) · tempo 20 to 400 · swing 50 (straight) to 75, 67 is a triplet feel · key C, Am, Bb, F#m, or a mode: D dorian, G mixolydian · capo 0 to 12 (moves a guitar's chords) · octave 1 to 6, default 3 · kit rock or synth · guitar.electric muted (its sound from there on)

KIT PIECES, one line each: kick, snare, snare.ghost (the snare's ghost notes), snare.rim (rimshot), snare.cross (cross-stick), hat (closed hi-hat), hat.open, hat.pedal (the foot), ride, ride.bell, crash, tom.high, tom.low, tom.floor.
INSTRUMENTS: piano, piano.electric, organ, pad, bass, guitar, guitar.electric.

STEPS, what a kit piece plays: one character per step, a step is a 16th note. x hit, ^ accent, ~ ghost (on the snare, write it as x on snare.ghost), d double stroke, - nothing. Spaces are ignored, so group by beat: hat: x-x- x-x- x-x- x-x-. A 4 over 4 bar is 16 steps, 7 over 8 is 14, 3 over 4 is 12. | may mark where a bar ends.
  Or beats, one bar's hits counted 1 e & a: snare: 2 4 · kick: 1 3 3& · snare: 2e ^4 (^ ~ d in front say how the beat is hit). A line is beats or steps, never both.
  Parts and lengths: commas separate a line's parts, and a length in front fills one: snare: 2 beats rest, dd, 1 beats rest · hat: 2 beats x-, 2 beats rest. ...rest or ...x- is the rest of the block. Lengths are always plural: 1 bars, 1 beats.
  3 in 8 spreads 3 hits over 8 steps as evenly as they go (x--x--x-). sticking: RLRR LRLL names the hand on each step (R, L, - for none), on the hands' hits.
  A block on a kit piece's line holds layers, one a line, which repeat until they line up; the lower layer wins a step: snare.ghost: { --x- / ------------ddd- } written on separate lines.

NOTES, what an instrument plays, drawn on the same steps: guitar: E---F# E-E-- . A note is A to G, then # or b, then an octave when it needs one (E2, C4 is middle C); without a number it is in octave. - lets the note ring, _ stops it, and a space goes between two notes that would touch (F# E, never F#E). ^ or ~ in front accents or softens. A line plays one note at a time; for notes together give the instrument a block of layers:
  piano: {
    chords Am F|C G
    E5-------C5-------|E5---D5---C5---B4---
  }
CHORDS: the word chords, then bars: piano: chords Am F|C G. The chords in a bar split it evenly (Am - F G is four slots); - holds, _ is silence, % repeats the bar before. Symbols: C, Am, F#m, Bb7, Cmaj7, G7sus4, Em7b5, Cadd9, C/E. Roman numerals are degrees of the key's scale, uppercase major and lowercase minor: I vi IV V7, ii7, viidim, viim7b5 (a quality follows the numeral as it follows a chord's root); in Am or D dorian the seventh degree is VII (G, C), and bVII lowers it again. In a mode the numerals are the mode's own degrees: D dorian i IV is Dm G. Guitars play real fretboard shapes.

PATTERNS: pattern groove = { lines }. The lines start together and every line repeats until the pattern ends, which is when they all line up again (lines of 4 and 6 steps meet after 12), or a length in front: pattern groove = 4 bars { ... }. Whatever repeats must fit a whole number of times; otherwise the error names the shortest length that works.
  bar 2 { ... } inside a pattern or play: what plays in bar 2 only, every time through. It adds and overrides, never removes. bar 3 to 4 { ... } covers a run. One line needs no braces: bar 2 hat.pedal: 4.
  every 3 steps { ... } or every 1/3 beats { ... } (triplets) says how long a step lasts inside it. every 2 steps is eighth notes.
  A pattern's name on a line inside another pattern plays it there, under the lines beside it. Names in a row play one after another: play intro verse verse chorus. A length in front repeats: play 8 bars (verse chorus). A block without a name goes anywhere a name does, joined to its neighbours by then: play intro then { snare: xxxx } then outro. Two blocks on lines of their own play together; } then { plays them in order, and } { is an error.
PLAY: play groove · play 4 bars groove · play guitar: chords Am F|C G · play { crash: 1 / groove } on separate lines: a play's own lines play once and a pattern on a line of its own repeats to fill it. Without a length a play lasts as long as its longest line. Each play is one output; several play one after another.

COMMON MISTAKES: piano: Am F (chords is missing in front) · time 7/8 · a kit piece's line at the top level (it goes inside play { } or a pattern) · snare: ~x (ghost notes go on snare.ghost: x) · F#E (a space between notes) · 1 bar (lengths are plural: 1 bars) · hat.close (hat is the closed one) · a 6-step line in a pattern whose other lines are 16 (it must fit; the error says where they line up) · play inside braces (play goes at the top) · a name used above its line · } { (two blocks in order take then: } then {).

A GOOD FIRST CELL:
tempo 100

pattern beat = {
  hat: x-x- x-x- x-x- x-x-
  snare: ---- x--- ---- x---
  kick: x--- --x- x--- ----
}

play 2 bars {
  crash: 1
  beat
}`
