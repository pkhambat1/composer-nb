# Plugin eval

Measures whether an assistant, given the composer-nb plugin's skills and the MCP server's tools, writes music into the user's notebooks the way the language wants it: saved, valid, fitting the request, derived rather than typed out. The cases and the metrics are in [CASES.md](CASES.md).

## How a run works

- The host is headless Claude Code (`claude -p`) with the real skills from `plugin/`. Its only tools are `Skill` and the server's tools; the widget's own tools are hidden, as a real host hides them.
- The server is this repo's MCP server on `127.0.0.1`, one endpoint per run, with the notebooks in memory (`workspace.ts`). Nothing touches a real account.
- A case starts from one of four account states (`states.ts`). When a notebook is open, the prompt is preceded by the same context text the widget sends.
- After the run, `grade.ts` compares the notebooks before and after and reads the tool calls. One row per run is appended as it finishes.

## Running it

```
npm run eval -- --reps 1 --case h01
npm run eval -- --case 'h*' --concurrency 4
npm run eval -- --dry-run
```

This spends the Claude Code account's usage: every run is a real model session. Use `--dry-run` to see what would run. Options: `--flow`, `--variant` (`baseline` or `v<N>`), `--model`, `--reps`, `--timeout-s`, `--concurrency`, `--case`.

## Results

In `.claude/hillclimb/plugin-writes/<variant>/`: `results.jsonl` (scored rows), `errors.jsonl` (timeouts, harness and grader failures), `traces/<id>_rep<k>.json` (the transcript) and `summary.md`. Running the same command again does only the runs that have no row yet, so failed runs are retried.

## The report

TODO(report)

## Known limits

- Claude Code is the host, not claude.ai or ChatGPT; other hosts may pick tools differently.
- The widget isn't exercised: no cell is drawn, played or edited by a user.
- Only the user's account state at the start is modelled; the website doesn't change notebooks mid-run.
