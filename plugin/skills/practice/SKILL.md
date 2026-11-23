---
name: practice
description: Turn a groove, riff or chart into a practice routine of composer-nb cells. Use when the user wants to practise or drill something, build speed with a tempo ladder, learn a part, or play along with their own part left out.
---

# Practice

1. Get the material: the user's cell, a groove from `library`, or a cell written as the `write-cells` skill says.
2. Write the routine out as cells, each saved clean:
   - A tempo ladder: the same named pattern played again under each new `set tempo`, slowest first. Start where it plays clean, often 60 to 70 percent of the target, and climb 5 to 10 at a time.
   - A hard part alone first, then in context: the hands, then the feet, then both.
   - A play-along: the same groove with the user's part left out, as a pattern without those lines.
   - A count-in, when it helps: a bar of quarter notes on the hi-hat in front, in brackets with what it counts in.
3. Give the cells in order, each after a line saying what to listen for and when to move on. The saved notebook is where the user changes the tempo and plays it again.

Save each cell as the `write-cells` skill says: one call writes it, checks it and shows it.

## Examples

A funk groove up a ladder from 70 to 90, four bars a rung.

```composer-nb
set tempo 70

pattern funk = {
  hat: 8*x-,
  snare: 2*(4*- x 3*-),
  snare.ghost: ---- ---x -x-- --x-,
  kick: x--- --x- --x- ----,
}

play(funk) for 4 bars

set tempo 80
play(funk) for 4 bars

set tempo 90
play(funk) for 4 bars
```

A groove, then the same with the kick left out for the user to play, each with a bar of count-in.

```composer-nb
set tempo 90

pattern hands = {
  hat: 8*x-,
  snare: 2*(4*- x 3*-),
}

pattern groove = {
  hands,
  kick: x 7*- x-x 5*-,
}

pattern click = {
  hat: 4*(x 3*-),
}

play((1 bars click 4 bars groove))
play((1 bars click 4 bars hands))
```
