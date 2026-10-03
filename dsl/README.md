# composer-nb

A small language for chords and drums, played right inside Jupyter notebooks.

```
%%music
// what happens now: crash once, groove twice
time 7 over 8

groove = 3 bars {
  kick: loop x--x---
  snare: loop ----x--
  ride.bell: loop x--
}

play {
  crash: 1
  groove * 2
}
```

Each `play` renders to audio in the notebook, with a play button, a waveform, a drum grid, the chords it heard and any mistakes it found.

## Install

```bash
pip install composer-nb
```

Then, in a notebook:

```python
%load_ext composer_nb
```

It works in JupyterLab, Jupyter Notebook 7, VS Code and Google Colab. Sounds are rendered in your browser, and the piano, guitar and drum samples load from the web, so you need an internet connection. Press Tab inside a `%%music` cell for completions.

## Cells that continue from each other

Give a cell a name, and later cells can start from the settings and names it ended with:

```
%%music intro
tempo 75
capo 2
sound guitar
riff = Am E7|G D
play chords: riff
```

```
%%music verse after intro
play chords: F C|Dm E7 riff
```

`verse` plays on guitar with a capo at fret 2, at 75 bpm, and can use `riff`, wherever it sits in the notebook and whenever you run it. If `intro` hasn't been run yet, you get an error saying so. A cell can still change anything it inherits: `tempo 90` in `verse` speeds up just `verse`.

A cell with no name plays on its own and isn't saved.

## From Python

`%%music` is a shortcut for `Song`, which you can use directly:

```python
from composer_nb import Song

intro = Song("tempo 75\nsound guitar\nplay chords: Am E7|G D", name="intro")
verse = Song("play chords: F C|Dm E7", after=intro, name="verse")
verse  # shows the player
```

Songs are ordinary Python values, so you can generate them with loops and functions:

```python
blues = "|".join(["A7", "D7", "A7", "A7", "D7", "D7", "A7", "A7", "E7", "D7", "A7", "E7"])
Song("tempo 120\nsound epiano\nplay chords: " + blues)
```

## The language

Every line starts by saying what it is:

| Line                | What it is                                                           |
| ------------------- | -------------------------------------------------------------------- |
| `tempo 90`          | A setting: a reserved word and its value                             |
| `verse = Am F\|C G` | A name for chords or steps. `=` always gives something a name        |
| `groove = { ... }`  | A name for a block: lines in braces that play together               |
| `kick: x--x---`     | Inside braces, an instrument and what it plays                       |
| `play { ... }`      | Plays what's after it, a block or one line. Nothing else makes sound |

`//` starts a comment. Blank lines and indentation mean nothing. Settings and names carry on into the cells below.

### Settings

| Setting  | Default    | Meaning                                                                      |
| -------- | ---------- | ---------------------------------------------------------------------------- |
| `time`   | `4 over 4` | Notes in a bar, over which note: `7 over 8`, or felt in groups: `3+4 over 4` |
| `tempo`  | `120`      | Quarter notes per minute                                                     |
| `step`   | `1/16`     | How long one drum step lasts: `1/8`, or `1/12` for triplets                  |
| `sound`  | `piano`    | What chords play on: `piano`, `epiano`, `organ`, `pad`, `bass`, `guitar`     |
| `key`    | `C`        | Key for Roman numeral chords: `C`, `Am`, `Bb`, `F#m`                         |
| `capo`   | `0`        | Capo fret, 0 to 12. Only with `sound guitar`                                 |
| `octave` | `3`        | Octave chords are voiced in, 1 to 6                                          |
| `kit`    | `rock`     | Drum sound: `rock` or `synth`                                                |

Every number is arithmetic (`tempo 60*2`, `groove * (4/2)`), so `/` only ever divides. That's why a time is `7 over 8` rather than `7/8`.

### Chords

Chords go on a `chords:` line and play on the `sound` setting:

```
sound guitar
play chords: C - - G|Am - F G|%|F - _ -
```

`|` is a bar line, and the chords in a bar split it evenly. `-` holds the chord before for another slot, `_` is silence and `%` repeats the bar before. Chords can be names (`Cmaj7`, `F#m`, `Bb7`, `C/E`) or Roman numerals that follow `key` (`I vi IV V7`).

### Drums

`kick`, `snare`, `hat`, `ride`, `crash`, `tom` and `floor` each get their own line. Some have a second sound with a line of its own: `ride.bell`, `hat.open` and `hat.pedal`. A drum plays either steps or beats:

```
play {
  kick: x---x---x-x-----
  snare: ----X-------X-g-
  crash: 1
  hat: loop x-
}
```

Steps are one character each, a 16th note unless `step` says otherwise: `x` hit, `X` accent, `g` ghost, `d` double, `-` nothing. Beats are counted `1 e & a 2 e & a`, with `accent`, `ghost` or `double` after a beat to change how it's hit. A line plays once; `loop` repeats it until what it's in ends, so loops of different lengths drift against each other.

### Blocks and play

A block is lines in braces that play together. Give it a name with `=`, and play it by name:

```
hit = { crash: 1 }
groove = {
  kick: x---x---
  snare: ----x---
}
play hit groove * 2 hit
```

| You write            | Meaning                                       |
| -------------------- | --------------------------------------------- |
| `intro verse`        | One after the other                           |
| `verse * 2`          | Twice                                         |
| `(verse chorus) * 2` | The pair, twice                               |
| `3 bars groove`      | A length, always in front of what it measures |

Inside braces, a block's name on a line of its own plays next to the lines beside it. A block without a name plays wherever a name could:

```
play {
  4 bars {
    kick: loop x---
    floor: loop x--
    snare: loop x----
  }
}
```

Without a length, a block lasts as long as its longest line that isn't a loop. A block with only loops in it needs a length, where you name it (`groove = 3 bars { ... }`) or where you play it (`play 3 bars groove`). What's set or named inside braces stays inside them.

## Playground

The same language runs in the composer-nb playground, a notebook-style web app. Its source is in the [`playground/`](https://github.com/pkhambat1/composer-nb/tree/main/playground) folder of the repository.

## Developing

This package lives in the `dsl/` folder of [the repository](https://github.com/pkhambat1/composer-nb). The parser and audio engine are JavaScript (`dsl/js/`), and the Python side (`dsl/python/composer_nb/`) passes cell sources to them through an [anywidget](https://anywidget.dev). Build the widget before installing:

```bash
npm install
npm run build -w dsl
pip install -e "dsl[test]"
pytest dsl/tests/python
```
