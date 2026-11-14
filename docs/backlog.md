# Backlog

Planned language and documentation work. Finished items stay here with the date they were finished.

## Language

### eighth, an alias of octave

Status: finished November 14, 2026. Added November 14, 2026.

```text Syntax
eighth(value: notes | chords, intervalMultiplier: integer = 1)
    -> notes | chords
```

Add `eighth` as an exact alias of `octave`, and keep `octave`.

- Takes `notes` or `chords` and returns the same type.
- Takes an `integer` multiplier from -64 to 64, default `1`. Negative moves down; `0` moves nothing.
- Moves by 12 semitones times the multiplier in every mode, `wholeTone` included.
- Keeps chord quality, slash bass, timing, holds, rests and accents.

Done when `eighth` and `octave` give the same result for notes and chords in every mode, for every multiplier, when nested and in every error case, and the parser vocabulary, the editor's help and this reference list it.
