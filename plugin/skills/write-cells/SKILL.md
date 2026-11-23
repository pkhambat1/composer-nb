---
name: write-cells
description: Write music as composer-nb cells that parse clean and play. Use for music requests stated only as a mood or style, or whenever the user wants drums, a riff, a bass line, a melody, a chord chart, a scale or an exercise they can hear, read as sheet music or take into a DAW as MIDI, or asks to write, fix or change a composer-nb cell, or wants an empty cell to write in themselves.
---

# Write cells

A request to make music means saving a playable cell with the notebook tools. Returning a code block alone does not complete it. Respect an explicit preview-only or no-save request.

Treat omitted musical details as creative choices. Use the user's mood, style and relevant notebook context to choose a key, mode, tempo, meter, instruments and a useful length. State the idea briefly, then make and save it without asking the user to choose or approve routine settings. When extending a piece, keep its established settings unless the request calls for a change. Ask only when the available context cannot resolve a blocker, such as which existing cell to edit.

The connector supplies the language guide; `reference` has the full rules. Read the relevant page for unfamiliar syntax.

If the `parse` tool isn't there, the connector isn't connected: in claude.ai or Claude Desktop, open the plugin from Customize > Plugins and connect it on its Connectors tab. Don't hand over a cell that hasn't been checked, by a save or by `parse`.

## Saved notebook workflow

The hosted plugin requires a linked Composer.nb account for every tool. Let the
host display its OAuth flow; never ask for passwords or tokens in chat.

1. Use the notebook in the notebook context, or find the one the user names with
   `list_notebooks`. If neither, create a descriptively named notebook. Never
   choose an arbitrary existing notebook.
2. Say the destination in a line: “I'll add a new groove cell to **Rhythm
   sketches**,” or “I'll create **Half-time shuffle** in your notebooks.” Append
   by default. Replace a cell only when the user asks to edit it, and say which.
   This line needs no confirmation.
3. Write the cell and save it in one call: `add_music_cell` with `notebookId` and
   `source` to append, `create_notebook` with `title` and `source` for a new
   notebook. The save checks the source and returns the report `parse` would:
   with errors nothing is saved, so fix them and call again. A successful parse
   does not prove the music fits: check the reported bars, instrument order,
   chord roots and qualities against the request. If a saved cell needs a
   correction, update that same cell using its returned ID and revision; do not
   create another notebook. For an empty cell, omit `source`.
4. To edit a cell, use its source, `cellId` and revision from the selected-cell
   context, or read `get_notebook` when that context is missing, then
   `update_music_cell` with `notebookId`, `cellId`, `source` and that revision.
   Preserve the complete playable source when repairing syntax:
   `play piano: Am F` becomes `play piano: chords Am F`, retaining `play`. On a conflict,
   read again and reapply only the intended change.
5. Confirm the actual result: “Saved a new groove as cell 3 in **Rhythm
   sketches**.” Finish only after a successful save whose report matches the
   request. If a tool blocks completion, state that it remains unsaved.

A save shows the notebook to the user, so don't call `open_notebook` after one;
don't call `parse` before one, which only writes the cell twice; and don't call
`get_notebook` before appending unless the cell builds on names you don't have.
Several cells are several saves, in order. `parse` is for an explicit no-save
preview, and `render` for sheet music or MIDI when the user asks. A read-only
explanation changes no notebook.

The separate local development server may expose only stateless tools. Only in
that environment, return validated code or a standalone player and explicitly say
it has not been saved to a notebook.

## The standard

