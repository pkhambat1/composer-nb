---
name: groove
description: Build a drum groove from a description as a composer-nb cell that plays. Use when the user describes a beat, a feel, a style, a meter or a song's groove ("a half-time shuffle at 70", "a 7/8 groove with the hats on every eighth", "something like a Purdie shuffle") or wants a variation on one.
---

# Groove

1. Call `library` with the style, meter or rudiment in the description. Start from the closest groove there and say which one; start from nothing when none is close.
2. Change it to the description: `set time`, `set tempo`, `set swing on` for a shuffle, the kit pieces, the accents and ghost notes. Read `reference` (topics `steps`, `patterns`) for anything you haven't written.
3. Parse and fix it as the `write-cells` skill says, and hold the cell to its standard.
4. Say in a line or two what plays: the ostinato, where the backbeat sits, how the bars differ. Don't walk through the grid.

The groove is a named pattern. A crash on the one or a fill goes in the play, so the pattern stays reusable.

## Example

"A two-bar funk groove at 96: ghost notes on the snare, the hat opening on the & of 4, a crash to start."

```composer-nb
set tempo 96

pattern funk = {
  hat: x-x- x-x- x-x- x---
  hat.open: 4&
  snare: 2 4
  snare.ghost: ---- ---x -x-- --x-
  kick: x--- --x- --x- ---- | x--- --x- ---- -x--
}

play 4 bars {
  crash: 1
  funk
}
```
