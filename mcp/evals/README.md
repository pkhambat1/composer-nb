# Plugin eval

Measures whether an assistant, given the composer-nb plugin's skills and the MCP server's tools, writes music into the user's notebooks the way the language wants it: saved, valid, fitting the request, derived rather than typed out. The cases and the metrics are in [CASES.md](CASES.md).

## How a run works

- The host is headless Claude Code (`claude -p`) with the real skills from `plugin/`. Its only tools are `Skill` and the server's tools; the widget's own tools are hidden, as a real host hides them.
- The server is this repo's MCP server on `127.0.0.1`, one endpoint per run, with the notebooks in memory (`workspace.ts`). Nothing touches a real account.
- A case starts from one of three account states (`states.ts`). When a notebook is open, the prompt is preceded by the same context text the widget sends.
- After the run, `grade.ts` compares the notebooks before and after and reads the tool calls. One row per run is appended as it finishes.

## Running it

```
npm run eval -- --reps 1 --case h01
npm run eval -- --case 'h*' --concurrency 4
npm run eval -- --dry-run
```

This spends the Claude Code account's usage: every run is a real model session. Use `--dry-run` to see what would run. Options: `--flow`, `--variant` (`baseline` or `v<N>`), `--model`, `--reps`, `--timeout-s`, `--concurrency`, `--case`.

## Results

In `.claude/hillclimb/plugin-writes/<variant>/`: `results.jsonl` (scored rows, calls and before/after notebooks), `errors.jsonl` (timeouts, harness and grader failures), `traces/<id>_rep<k>.json` (the transcript), `run.json` (model and source fingerprint) and `summary.md`.

Running the same command again does only runs that have no result row. Completed model failures remain in the scores, including truncated answers; only harness/grader failures are retried. Truncated answers and missing runs produce a nonzero exit code. A musical failure is a completed measurement: inspect `grade.pass` and `explanation` rather than using the exit code as its score.

An account usage limit stops further scheduling and records the host's explanation. Runs already in flight may still finish. Resume after the limit resets, using a new variant if source changed meanwhile.

Use a new `--variant` or `--flow` after changing the model, plugin, engine, context or grader. The runner refuses to mix different configurations, or unversioned historical results, in one variant. `--variant` names an output directory; it does not check out baseline code for you.

## The report

`summary.md` reports observed means weighted equally by case, plus per-run tool calls, errors, latency and cost. These small, fixed-case measurements are not confidence bounds or a claim about every musical request. Costs include recorded failed attempts; summed run time is not wall time when cases run concurrently.

The grader has negative tests for wrong tempo, missing chords, wrong rhythm or chord tones, and unwanted extra cells. A valid pattern reused under explicit keys and the implicit default key must pass. Unused interval calls do not count as deriving sounding chords.

Historical runs can be rescored from their saved notebooks and tool-call transcripts without another model call. Compare both variants with the same grader; scores from different grader versions are not directly comparable.

See [the November 15 review](REVIEW.md) for corrected historical scores and the verification limits of this change.

## Known limits

- Claude Code is the host, not claude.ai or ChatGPT; other hosts may pick tools differently.
- The widget isn't exercised: no cell is drawn, played or edited by a user.
- Only the user's account state at the start is modelled; the website doesn't change notebooks mid-run.
