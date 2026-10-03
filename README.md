# composer-nb

A small language for chords and drums, and a notebook to hear them in. Try it at [composer-nb.vercel.app](https://composer-nb.vercel.app).

```
// what happens now: crash once, the groove looping under it
time 7 over 8

pattern groove = 3 bars {
  kick: loop x--x---
  snare: loop ----x--
  ride.bell: loop x--
}

play 6 bars {
  crash: 1
  loop groove
}
```

## What's here

| Folder        | What it is                                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dsl/`        | The language. `dsl/js/` has the parser, chord builder and audio renderer. `dsl/python/` is the [`composer-nb`](dsl/README.md) Python package, which plays the language in Jupyter notebooks. |
| `playground/` | A notebook-style web app for writing the language and hearing it. It uses `dsl/` as a package, so both always run the same parser.                                                           |
| `docs/`       | Design notes and screenshots.                                                                                                                                                                |

## Working on it

```bash
npm install     # installs both folders (npm workspaces)
npm run dev     # playground at http://localhost:5173
npm test        # language tests
npm run lint
npm run build   # builds the notebook widget and the playground
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

## Releasing the playground

The playground is a static site on [Vercel](https://vercel.com), built from this repository. Its build settings are in [`vercel.json`](vercel.json): it builds the `playground` workspace and serves `playground/dist`.

The Vercel project is `composer-nb`, served at [composer-nb.vercel.app](https://composer-nb.vercel.app). There is nothing to do for each release: every merge to `main` deploys the playground, and every pull request gets a preview link.
