# composer-nb

**Sketch music like you write code.** Drums, riffs and chords in a small language you can read at a glance. Run a cell and hear it, with a grid of what plays, chord shapes for guitar, and a WAV to keep. It runs in your browser, and right inside Jupyter.

**[Open the playground →](https://composer-nb.vercel.app)** · **[Docs](https://pkhambat.mintlify.site)** · `pip install composer-nb`

<p align="center">
  <img src="docs/images/playground.png" width="820" alt="The composer-nb playground running a cell: guitar chords and a bass line over a drum pattern, with a waveform player, a grid of the steps and chord diagrams">
</p>

## How a cell reads

Every line starts by saying what it is: a setting, a name with its type, an instrument and what it plays, or `play`. Nothing makes a sound unless it's inside a `play`.

<p align="center">
  <img src="docs/images/how-a-cell-reads.svg" width="820" alt="A cell with each kind of line labelled: a setting, a named pattern, drum lines, play, chords, and a pattern played by name">
</p>

## Patterns repeat until they line up

Everything in a pattern repeats until the pattern ends. Give lines different lengths and they drift against each other, so odd meters and polyrhythms take a line each:

```
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

<p align="center">
  <img src="docs/images/lines-line-up.svg" width="820" alt="A step grid in 7 over 8: the kick and snare repeat every 7 steps and the ride bell every 3, lining up again after 21 steps">
</p>

A play is a timeline: its own lines play once, so the crash hits once while the groove repeats under it. Anything that repeats has to fit what it's in, and if it doesn't, the error says where it lines up.

## Notes go on the same steps

A guitar, piano or bass gets a line like a drum's, with a note where the drum has its `x`. `-` lets the note ring, `_` stops it, and a space goes between two notes that would otherwise touch (`F# E`). This riff is ten steps against the drums' seven and three, so it drifts too, and with no lengths written the pattern lasts until all four lines meet. `octave 2` puts it on the guitar's low E string:

```
time 7 over 8
octave 2

pattern groove = {
  kick: x--x---
  snare: ----x--
  ride.bell: x--
  guitar.electric: E---F# E-E--
}

play {
  crash: 1
  groove
}
```

Chords are written by the bar, on their instrument's line with `chords` in front: `piano: chords Am F|C G`.

## Name the bar where something happens

A drum's line is a picture of time (`x--x---`), or the beats it hits on (`2e 4`). Either way it repeats in every bar. For something that happens in one bar only, like a lift at the end of a groove, put the bar in front of it. And instead of counting out a long run of `-`, put a length in front of `rest`:

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
  <img src="docs/images/one-bar-only.svg" width="820" alt="A groove whose lines repeat in both bars, with a bar 2 block that adds a ghost-note burst, an open hi-hat and a pedal close in bar 2 only">
</p>

## In Jupyter

```bash
pip install composer-nb
```

```python
%load_ext composer_nb
```

Then start a cell with `%%music`. Each `play` gives a player, a waveform, a grid of the drums and notes, and the chords it heard, and Tab completes as you type. Named cells carry their settings and names into later ones. See the [docs](https://pkhambat.mintlify.site) for the full language and Python reference.

## What's here

| Folder        | What it is                                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dsl/`        | The language. `dsl/js/` has the parser, chord builder and audio renderer. `dsl/python/` is the [`composer-nb`](dsl/README.md) Python package, which plays the language in Jupyter notebooks. `dsl/js/music.js` is the `composer-nb` npm package, which plays it in Observable notebooks and web pages. |
| `playground/` | A notebook-style web app for writing the language and hearing it. It uses `dsl/` as a package, so both always run the same parser.                                                                                                                                                                     |
| `docs/`       | The [docs site](https://pkhambat.mintlify.site): `.mdx` pages and `docs.json`, built by [Mintlify](https://mintlify.com). Also the images in these READMEs.                                                                                                                                            |

## Working on it

```bash
npm install     # installs both folders (npm workspaces)
npm run dev     # playground at http://localhost:5173
npm test        # language tests
npm run lint
npm run build   # builds the notebook widget, the npm bundle and the playground
npm run docs    # docs site preview at http://localhost:3000
```

The Python package needs the widget built first:

```bash
npm run build -w dsl
pip install -e "dsl[test]"
pytest dsl/tests/python
```

## Releasing the Python package

Releases go to [PyPI](https://pypi.org/project/composer-nb/) from GitHub Actions ([`publish.yml`](.github/workflows/publish.yml)), so no API tokens are stored anywhere.

One-time setup, on [pypi.org](https://pypi.org/manage/account/publishing/): add a pending trusted publisher with project `composer-nb`, owner `pkhambat1`, repository `composer-nb`, workflow `publish.yml` and environment `pypi`.

For each release:

1. Bump `version` in `dsl/pyproject.toml` and merge it to `main`.
2. Create a GitHub release with a tag that matches, like `v0.1.0`.

The workflow builds the widget and the package, checks that the tag matches the version, and uploads it to PyPI.

## Releasing the JavaScript package

The player is also an npm package, [`composer-nb`](https://www.npmjs.com/package/composer-nb), for Observable notebooks and web pages. It's published by hand, after `npm login`:

1. Bump `version` in `dsl/package.json`.
2. Run `npm publish -w dsl`. It builds the bundle first, and asks you to sign in with your passkey in the browser.

## Releasing the docs

The docs site is built by [Mintlify](https://mintlify.com) from the [`docs/`](docs) folder. Pages are `.mdx` files and the navigation is in [`docs/docs.json`](docs/docs.json). Every merge to `main` deploys it.

Mintlify publishes every `.md` and `.mdx` file in `docs/`, whether or not it is in the navigation. Folders that aren't pages are listed in [`docs/.mintignore`](docs/.mintignore).

The `composer-nb` examples in the pages are parsed by `npm test` ([`dsl/tests/js/docs.test.js`](dsl/tests/js/docs.test.js)), so a page that falls behind the language fails CI.

## Releasing the playground

The playground is a static site on [Vercel](https://vercel.com), built from this repository. Its build settings are in [`vercel.json`](vercel.json): it builds the `playground` workspace and serves `playground/dist`.

The Vercel project is `composer-nb`, served at [composer-nb.vercel.app](https://composer-nb.vercel.app). There is nothing to do for each release: every merge to `main` deploys the playground, and every pull request gets a preview link.
