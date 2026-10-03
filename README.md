# composer-nb

A small language for chords and drums, and a notebook to hear them in.

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

One-time setup, on [vercel.com/new](https://vercel.com/new): import the `pkhambat1/composer-nb` repository and deploy it, leaving the root directory and build settings as they are.

After that there is nothing to do for each release. Every merge to `main` deploys the playground, and every pull request gets a preview link.
