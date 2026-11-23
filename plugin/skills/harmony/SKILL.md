---
name: harmony
description: Write a chord progression, a piano or keys part, a bass line under chords or a melody over them as composer-nb cells, derived from a small seed with the language's interval functions instead of typed out chord by chord. Use when the user asks for a progression, chords, a piano, organ or guitar part, comping, a bass line, a melody or a reharmonisation, or for something "interesting", "jazzy", "sad", "modal" and the like on a pitched instrument.
---

# Harmony

Build the part from an idea and the language's functions. A chart typed chord by chord, from memory or not, is the shortcut this skill exists to stop, unless the user named the exact chords. Naming a fully enumerated chart does not make it derived: the sounding parts must use the seed's interval transformations or reuse it under different keys or modes.

1. Choose an idea for the request and notebook context, including a key and mode when omitted; do not apply one fixed key or progression to every request. Say the idea in a line and proceed to writing: a cycle of fifths that falls home; a two-bar pattern answered a third higher; the same chart in three keys; a progression borrowed from the parallel minor. Routine creative choices need no clarification or approval.
2. For a familiar interval move or chart reuse, work from the language guide and examples below. Use `library` with the idea's words (`fifth`, `dorian`, `ii–V–I`) when you need a starting example, and `reference` (topics `chords`, `intervals`) for unfamiliar syntax.
3. Write a seed and derive the rest. Before saving, check the cell against these rules; a cell that breaks one is not done:
   - **Type few chords.** Name a seed of one or two chords by degree (`chords one = 1m7`, `chords pair = 1m7 fourth(1m7)`), and write every other chord as a function of a name: `fourth(one)`, `fifth(pair, -1)`, `second(pair, -2)`. Count the chord roots you typed: at most half of the chords that sound. A cadence chord the mode doesn't have (`5dom7` in minor) is the one root worth typing.
   - **Use an interval function** (`second` to `fifteenth`, with a count to repeat or a minus to go down), or play one named chart under two keys or modes (`with key F { … }`, `with mode minor { … }`). A name played twice in one key derives nothing.
   - **Degrees, never letters.** `1m7`, not `Am7`, so `set key` and `set mode` move every chord.
   - **Chords are chords.** Write them on a `chords` line. Never stack `notes` layers to sound a chord; a bass line or a tune over the chords is fine.
   - **Let the mode choose the qualities.** A plain degree is the chord the scale has there; write a quality only to depart from it (`5dom7` in minor, `4m` borrowed in major), or a suffix the style wants (`maj7`, `m7`, `dom7`, `sus4`, `add9`, `M6/9`).
     Interval functions move every tone through the scale; they do not guarantee the same chord quality or a fixed semitone shift. When the user requires dominant sevenths or particular roots, check the returned chord tones and roots. Use explicit qualities or reuse a named chart under different keys to preserve the required quality. Required roots, qualities, length and instrument order take precedence over minimizing typed roots.
   - **Count bars, not chord symbols.** `chords seed = 1m7|fourth(1m7)` is two bars; `seed|third(seed)|seed` is six. With a space instead of `|`, two chords share one bar. Twelve-bar blues needs twelve bars, not twelve chord slots in three bars.
   - **No stock loops**: not 1 5 6 4, 1 6 4 5 or 6 4 1 5, unless asked for.
   - **A bass, if any, follows the same seed**: the roots as a named line sequenced the same way, or a slash bass (`1/3`), in `with octave 2`.
     Notes divide each bar evenly: `3 6` or `4 b7` gives two half-bar notes. Use `|` between bars; explicit `every` selects fixed steps instead. Spell keys and accidentals with `b` and `#`, as in `Bb`.
   - **Shape the voicing** with `voice(chord, { fifth: 1 })`: move the fifth up an octave while keeping the chord's harmony and slash bass. Use multiple object properties for several tones; this moves them instead of doubling them.
4. Save it as the `write-cells` skill says. Check the reported bar count, roots, qualities and instrument order against the request, and correct that same cell if any differ. The task is not complete with an unsaved code block. `print(fifth(pair, -1))` as a cell's last line shows what a function gives before you build on it.
5. Say what the user will hear in a line or two, in the terms of step 1.

Each part gets its own register (`with octave 4` for the chords, `with octave 2` for the bass), and a piano playing chords and a tune together is a block of layers.

## Examples

"Make me something moody." One possible choice: four bars of piano and bass in A minor at 84 BPM, with descending fifths. A two-chord seed, a fifth apart, sequenced down a step twice, then the dominant to turn it round. The bass does the same with the roots.

```composer-nb
set tempo 84
set key A
set mode minor

chords pair = 1m7 fourth(1m7)
chords cycle = pair|second(pair, -1)|second(pair, -2)|5dom7 -
notes roots = 1 4
notes line = roots|second(roots, -1)|second(roots, -2)|-4 -

play({
  with octave 4 { piano: chords cycle, },
  with octave 2 { bass: notes line, },
})
```

The save reports Am7 Dm7, G7 Cmaj7, Fmaj7 Bm7b5, E7: seven chords from one seed, and `set key` or `set mode` moves all of them.

"A melody over chords, something modal." The idea: a four-note motif climbing by step through D dorian, each bar harmonised by the chord on the degree it starts from, the last bar falling back under the tonic.

```composer-nb
set tempo 96
set key D
set mode dorian

notes motif = 1 3 5 3
notes tune = motif|second(motif)|third(motif)|second(motif, -1)
chords home = 1m7
chords under = home|second(home)|third(home)|second(home, -1)
notes pedal = 1 5

play({
  with octave 4 { piano: notes tune, },
  organ: chords under,
  with octave 2 { bass: notes pedal|second(pedal)|third(pedal)|second(pedal, -1), },
})
```
