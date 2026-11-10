---
name: write-cells
description: Write music as composer-nb cells that parse clean and play. Use whenever the user wants drums, a riff, a bass line, a melody, a chord chart, a scale or an exercise they can hear, read as sheet music or take into a DAW as MIDI, or asks to write, fix or change a composer-nb cell, or wants an empty cell to write in themselves.
---

# Write cells

The composer-nb connector sends its language guide when it connects, and its `reference` tool has every rule, page by page. Read the page before writing something you haven't written before. This skill is the workflow and the standard a cell is held to.

If the `parse` tool isn't there, the connector isn't connected: in claude.ai or Claude Desktop, open the plugin from Customize > Plugins and connect it on its Connectors tab. Don't hand over a cell that hasn't parsed.

## Workflow

1. Write the cell.
2. Call `parse`. If it reports errors, fix them and call `parse` again, until it reports none.
3. Read the grid it returns against what was asked: the hits on the right steps, the bar count, the chords it heard.
4. Give the cell in a `composer-nb` code block. Call `render` when the user wants the sheet music or a MIDI file.

A cell that uses the settings or names of earlier cells is parsed with their source in `after`. For several cells, parse each in turn with the ones before it as `after`, and give them in order with a line of text before each.

In claude.ai and Claude Desktop, `parse` draws the cell under the reply, where the user can change it and play it again, so don't describe what it already shows. A cell the user changed there comes back with their next message: build on that version.

When the user wants to write the cell themselves ("give me a cell", "I'll write it"), call `parse` with an empty source and don't fill it in. They get an empty cell to type in and play.

## The standard

- Every cell makes musical sense on its own: one idea, with names that say what each part is.
- No figure written twice. A pattern repeats its lines, so `hat: x-`, not `hat: x-x- x-x-`. The parser rejects the repeat.
- Scales, lines and chord formulas by degree (`1 2 3 4 5 6 7`) and charts by numeric degree, so they play in any key. In a mode, write the plain degrees and numerals and let `set mode` make them minor, dorian, harmonicMinor, melodicMinor, wholeTone (six degrees per octave, with 7 the next tonic) and so on: no `b` or `#` for what the mode already does. Letters only where the note names are the point.
- Hold long notes with repeated sustain steps: `C2 11*-` lasts three beats on the default grid. `8*_` is two beats of silence. `8*C2` repeats the attack eight times; it does not hold one note.
- Brackets for order: `play (intro 4 bars verse)`.
- Braces that are a value say their type: `pattern { ... }` repeats and `block { ... }` plays once. So `play block { ... }` plays its lines once, `play pattern { ... }` repeats them, and a bare `play { ... }` is an error.
- Separate entries inside every brace block with `,`, on one line or many. A trailing comma before `}` is allowed; semicolons are errors. Note words use spaces: `piano: notes 1 7*- 3 7*-,`. Newlines inside braces are layout.
- Notes use `n*word` and `n*(words)`, including named phrases and interval functions. A final `...note` holds that note, `...-` sustains the preceding note, and `..._` fills with silence. Do not use duration clauses, `rest`, or commas between note words.
- Kit lines use step words, `n*w`, `n*(words)` and a final `...w`. `-` is the only silence: `8*- dd ...-`. Do not use kit beat lists, lengths, `rest` or commas.
- Position a value with `lift on bar 2` or `block { ... } on bar 3 to 4`; it adds without silencing other lines. Use typed braces for an inline value.
- `every` takes beats only (`every 1/2 beats`). Setting the current step again is an error.
- `set` in front of every setting.
- A long line continues on a line starting with `|`.
- Use signed nonzero numeric degrees for notes and chords; all consecutive digits belong to the root degree, so 8 and 15 continue into higher octaves and seventh chords use 1maj7, 2m7 or 5dom7. Negative degrees count downward from the tonic: in C major -1 is B below C, -2 is A, and -7 is the lower C; wholeTone reaches its lower tonic at -6. Separate negative note words with spaces (-1--- -2---); dashes inside 1---2--- still sustain. Interval functions such as fifth(phrase) move every tone through the active scale or mode; fifth(phrase, 2) repeats the move twice. Use interval functions for relative movement; the `of` operator is not supported. Suffixes compose: 1sus2add11#5/4 uses degree 4 of the key as bass.
- Chord symbols and numeric degrees spelt as `reference` (topic `chords`) spells them. A name holding one chord fills a slot just like its literal; interval functions do not add bars around it. Use `|` for a bar boundary. Names holding several chords or explicit bar lines remain complete charts when joined.
- One space after a colon, and no columns lined up with extra spaces.

Don't write out published melodies or lyrics. Write an original line in the style asked for, or start from a groove in `library`.

## Example

A walk through D dorian: the scale up and back down as a named line of degrees, continued on a `|` line, a chord by numeric degree under every second beat, the bass and the tune each in its own octave, and the parts in order in brackets.

```composer-nb
set tempo 96
set key D
set mode dorian

notes scale = 1---2---3---4---|5---6---7---octave(1)---
  |octave(1)---7---6---5---|4---3---2-------|1 15*-
notes roots = 1-------3-------|5-------7-------
  |octave(1)-------6-------|4-------2-------|1 15*-

pattern groove = {
  hat: x-,
  snare: ---- x---,
  kick: x--- --x- x--- ----,
}

pattern walk = {
  groove,
  with octave 4 { piano: notes scale, },
  with octave 2 { bass: notes roots, },
  guitar: chords 1 3|5 7|1 6|4 2|1,
}

play (2 bars groove walk)
```
