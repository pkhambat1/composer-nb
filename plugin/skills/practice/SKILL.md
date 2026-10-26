---
name: practice
description: Turn a groove, rudiment, riff or chart into a practice routine with composer-nb links. Use when the user wants to practise or drill something, build speed with a tempo ladder, learn a part, or play along with their own part left out.
---

# Practice

1. Get the material: the user's cell, a groove or rudiment from `library` (rudiments come with their stickings), or a cell written as the `write-cells` skill says.
2. Write the routine as small steps, each parsed clean:
   - A tempo ladder: the same named pattern played again under each new `set tempo`, slowest first. Start where it plays clean, often 60 to 70 percent of the target.
   - A hard part alone first, then in context: the hands, then the feet, then both.
3. `link` the cell, or `link` with `cells` for a routine of several cells, with a text cell before each one saying what to listen for and when to move on.
4. Point at the practice controls, under the cell in claude.ai and Claude Desktop, and on the link:
   - `−` and `+`: play slower or faster than written, 50 to 150 percent in steps of 10.
   - Loop: round and round.
   - Ramp: a step faster each time round, up to 150 percent.
   - Count-in: a bar of clicks first.
   - Mute: play without the feet, the hands or an instrument, to play that part yourself.

The controls change the playback, not the cell, so one cell at the target tempo with Ramp on is a ladder by itself. Write the rungs out when each needs its own length or a changed part, or when the user wants exact tempos.

## Example

A single paradiddle up a ladder from 60 to 80, four bars a rung.

```composer-nb
set tempo 60

pattern paradiddle = {
  snare: ^xxx
  sticking: RLRR LRLL
}

play 4 bars paradiddle

set tempo 70
play 4 bars paradiddle

set tempo 80
play 4 bars paradiddle
```
