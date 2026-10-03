# composer-nb

A small language for sketching chord progressions, played right inside Jupyter notebooks.

```
%%music intro
@key Am
@tempo 75
@inst guitar
Am E7
G D
F C
Dm E7
```

Each `%%music` cell renders to audio in the notebook, with a play button, a waveform, the chords it heard and any mistakes it found.

## Install

```bash
pip install composer-nb
```

Then, in a notebook:

```python
%load_ext composer_nb
```

It works in JupyterLab, Jupyter Notebook 7, VS Code and Google Colab. Sounds are rendered in your browser, and the piano and guitar samples load from the web, so you need an internet connection.

## Cells that continue from each other

Give a cell a name, and later cells can start from the settings it ended on (key, tempo, instrument and so on):

```
%%music intro
@key Am
@tempo 75
@inst guitar
Am E7
G D
```

```
%%music verse after intro
F C
Dm E7
```

`verse` plays in A minor at 75 bpm on guitar, wherever it sits in the notebook and whenever you run it. If `intro` hasn't been run yet, you get an error saying so. A cell can still change anything it inherits: `@tempo 90` in `verse` speeds up just `verse`.

A cell with no name plays on its own and isn't saved.

## From Python

`%%music` is a shortcut for `Song`, which you can use directly:

```python
from composer_nb import Song

intro = Song("@key Am\n@tempo 75\nAm E7\nG D", name="intro")
verse = Song("F C\nDm E7", after=intro, name="verse")
verse  # shows the player
```

Because songs are ordinary Python values, you can generate them with loops and functions:

```python
blues = "\n".join(["A7", "D7", "A7", "A7", "D7", "D7", "A7", "A7", "E7", "D7", "A7", "E7"])
Song("@key A\n@tempo 120\n" + blues)
```

## The language

```
-- Comments start with two dashes, so # is free for sharps.
@key F#m        -- key for Roman numerals (default C)
@tempo 96       -- beats per minute (default 96)
@inst piano     -- piano, epiano, pad, guitar, bass or organ (default piano)
@beats 4        -- beats in each line (default 4)
@octave 3       -- octave chords are voiced in, 0-8 (default 3)
@capo 2         -- guitar only: capo fret, 0-12 (default 0)

Cmaj7 Am7       -- each line is a bar; chords without a length share it evenly
ii V7 | I.h     -- Roman numerals follow @key; | is just for readability
C.q C.q F.h     -- lengths: .w whole, .h half, .q quarter, .e eighth, .s sixteenth
G.q. ~.e        -- a trailing dot makes it dotted; ~ (or _) is a rest
Dm7:3 G7:1      -- :N is an exact number of beats
```

Chords can be written as names (`C`, `F#m`, `Bb7`, `Dm9`, `G7sus4`, `Em7b5`, `C/E`) or as Roman numerals (`I`, `ii`, `V7`, `viio`, `bVII`, `Imaj7`).

## Playground

The same language runs in the composer-nb playground, a notebook-style web app. Its source is in the [`playground/`](https://github.com/pkhambat1/composer-nb/tree/main/playground) folder of the repository.

## Developing

This package lives in the `dsl/` folder of [the repository](https://github.com/pkhambat1/composer-nb). The parser and audio engine are JavaScript (`dsl/js/`), and the Python side (`dsl/python/composer_nb/`) passes cell sources to them through an [anywidget](https://anywidget.dev). Build the widget before installing:

```bash
npm install
npm run build -w dsl
pip install -e "dsl[test]"
pytest dsl
```
