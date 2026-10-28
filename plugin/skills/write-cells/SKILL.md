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
- Scales, lines and chord formulas by degree (`1 2 3 4 5 6 7`) and charts by numeral, so they play in any key. In a mode, write the plain degrees and numerals and let `set mode` make them minor, dorian and so on: no `b` or `#` for what the mode already does. Letters only where the note names are the point.
- A note held over two beats gets a stated length, `3 beats C2` or `1 bars rest`, not a long run of dashes.
- Brackets for order: `play (intro 4 bars verse)`.
- `set` in front of every setting.
- A long line continues on a line starting with `|`.
- Chord symbols and numerals spelt as `reference` (topic `chords`) spells them.
- One space after a colon, and no columns lined up with extra spaces.

Don't write out published melodies or lyrics. Write an original line in the style asked for, or start from a groove in `library`.

## Example

A walk through D dorian: the scale up and back down as a named line of degrees, continued on a `|` line, a chord by numeral under every second beat, the bass and the tune each in its own octave, and the parts in order in brackets.

```composer-nb
set tempo 96
set key D
set mode dorian

notes scale = 1---2---3---4---|5---6---7---1'---
  |1'---7---6---5---|4---3---2-------|1 bars 1
notes roots = 1-------3-------|5-------7-------
  |1'-------6-------|4-------2-------|1 bars 1

pattern groove = {
  hat: x-
  snare: ---- x---
  kick: x--- --x- x--- ----
}

pattern walk = {
  groove
  with octave 4 { piano: scale }
  with octave 2 { bass: roots }
  guitar: chords i III|v VII|i vidim|IV ii|i
}

play (2 bars groove walk)
```
