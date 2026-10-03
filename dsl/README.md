# composer-nb

A small language for chords and drums, played right inside Jupyter notebooks.

```
%%music
time: 7/8
crash: 1|.|.
ride.bell: x..
kick: x..x...
snare: ....x..
```

Each `%%music` cell renders to audio in the notebook, with a play button, a waveform, a drum grid, the chords it heard and any mistakes it found.

## Install

```bash
pip install composer-nb
```

Then, in a notebook:

```python
%load_ext composer_nb
```

It works in JupyterLab, Jupyter Notebook 7, VS Code and Google Colab. Sounds are rendered in your browser, and the piano, guitar and drum samples load from the web, so you need an internet connection.

## Cells that continue from each other

Give a cell a name, and later cells can start from the settings and words it ended with:

```
%%music intro
tempo: 75
capo: 2
sound: guitar
Am E7|G D
```

```
%%music verse after intro
F C|Dm E7
```

`verse` plays on guitar with a capo at fret 2, at 75 bpm, wherever it sits in the notebook and whenever you run it. If `intro` hasn't been run yet, you get an error saying so. A cell can still change anything it inherits: `tempo: 90` in `verse` speeds up just `verse`.

A cell with no name plays on its own and isn't saved.

## From Python

`%%music` is a shortcut for `Song`, which you can use directly:

```python
from composer_nb import Song

intro = Song("tempo: 75\nsound: guitar\nAm E7|G D", name="intro")
verse = Song("F C|Dm E7", after=intro, name="verse")
verse  # shows the player
```

Songs are ordinary Python values, so you can generate them with loops and functions:

```python
blues = "|".join(["A7", "D7", "A7", "A7", "D7", "D7", "A7", "A7", "E7", "D7", "A7", "E7"])
Song("tempo: 120\n" + blues)
```

## The language

Every line is a setting, an instrument and what it plays, a line of chords, a word you can reuse, or a `--` comment. Lines next to each other play together; a blank line starts the next block, which plays after it.

### Settings

| Setting  | Default   | Meaning                                                                       |
| -------- | --------- | ----------------------------------------------------------------------------- |
| `time`   | `4/4`     | `4/4`, `7/8`, or added-up like `(3+4)/4`                                      |
| `tempo`  | `120`     | Quarter notes per minute                                                      |
| `sound`  | `piano`   | What chord lines play on: `piano`, `epiano`, `organ`, `pad`, `bass`, `guitar` |
| `capo`   | `0`       | Capo fret, 0 to 12. Only for guitar                                           |
| `key`    | `C`       | Key for Roman numeral chords                                                  |
| `step`   | `1/16`    | Length of each step in a drum loop                                            |
| `bars`   | automatic | How many bars this block plays                                                |
| `octave` | `3`       | Octave chords are voiced in                                                   |
| `kit`    | `rock`    | Drum sound: `rock` or `synth`                                                 |

Settings carry on into the blocks and cells below.

### Chords

```
sound: guitar
Am F|C G
C . . G|Am . F G|%|F . _ .
```

`|` is a bar line and the chords in a bar split it evenly. `.` holds the chord before for another slot, `_` is silence and `%` repeats the bar before. Chord lines next to each other carry on from one another. Chords can be names (`Cmaj7`, `F#m`, `Bb7`, `C/E`) or Roman numerals that follow `key` (`I vi IV V7`). To layer a second instrument, start its line with its name: `bass: C A|F G`.

### Drums

`kick`, `snare`, `hat`, `ride`, `crash`, `tom` and `floor` each get their own line, played either on beats or as a loop. Some have a second sound with a line of its own: `ride.bell`, `hat.open` and `hat.pedal`.

```
kick: 1 3
snare: 2 4 accent
crash: 1|.|.
hat: X.x.X.x.
ride.bell: x..
```

Beats are counted `1 e & a 2 e & a`, and `|` separates bars (`.` is an empty bar). A loop is a row of steps that repeats on its own: `x` hit, `X` accent, `g` ghost, `d` double, `.` rest. Every line in a block repeats until they all line up again.

### Repeats

```
repeat 2:
  repeat 3:
    kick: x..x...
  crash: 1
  snare: 2 4
```

`repeat 2:` plays the lines indented under it twice. It ends at the first line that isn't indented under it, and repeats nest.

### Words

```
pair = X.x.
verse = Am E7|G D
hat: pair pair
verse verse
```

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
