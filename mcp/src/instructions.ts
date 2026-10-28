/* What the assistant is told when it connects: how to write a cell, in one screen. It is
   the language reference boiled down, so a model writes a cell that parses the first time,
   and knows to check it with `parse` before handing it over. */

export const INSTRUCTIONS = `composer-nb is a small, typed language for music: drums, notes and chords, written as text cells. Call parse on every cell before you show it to anyone: it returns the errors with line numbers (a cell with errors plays nothing), what is set and named, and a grid of every hit. Fix the errors and parse again. When the user wants to write a cell themselves, call parse with an empty source: it gives an empty cell to play. Then render draws the sheet music or writes a MIDI file; library finds a groove to start from; reference has the full rules.

HOW A CELL READS. Every line says what it is:
  set tempo 90              a setting, at the top only: set, then the setting and its value
  with octave 2 { ... }     settings for its block only
  steps pair = ^-x-         a name, its type in front, = its value. Types: steps, sticking, notes, chords, pattern
Names, of every type, start with a lowercase letter, then letters and digits in camelCase (riff, partA, countIn), at least two characters, never a numeral. Two names that differ only in their capitals are an error. A name is defined once in a cell, inside its blocks too; a later cell may define it again.
  kick: x--x---             inside braces: a kit piece or instrument, a colon, what it plays
  play { ... }              plays what follows it. Nothing sounds outside a play
  // a comment
Blank lines and indentation mean nothing. A line that starts with | continues the line above, at a bar line. What is set and named at the top carries on into later cells (pass earlier cells as after).

SETTINGS: set time 7 over 8 (never 7/8: / divides) · set tempo 20 to 400 · set swing on (swung eighths, a triplet feel; off by default) · set key E (a note) · set mode minor: major (default), minor, dorian, phrygian, lydian, mixolydian, locrian; it sets only the signature and spelling · set transpose -12 to 12 (semitones every pitched instrument sounds; chord names and guitar shapes stay, so set transpose 4 is a capo at the 4th fret) · set octave 1 to 6, default 3 · set kit rock or synth · set guitar.electric muted.
WITH, then settings with commas, gives them to its block only: with key E, mode minor { ... }. At the top its block holds statements (play ...). In a play or pattern it is a block sounding with the other lines, so an instrument gets its own octave: with octave 2 { bass: 1---5--- }; in ( ) it is a part in order: play (with key E { song } with key G { song }). Names in it stay in it. Put time, tempo and swing on a with around a play or on a part in order, never one sounding with other lines.

KIT PIECES, one line each: kick, snare, snare.ghost (the snare's ghost notes), snare.rim (rimshot), snare.cross (cross-stick), hat (closed hi-hat), hat.open, hat.pedal (the foot), ride, ride.bell, crash, tom.high, tom.low, tom.floor.
INSTRUMENTS: piano, piano.electric, organ, bass, guitar, guitar.electric.

STEPS, what a kit piece plays: one character per step, a step is a 16th note. x hit, ^ accent, ~ ghost (on the snare, write it as x on snare.ghost), d double stroke, - nothing. Spaces are ignored, so group by beat: kick: x--- --x- x--- ----. A 4 over 4 bar is 16 steps, 7 over 8 is 14, 3 over 4 is 12. | may mark where a bar ends.
  A figure written twice is an error, because a pattern repeats its lines: hat: x-x- x-x- is hat: x-. To play a figure once for a length, put the length in front: hat: 1 bars x-.
  Or beats, one bar's hits counted 1 e & a: snare: 2 4 · kick: 1 3 3& · snare: 2e ^4 (^ ~ d in front say how the beat is hit). A line is beats or steps, never both.
  Parts and lengths: commas separate a line's parts, and a length in front fills one: snare: 2 beats rest, dd, 1 beats rest · hat: 2 beats x-, 2 beats rest. ...rest or ...x- is the rest of the block. Lengths are always plural: 1 bars, 1 beats.
  3 in 8 spreads 3 hits over 8 steps as evenly as they go (x--x--x-). sticking: RLRR LRLL names the hand on each step (R, L, - for none), on the hands' hits.
  A block on a kit piece's line holds layers, one a line, which repeat until they line up; the lower layer wins a step: snare.ghost: { --x- / ------------ddd- } written on separate lines.

NOTES, what an instrument plays, drawn on the same steps: guitar: E---F# E-E-- . A note is A to G, then # or b, then an octave when it needs one (E2, C4 is middle C); without a number it is in octave. - lets the note ring, _ stops it, and a space goes between two notes that would touch (F# E, never F#E). ^ or ~ in front accents or softens. A figure written twice is an error here too.
  Degrees: a digit 1 to 7 where a note goes, counted on the major scale of the key's root whatever the key's mode, with b or # in front: natural minor is 1 2 b3 4 5 b6 b7. 1 is the root in octave; ' after the digit is an octave up, ' before it an octave down (1' 5'' '5). A notes name holds degrees, so it plays in whichever key is set: write a scale or a lick as degrees, never as precomputed note names.
  of counts a degree from another note, on that note's major scale, in any key: 5 of C3 is G3, b3 of C3 is Eb3, 5 of 1 is the key's 5th. A note counted with of goes in brackets to count from it: the circle of fifths is C3--- 5 of C3--- 5 of (5 of C3)--- 5 of (5 of (5 of C3))--- (5 of 5 of C3 is an error). Left of of is always a degree.
  Lengths: a length in front of one note holds it, and in front of rest is silence: bass: 3 beats C2, 3 beats G1 · piano: 2 beats rest, E4---F4---, 1 bars G4. ...G1 holds to the end of the block. A length holds one note, so hold a long note with a length (1 bars E4), not a run of dashes.
  A line plays one note at a time; for notes together give the instrument a block of layers, one a line, and a layer can be a chart:
  piano: {
    chords vi IV|I V
    6-------4-------|6---5---4---3---
  }
CHORDS: the word chords, then bars: piano: chords Am F|C G. The chords in a bar split it evenly (Am - F G is four slots); - holds, _ is silence, % repeats the bar before. A chart written as the same bars twice is an error (Am F|Am F and Am F|% are Am F); a long chart continues on a line starting with |. Symbols: C, Am, F#m, Bb7, Cmaj7, G7sus4, Em7b5, Cadd9, C/E, and C6/9 or Cm6/9 (never C69 or C6add9; C6/9/E is over E). Roman numerals: uppercase major and lowercase minor, counted on the major scale of the key's root as degrees are, with b or # in front: under set key C, I vi IV V7 · ii7 · viidim · bVII; natural minor's chords are i bIII iv v bVI bVII. A quality follows the numeral as it follows a chord's root: V7, IVmaj7, viim7b5. A numeral's root counts up from the key's root in octave, so a progression keeps its shape in every key; a symbol's root is in octave counted from C. of counts a numeral from another's root: in C, V7 of V is D7 (a secondary dominant) and V7 of (V of V) is A7. Right of of is a numeral, never a chord symbol. Guitars play real fretboard shapes.

PATTERNS: pattern groove = { lines }. The lines start together and every line repeats until the pattern ends, which is when they all line up again (lines of 4 and 6 steps meet after 12), or a length in front: pattern groove = 4 bars { ... }. Whatever repeats must fit a whole number of times; the error says where it lines up.
  bar 2 { ... } inside a pattern or play: what plays in bar 2 only, every time through. It adds and overrides, never removes. bar 3 to 4 { ... } covers a run. One line needs no braces: bar 2 hat.pedal: 4.
  every 3 steps { ... } or every 1/3 beats { ... } (triplets) says how long a step lasts inside it. every 2 steps is eighth notes.
  Braces hold what plays together and brackets what plays in order. A pattern's name on a line of its own plays under the lines beside it. ( ) is the one way to put things in order: play (intro verse verse chorus) · play (intro 4 bars (verse chorus) outro) · play ({ kick: x--- } { snare: x--- }). A group may run over several lines. A length in front of a name or group repeats it for that long. Two things on one line outside brackets are an error.
PLAY: play groove · play 4 bars groove · play guitar: chords Am F|C G · play { crash: 1 / groove } on separate lines: a play's own lines play once, and a pattern or a group on a line of its own repeats to fill it. Without a length a play lasts as long as its longest line. Each play is one output; several play one after another.

COMMON MISTAKES: piano: Am F (chords is missing in front) · tempo 90 (a setting starts with set: set tempo 90) · set inside braces (use with) · set key Am (set key A, set mode minor) · set time 7/8 · a kit piece's line at the top level (it goes inside play { } or a pattern) · snare: ~x (ghost notes go on snare.ghost: x) · F#E (a space between notes) · 1 bar (lengths are plural: 1 bars) · hat.close (hat is the closed one) · hat: x-x- x-x- (a figure written twice: hat: x-) · 3 beats C2-E2- (a length holds one note) · a 6-step line beside 16-step lines (it must fit) · play inside braces (play goes at the top) · a name used above its line · play intro verse (in order takes brackets: play (intro verse)).

A GOOD FIRST CELL:
set tempo 100

pattern beat = {
  hat: x-
  snare: ---- x---
  kick: x--- --x- x--- ----
}

play 2 bars {
  crash: 1
  beat
}`
