---
name: practice
description: Turn a groove, riff or chart into a practice routine of composer-nb cells. Use when the user wants to practise or drill something, build speed with a tempo ladder, learn a part, or play along with their own part left out.
---

# Practice

1. Get the material: the user's cell, a groove from `library`, or a cell written as the `write-cells` skill says.
2. Write the routine out as cells, each parsed clean:
   - A tempo ladder: the same named pattern played again under each new `set tempo`, slowest first. Start where it plays clean, often 60 to 70 percent of the target, and climb 5 to 10 at a time.
   - A hard part alone first, then in context: the hands, then the feet, then both.
   - A play-along: the same groove with the user's part left out, as a pattern without those lines.
   - A count-in, when it helps: a bar of quarter notes on the hi-hat in front, in brackets with what it counts in.
3. Give the cells in order, each after a line saying what to listen for and when to move on. In claude.ai and Claude Desktop each one plays under the reply, where the user can change the tempo and play it again.

## Examples

A funk groove up a ladder from 70 to 90, four bars a rung.

```composer-nb
set tempo 70

pattern funk = {
  hat: x-
  snare: 2 4
  snare.ghost: ---- ---x -x-- --x-
  kick: x--- --x- --x- ----
}

play 4 bars funk

set tempo 80
play 4 bars funk

set tempo 90
play 4 bars funk
```

A groove, then the same with the kick left out for the user to play, each with a bar of count-in.

```composer-nb
set tempo 90

pattern hands = {
  hat: x-
  snare: 2 4
}

pattern groove = {
  hands
  kick: 1 3 3&
}

pattern click = {
  hat: 1 2 3 4
}

play (1 bars click 4 bars groove)
play (1 bars click 4 bars hands)
```