- Every cell makes musical sense on its own: one idea, with names that say what each part is.
- Each field in a pattern loops independently at its written length. `hat: x-` hits every two steps, even across a bar boundary. Write `hat: x- |` for one hit per bar. Direct block lines play once and fill the rest with silence.
- Scales, lines and chord formulas by degree (`1 2 3 4 5 6 7`) and charts by numeric degree, so they play in any key. In a mode, write the plain degrees and numerals and let `set mode` make them minor, dorian, harmonicMinor, melodicMinor, wholeTone (six degrees per octave, with 7 the next tonic) and so on: no `b` or `#` for what the mode already does. Letters only where the note names are the point.
- Write accidentals with ASCII `b` and `#` (`Bb`, `F#`, `b7`), not the musical glyphs `♭` and `♯`.
- Count bars before saving. `chords 1 4` is two slots in one bar; `chords 1|4` is two bars. A two-bar seed played, answered and returned is six bars. For piano followed by organ, sequence their parts in `play (call answer)`; entries beside each other in braces start together.
- Notes and chords divide each bar evenly into slots. In `4 over 4`, `1 2 3 4` is four quarter notes and `1 5` is two half notes. Holds and rests take slots too: `C2 - - _` holds for three beats, then rests. `8*C2` is eight eighth-note attacks. Use `|` between bars and `every 1/4 beats` for fixed sixteenth-note riffs. Slots use whole ticks at 96 ticks per beat, including three equal slots in 4/4. In fixed-step timing a written bar line adds silence. In a pattern the last step leads directly into the next repetition.
- Brackets for order: `play((intro 4 bars verse))`.
- Use constructors inside expressions: `print(second(note(1)))`, `print(second(chord(1)))`, and `modify(chord(1), sus2)`. Types propagate through interval functions and named values. Instrument lines can consume typed expressions directly. Use `play({ ... })` for a block (the default), `play(block({ ... }))` for an explicit block, and `play(pattern({ ... }))` for a pattern. Blocks play once. Patterns repeat each field at its own written length. A bounded container allows a partial final repetition.
- Separate entries inside every brace block with `,`, on one line or many. A trailing comma before `}` is allowed; semicolons are errors. Note words use spaces: `piano: notes 1 7*- 3 7*-,`. Newlines inside braces are layout.
- Notes use `n*word` and `n*(words)`, including named phrases and interval functions. A final `...note` holds that note, `...-` sustains the preceding note. Silence at the end is automatic; `..._` is removed. Do not use duration clauses, `rest`, or commas between note words.
- Kit lines use step words, `n*w`, `n*(words)` and a final `...w`. `-` writes internal silence: `8*- dd`. Trailing silence is automatic; `...-` is removed. Do not use kit beat lists, lengths, `rest` or commas.
- Position a value with `lift on bar 2` or `{ ... } on bar 3 to 4`; it adds without silencing other lines. Bare braces construct a block; `pattern({ ... })` constructs a pattern.
- `every` takes beats only (`every 1/2 beats`). Nesting the same pace is an error; an initial `every 1/4 beats` selects fixed sixteenths for notes.
- `set` in front of every setting.
- A long line continues on a line starting with `|`.
- Use signed nonzero numeric degrees for notes and chords; all consecutive digits belong to the root degree, so 8 and 15 continue into higher octaves and seventh chords use 1maj7, 2m7 or 5dom7. Negative degrees count downward from the tonic: in C major -1 is B below C, -2 is A, and -7 is the lower C; wholeTone reaches its lower tonic at -6. Separate negative note words with spaces (-1--- -2---); dashes inside 1---2--- still sustain. Interval functions such as fifth(phrase) move every tone through the active scale or mode; fifth(phrase, 2) repeats the move twice. Use interval functions for relative movement; the `of` operator is not supported. Suffixes compose: 1sus2add11#5/4 uses degree 4 of the key as bass.
- Use `voice(value, { fifth: 1, ninth: -1 })` to move individual chord tones by octaves. It replaces the old pitches, keeps the chord name and slash bass, and accepts chord literals, names and charts. Keys name chord roles rather than key degrees; the requested tones must exist. Shifts are integer literals; 1 is up and -1 is down.
- Chord symbols and numeric degrees spelt as `reference` (topic `chords`) spells them. A name holding one chord fills a slot just like its literal; interval functions do not add bars around it. Use `|` for a bar boundary. Names holding several chords or explicit bar lines remain complete charts when joined.
- One space after a colon, and no columns lined up with extra spaces.

For a progression, a piano part, a bass line or a melody, the `harmony` skill says how to build it from a seed with the interval functions rather than listing chords.

Don't write out published melodies or lyrics. Write an original line in the style asked for, or start from a groove in `library`.

## Example

A walk through D dorian: the scale up and back down as a named line of degrees, continued on a `|` line, a chord by numeric degree under every second beat, the bass and the tune each in its own octave, and the parts in order in brackets.

```composer-nb
set tempo 96
set key D
set mode dorian

notes scale = 1 2 3 4|5 6 7 octave(1)
  |octave(1) 7 6 5|4 3 2 -|1
notes roots = 1 3|5 7
  |octave(1) 6|4 2|1

pattern groove = {
  hat: 8*x-,
  snare: 2*(---- x---),
  kick: x--- --x- x--- ----,
}

pattern walk = {
  groove,
  with octave 4 { piano: notes scale, },
  with octave 2 { bass: notes roots, },
  guitar: chords 1 3|5 7|1 6|4 2|1,
}

play((2 bars groove walk))
```

Print output shows **degree** → chord name → (pitches), with only the evaluated leading value bold. Spaces separate values in one argument; commas separate arguments. Never show a function expression as the resolved chord.
