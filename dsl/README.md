# composer-nb

A small language for chords and drums, played right inside Jupyter notebooks.

```
%%music
// what happens now: crash once, the groove repeating under it
time 7 over 8

pattern groove = 3 bars {
  kick: x--x---
  snare: ----x--
  ride.bell: x--
}

play 6 bars {
  crash: 1
  groove
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
chords riff = Am E7|G D
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

| Line                | What it is                                                             |
| ------------------- | ---------------------------------------------------------------------- |
| `tempo 90`          | A setting: a reserved word and its value                               |
| `steps pair = X-x-` | A name, with its type in front: `steps`, `chords` or `pattern`         |
| `kick: x--x---`     | Inside braces, an instrument and what it plays                         |
| `play { ... }`      | Plays what's after it, a pattern or one line. Nothing else makes sound |

`//` starts a comment. Blank lines and indentation mean nothing. Settings and names carry on into the cells below.

### Types

A name's type goes in front of it, and `=` gives it its value:

| Type      | What it holds                                                                 | Where it goes                         |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------- |
| `steps`   | A drum's hits: `steps pair = X-x-`                                            | On a drum's line: `hat: pair pair`    |
| `chords`  | Bars of chords: `chords verse = Am F\|C G`                                    | On the chords line: `chords: verse`   |
| `pattern` | Lines in braces that play together, over and over: `pattern groove = { ... }` | On a line of its own, or after `play` |

A name only holds its type, and only goes where that type goes. Chords on a drum's line, or steps where a pattern belongs, is an error that names both types. A name without a type is an error too, and the message shows the line to write.

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

Every number is arithmetic (`tempo 60*2`, `(1+2) bars groove`), so `*` and `/` only ever multiply and divide. That's why a time is `7 over 8` rather than `7/8`.

### Chords

Chords go on a `chords:` line and play on the `sound` setting:

```
sound guitar
play chords: C - - G|Am - F G|%|F - _ -
```

`|` is a bar line, and the chords in a bar split it evenly. `-` holds the chord before for another slot, `_` is silence and `%` repeats the bar before. Chords can be names (`Cmaj7`, `F#m`, `Bb7`, `C/E`) or Roman numerals that follow `key` (`I vi IV V7`).

### Drums

`kick`, `snare`, `hat`, `ride`, `crash`, `tom` and `floor` are the drums, one to a line. Some have other sounds with lines of their own: `ride.bell`, `hat.open`, `hat.pedal`, `snare.rim` (a rimshot) and `snare.ghost` (the snare's ghost notes, so they can sit under its main line). A drum plays either steps or beats:

```
pattern beat = {
  kick: x---x---x-x-----
  snare: ----X-------X---
  snare.ghost: --------------x-
  hat: x-
}

play 2 bars {
  crash: 1
  beat
}
```

Each drum has one line in a block. To layer it, its line takes a block of steps, one layer a line. The layers repeat until they line up again, and where two hit the same step, the lower line wins. A rest never wins, so a layer only changes the steps it hits:

```
pattern ghosts = {
  snare.ghost: {
    --x-
    ------------ddd-
  }
}
```

A block of steps is steps, so it can be named too: `steps ghosts = { ... }`. Where patterns played together hit the same drum at once, the lower line wins too.

An open hi-hat rings until the next hi-hat hit closes it (a stick on `hat`, or the foot on `hat.pedal`), and replaces a closed hit at the same moment, so `hat: X-x-` can keep going under `hat.open: ------X-`.

Steps are one character each, a 16th note unless `step` says otherwise: `x` hit, `X` accent, `g` ghost (on the snare, use `snare.ghost`), `d` double, `-` nothing. Beats are counted `1 e & a 2 e & a`, with `accent`, `ghost` or `double` after a beat to change how it's hit.

### Patterns and play

A pattern is lines in braces that play together, over and over: everything in it repeats until the pattern ends. Give it a name, and play it by name. Names in a row play one after another:

```
pattern hit = { crash: 1 }
pattern groove = {
  kick: x---x---
  snare: ----x---
}
play hit groove groove hit
```

Inside braces, a pattern's name on a line of its own plays next to the lines beside it. A pattern without a name plays wherever a name could: `play hit { snare: xxxx } hit`.

### Repeating and lengths

Putting something in a pattern is the one way to repeat it, and a length is the one way to say how long.

| You write                      | Meaning                                                |
| ------------------------------ | ------------------------------------------------------ |
| `pattern beat = { hat: x- }`   | Everything in a pattern repeats until the pattern ends |
| `play { crash: 1 ... }`        | A play is a timeline, and its own lines play once      |
| `groove`, on a line of its own | In a play, the pattern repeats until the play ends     |
| `3 bars { ... }`               | A length, always in front of what it measures          |
| `6 bars groove`                | `groove` repeats for 6 bars                            |
| `8 bars (a b)`                 | Brackets group: `a` then `b`, repeated for 8 bars      |

Without a length, a pattern lasts until its lines line up again, and a play lasts as long as the longest thing in it. A play can be longer than its lines, and the rest is silent: `play 4 bars { crash: 1 }`.

Whatever repeats has to fit what it's in a whole number of times. Lines of different lengths drift against each other, which is how you write a polyrhythm, and the pattern's length has to be one where they line up:

```
pattern poly = 15 bars {
  kick: x---
  floor: x--
  snare: x----
}
```

With `4 bars` that's an error, and it says the lines line up every 15 bars. What's set or named inside braces stays inside them.

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
