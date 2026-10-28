---
name: theory
description: Explain a music theory idea with small composer-nb cells the user can hear, one idea per cell. Use when the user asks what a scale, mode, interval, chord, progression, cadence, rhythm or meter is, how it works, why it sounds the way it does, or wants to hear it.
---

# Theory

1. Say the idea in a sentence or two, as one musician would to another.
2. Write a cell for each step of it, smallest first: the scale, then the chord built on it, then the progression that uses it. A cell plays one thing, or two side by side when the point is the contrast.
3. Write scales by degree and charts by numeral, so a later cell can change `set key` and play the same name to show the idea moves. Letters only where the note names are the point. Read `reference` (topics `notes`, `chords`) for anything you haven't written, such as `of`.
4. Parse each cell as the `write-cells` skill says, passing the earlier cells as `after` where their names carry on. Check every claim against what `parse` returns: the degrees on the grid, the chords it heard.
5. Give the cells in order, each after a line saying what to listen for. In claude.ai and Claude Desktop each one plays under the reply.

## Example

"What makes dorian different from natural minor?" The two scales differ at the 6:

```composer-nb
set key D
set octave 4

notes minor = 1---2---b3---4---|5---b6---b7---1'---
notes dorian = 1---2---b3---4---|5---6---b7---1'---

play piano: minor
play piano: dorian
```

The raised 6 makes the IV major: G in D dorian, where natural minor has Gm. Every chord of D dorian, in turn:

```composer-nb
set mode dorian
play piano: chords i ii|bIII IV|v vidim|bVII i
```

The same name in another key, parsed with the first cell as `after`:

```composer-nb
set key A
play piano: dorian
```
