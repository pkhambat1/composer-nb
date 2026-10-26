---
name: write-cells
description: Write music as composer-nb cells that parse clean and come back as a link that plays. Use whenever the user wants drums, a riff, a bass line, a melody, a chord chart, a scale or an exercise they can hear, read as sheet music or take into a DAW as MIDI, or asks to write, fix or change a composer-nb cell.
---

# Write cells

The composer-nb connector sends its language guide when it connects, and its `reference` tool has every rule, page by page. Read the page before writing something you haven't written before. This skill is the workflow and the standard a cell is held to.

If the `parse` tool isn't there, the connector isn't connected: in claude.ai or Claude Desktop, open the plugin from Customize > Plugins and connect it on its Connectors tab. Don't hand over a cell that hasn't parsed.

## Workflow

1. Write the cell.
2. Call `parse`. If it reports errors, fix them and call `parse` again, until it reports none.
3. Read the grid it returns against what was asked: the hits on the right steps, the bar count, the chords it heard.
4. Call `link` and give the link. Call `render` when the user wants the sheet music or a MIDI file.

A cell that uses the settings or names of earlier cells is parsed with their source in `after`. For several cells, call `link` with `cells`: one notebook, with text cells between the music.

In claude.ai and Claude Desktop, `parse` and `link` draw the cell under the reply, where the user can change it and play it again, so don't describe what it already shows. A cell the user changed there comes back with their next message: build on that version.

## The standard

- Every cell makes musical sense on its own: one idea, with names that say what each part is.
- No figure written twice. A pattern repeats its lines, so `hat: x-`, not `hat: x-x- x-x-`. The parser rejects the repeat.
- Scales, lines and chord formulas by degree (`1 2 b3 4 5 b6 b7`) and charts by numeral, so they play in any key. Letters only where the note names are the point.
- A note held over two beats gets a stated length, `3 beats C2` or `1 bars rest`, not a long run of dashes.
- Brackets for order: `play (intro 4 bars verse)`.
- `set` in front of every setting.
- A long line continues on a line starting with `|`.
- Chord symbols and numerals spelt as `reference` (topic `chords`) spells them.
- One space after a colon, and no columns lined up with extra spaces.

Don't write out published melodies or lyrics. Write an original line in the style asked for, or start from a groove in `library`.

## Example

A dorian groove: a named bass line in degrees, a chart by numeral continued on a `|` line, the bass and piano each in its own octave, and the parts in order in brackets.

```composer-nb
set tempo 96
set key D dorian

notes riff = 3 beats 1, b3-4-|5---b7---6---4---

pattern groove = {
  hat: x-
  snare: ---- x---
  kick: x--- --x- x--- ----
}

pattern verse = {
  groove
  set octave 2
  bass: riff
  set octave 4
  piano: chords i|IV|i|bVII
  | i|IV|bVII|IV
}

play (2 bars groove 8 bars verse)
```
