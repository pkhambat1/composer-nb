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

"What makes dorian different from natural minor?" The chords differ at the 4 and the 6. A digit in a chart is the chord the scale has on that degree, so one chart plays each mode's own chords:

```composer-nb
chords chart = 1 2|3 4|5 6|7 1

with key D, mode minor { play piano: chords chart }
with key D, mode dorian { play piano: chords chart }
```

The raised 6 makes the 4 major: G in D dorian, where natural minor has Gm. The same chart in another key, parsed with the first cell as `after`:

```composer-nb
with key A, mode dorian { play piano: chords chart }
```
