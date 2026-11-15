---
name: harmony
description: Write a chord progression, a piano or keys part, a bass line under chords or a melody over them as composer-nb cells, built from music theory with the language's functions. Use when the user asks for a progression, chords, a piano, organ or guitar part, comping, a bass line, a melody or a reharmonisation, or for something "interesting", "jazzy", "sad", "modal" and the like on a pitched instrument.
---

# Harmony

Build the part from an idea and the language's functions. Don't list chords or notes from memory: a chart typed out as `1 5 6 4` or `Am F C G` is what this skill is here to avoid, unless that progression is what the user asked for.

1. Say the idea in a line, in theory terms: the key and mode, and what the harmony does. A cycle of fifths that falls home; a motif answered a third higher; a pedal bass under moving chords; the same chart borrowed from the parallel minor.
2. Call `library` with the idea's words (`fifth`, `dorian`, `ii–V–I`) for a cell to start from, and read `reference` (topics `chords`, `notes`, `intervals`) for anything you haven't written.
3. Write a seed and derive the rest:
   - **The seed is small and named**: one or two chords, or a motif of a few notes, by degree. `chords pair = 1m7 fourth(1m7)`, `notes motif = 1---3---5---3---`.
   - **Sequence it** with an interval function: `second(pair, -1)` is the same two chords a step lower, `third(motif)` the motif a third up. Every tone moves through the scale, so the qualities come out right for the key.
   - **Let the mode choose the chords.** A plain degree is the chord the scale has there; write a quality only to depart from it (`5dom7` for a dominant in minor, `4m` borrowed in major). Change the colour with `set mode` or a `with`, not with accidentals.
   - **Give the bass a line of its own**: the roots as a named line sequenced the same way, or a slash bass that walks (`1 1/3|4 5/7`), in `with octave 2`.
   - **Extend with suffixes**: `maj7`, `m7`, `dom7`, `sus4`, `add9`, `M6/9`, where the style wants them.
4. Save it as the `write-cells` skill says and read the chords the save reports against the idea. `print(second(pair, -1))` as a cell's last line shows what a function gives before you build on it.
5. Say what the user will hear in a line or two, in the terms of step 1.

Each part gets its own register (`with octave 4` for the right hand, `with octave 2` for the bass), and a piano playing chords and a tune together is a block of layers.

## Examples

"An interesting piano progression in A minor." The idea: descending fifths. A two-chord seed, a fifth apart, sequenced down a step twice, then the dominant to turn it round. The bass does the same with the roots.

```composer-nb
set tempo 84
set key A
set mode minor

chords pair = 1m7 fourth(1m7)
chords cycle = pair|second(pair, -1)|second(pair, -2)|5dom7 -
notes roots = 1-------4-------
notes line = roots|second(roots, -1)|second(roots, -2)|-4 15*-

play block {
  with octave 4 { piano: chords cycle, },
  with octave 2 { bass: notes line, },
}
```

The save reports Am7 Dm7, G7 Cmaj7, Fmaj7 Bm7b5, E7: seven chords from one seed, and `set key` or `set mode` moves all of them.

"A melody over chords, something modal." The idea: a four-note motif climbing by step through D dorian, each bar harmonised by the chord on the degree it starts from, the last bar falling back under the tonic.

```composer-nb
set tempo 96
set key D
set mode dorian

notes motif = 1---3---5---3---
notes tune = motif|second(motif)|third(motif)|second(motif, -1)
chords under = 1m7|second(1m7)|third(1m7)|second(1m7, -1)
notes pedal = 1-------5-------

play block {
  with octave 4 { piano: notes tune, },
  organ: chords under,
  with octave 2 { bass: notes pedal|second(pedal)|third(pedal)|second(pedal, -1), },
}
```
