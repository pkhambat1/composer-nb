# composer-nb

A small language for drums, notes and chords, played right inside Jupyter notebooks. Run a cell and hear it, with a grid of what plays, chord shapes for guitar, and a WAV to keep. **[Try it in your browser](https://composer-nb.vercel.app)**, with nothing to install. The full reference is in the **[docs](https://pkhambat.mintlify.site)**.

<p align="center">
  <img src="https://raw.githubusercontent.com/pkhambat1/composer-nb/main/docs/images/playground.png" width="820" alt="A composer-nb cell: guitar chords and a bass line over a drum pattern, with a waveform player, a grid of the steps and chord diagrams">
</p>

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

Each `play` renders to audio in the notebook, with a play button, a waveform, a grid of the drums and notes, the chords it heard and any mistakes it found.

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
chords riff = Am E7|G D
play guitar: chords riff
```

```
%%music verse after intro
play guitar: chords F C|Dm E7 riff
```

`verse` plays with a capo at fret 2, at 75 bpm, and can use `riff`, wherever it sits in the notebook and whenever you run it. If `intro` hasn't been run yet, you get an error saying so. A cell can still change anything it inherits: `tempo 90` in `verse` speeds up just `verse`.

A cell with no name plays on its own and isn't saved.

## From Python

`%%music` is a shortcut for `Song`, which you can use directly:

```python
from composer_nb import Song

intro = Song("tempo 75\nplay guitar: chords Am E7|G D", name="intro")
verse = Song("play guitar: chords F C|Dm E7", after=intro, name="verse")
verse  # shows the player
```

Songs are ordinary Python values, so you can generate them with loops and functions:

```python
blues = "|".join(["A7", "D7", "A7", "A7", "D7", "D7", "A7", "A7", "E7", "D7", "A7", "E7"])
Song("tempo 120\nplay piano.electric: chords " + blues)
```

## From JavaScript

The same player is on npm as one ES module. `music` takes the source and gives back the player as a DOM node, so it shows up in an [Observable](https://observablehq.com) notebook cell, or anywhere else you put it on a page.

In an Observable notebook:

```js
import { music } from "npm:composer-nb"

const intro = display(
  music(`tempo 75
capo 2
chords riff = Am E7|G D
play guitar: chords riff`),
)
```

```js
music(`play guitar: chords F C|Dm E7 riff`, { after: intro, name: "verse" })
```

`after` and `name` work as they do in Python, and `after` takes what an earlier `music` call returned. The source is a string, so other cells can write it. With a tempo slider called `bpm`, this cell plays at the new tempo each time the slider moves:

```js
music(`tempo ${bpm}
play piano.electric: chords Am F|C G`)
```

Anywhere else, `npm install composer-nb`, or import `https://cdn.jsdelivr.net/npm/composer-nb/+esm`.

## The language

Every line starts by saying what it is:

<p align="center">
  <img src="https://raw.githubusercontent.com/pkhambat1/composer-nb/main/docs/images/how-a-cell-reads.svg" width="820" alt="A cell with each kind of line labelled: a setting, a named pattern, drum lines, play, chords, and a pattern played by name">
</p>

| Line                | What it is                                                              |
| ------------------- | ----------------------------------------------------------------------- |
| `tempo 90`          | A setting: a reserved word and its value                                |
| `steps pair = ^-x-` | A name, with its type in front: `steps`, `notes`, `chords` or `pattern` |
| `kick: x--x---`     | Inside braces, an instrument and what it plays                          |
| `bar 2 { ... }`     | Inside braces, what plays in one bar of the pattern or play it's in     |
| `play { ... }`      | Plays what's after it, a pattern or one line. Nothing else makes sound  |

`//` starts a comment. Blank lines and indentation mean nothing. Settings and names carry on into the cells below.

### Types

A name's type goes in front of it, and `=` gives it its value:

| Type      | What it holds                                                                 | Where it goes                                                 |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `steps`   | A drum's hits: `steps pair = ^-x-`                                            | On a drum's line: `hat: pair pair`                            |
| `notes`   | A line of notes: `notes riff = E---F#E-E--`                                   | On a pitched instrument's line: `guitar: riff`                |
| `chords`  | Bars of chords: `chords verse = Am F\|C G`                                    | After `chords` on an instrument's line: `piano: chords verse` |
| `pattern` | Lines in braces that play together, over and over: `pattern groove = { ... }` | On a line of its own, or after `play`                         |

A name only holds its type, and only goes where that type goes. Chords on a drum's line, or steps where a pattern belongs, is an error that names both types. A name without a type is an error too, and the message shows the line to write.

### Settings

| Setting  | Default    | Meaning                                                                      |
| -------- | ---------- | ---------------------------------------------------------------------------- |
| `time`   | `4 over 4` | Notes in a bar, over which note: `7 over 8`, or felt in groups: `3+4 over 4` |
| `tempo`  | `120`      | Quarter notes per minute                                                     |
| `key`    | `C`        | Key for Roman numeral chords: `C`, `Am`, `Bb`, `F#m`                         |
| `capo`   | `0`        | Capo fret, 0 to 12. Moves a guitar's chords                                  |
| `octave` | `3`        | Octave for chords, and for notes written without one, 1 to 6                 |
| `kit`    | `rock`     | Drum sound: `rock` or `synth`                                                |

Every number is arithmetic (`tempo 60*2`, `(1+2) bars groove`), so `*` and `/` only ever multiply and divide. That's why a time is `7 over 8` rather than `7/8`.

### Notes and chords

`piano`, `piano.electric`, `organ`, `pad`, `bass`, `guitar` and `guitar.electric` play notes and chords, each on a line of its own like a drum. The instrument is the line's name, so there is no setting for it.

Notes are drawn on the steps, a note where a drum has its `x`:

```
time 7 over 8
octave 2

pattern groove = {
  kick: x--x---
  snare: ----x--
  guitar.electric: E---F#E-E--
}

play groove
```

A note is a capital letter, `A` to `G`, with `#` or `b` after it and an octave when it needs one: `F`, `F#`, `Bb`, `E2`. Without a number it's in the `octave` setting, so `octave 2` above puts the riff on the guitar's low E string. One note is one step, however many characters it takes. `-` means nothing new happens, so the note rings on, and `_` stops it. `^` in front accents a note and `~` softens it. A line plays one note at a time. For more, its line takes a block of lines, which play together:

```
play piano: {
  C5-D5-E5-G5-E5-D5-C5---
  C3---------------
}
```

Chords are written by the bar, with `chords` in front:

```
play guitar: chords C - - G|Am - F G|%|F - _ -
```

`|` is a bar line, and the chords in a bar split it evenly. `-` holds the chord before for another slot, `_` is silence and `%` repeats the bar before. Chords can be names (`Cmaj7`, `F#m`, `Bb7`, `C/E`) or Roman numerals that follow `key` (`I vi IV V7`).

### Drums

`kick`, `snare`, `hat`, `ride` and `crash` are drums, one to a line, and so are the three toms: `tom.high`, `tom.low` and `tom.floor`. Some drums have other sounds with lines of their own: `ride.bell`, `hat.open`, `hat.pedal`, `snare.rim` (a rimshot) and `snare.ghost` (the snare's ghost notes, so they can sit under its main line). A drum plays either steps or beats:

```
pattern beat = {
  kick: x---x---x-x-----
  snare: ----^-------^---
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

An open hi-hat rings until the next hi-hat hit closes it (a stick on `hat`, or the foot on `hat.pedal`), and replaces a closed hit at the same moment, so `hat: ^-x-` can keep going under `hat.open: ------^-`.

Steps are a picture of time, one character each, a 16th note unless they're inside `every`: `x` hit, `^` accent, `~` ghost (on the snare, use `snare.ghost`), `d` double, `-` nothing. Spaces mean nothing, so group them by beat, and `|` marks the end of a bar (it's checked): `kick: x--- ---- x--- ---- | x--- --x- x--- ----`.

Beats are the beats a drum hits on in each bar, counted `1 e & a 2 e & a`. A beat on its own is a plain hit, and a step in front says another way to hit it: `snare: 2e ^4` accents the 4, `~3a` is a ghost note and `d3` a double. Beats and steps don't mix on a line.

### One bar only

In a pattern every line repeats, so it plays in every bar. To play something in one bar only, put the bar in front of it:

```
time 7 over 8
tempo 90

pattern groove = {
  kick: x--x---
  snare: 2e 4
  snare.ghost: --x----
  hat: ^-x-
  bar 2 {
    snare.ghost: 2 beats rest, dd, 1 beats rest
    hat.open: 2 beats rest, --^-, 2 steps rest
    hat.pedal: 4
  }
}

play 6 bars {
  crash: 1
  groove
}
```

<p align="center">
  <img src="https://raw.githubusercontent.com/pkhambat1/composer-nb/main/docs/images/one-bar-only.svg" width="820" alt="A groove whose lines repeat in both bars, with a bar 2 block that adds a ghost-note burst, an open hi-hat and a pedal close in bar 2 only">
</p>

`bar 2 { ... }` is what happens in bar 2 of the pattern, each time through it. What's inside repeats to fill the bar, and its lines are lower, so they win where they hit a drum at the same moment as a line above. One line needs no braces (`bar 2 hat.pedal: 4`), a named pattern can go there (`bar 4 fill`), and `bar 3 to 4 { ... }` takes a run of bars.

### Rests with a length

Instead of counting out a long run of `-`, put a length in front of `rest`, in `steps`, `beats` or `bars`: `2 beats rest`. Commas separate the parts of a line, and a part is steps as they're drawn or a length with what fills it:

```
play {
  snare: 2 beats rest, dd, 1.5 beats rest
  crash: 1 bars rest, x
}
```

A length can also repeat steps, up to the next comma: `2 beats x-` is `x-x-x-x-`. Lengths are always plural, whatever the number (`1 bars`), so `bars` only ever says how long and `bar` only ever says which one.

### Slower and faster steps

`every` goes in front of a pattern, a block or one line, and says how long a step lasts in it. `every 3 steps` makes each step last three 16ths, `every 2 steps` is eighth notes, and `every 1/3 beats` is triplets:

```
pattern feet = every 3 steps {
  kick: ^-^^-^--
  hat.pedal: -x--x-xx
}
```

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
| `3 bars { ... }`               | A length, always plural, in front of what it measures  |
| `2 beats rest`                 | On a drum's line, silence for that long                |
| `6 bars groove`                | `groove` repeats for 6 bars                            |
| `8 bars (a b)`                 | Brackets group: `a` then `b`, repeated for 8 bars      |
| `bar 2 { ... }`                | A bar, in front of what plays there and nowhere else   |

Without a length, a pattern lasts until its lines line up again (and long enough to have any bar it names), and a play lasts as long as the longest thing in it. A play can be longer than its lines, and the rest is silent: `play 4 bars { crash: 1 }`.

Whatever repeats has to fit what it's in a whole number of times. Lines of different lengths drift against each other, which is how you write a polyrhythm, and the pattern's length has to be one where they line up:

<p align="center">
  <img src="https://raw.githubusercontent.com/pkhambat1/composer-nb/main/docs/images/lines-line-up.svg" width="820" alt="A step grid in 7 over 8: the kick and snare repeat every 7 steps and the ride bell every 3, lining up again after 21 steps">
</p>

```
pattern poly = 15 bars {
  kick: x---
  tom.floor: x--
  snare: x----
}
```

With `4 bars` that's an error, and it says the lines line up every 15 bars. What's set or named inside braces stays inside them.

## Playground

The same language runs in the [composer-nb playground](https://composer-nb.vercel.app), a notebook-style web app you can use in the browser with nothing to install. Its source is in the [`playground/`](https://github.com/pkhambat1/composer-nb/tree/main/playground) folder of the repository.

## Developing

This package lives in the `dsl/` folder of [the repository](https://github.com/pkhambat1/composer-nb). The parser and audio engine are JavaScript (`dsl/js/`), and the Python side (`dsl/python/composer_nb/`) passes cell sources to them through an [anywidget](https://anywidget.dev). Build the widget before installing:

```bash
npm install
npm run build -w dsl
pip install -e "dsl[test]"
pytest dsl/tests/python
```
