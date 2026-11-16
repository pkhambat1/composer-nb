# Plugin eval: the cases

One flow: **the user asks for music, the assistant writes it as a cell and saves it** (or, in a few cases, correctly doesn't). 9 cases, 3 runs each. Every pitched case is about chords.

Every case starts from one of three account states. Where a notebook is open, the prompt is preceded by the same context line the widget sends ("The composer-nb notebook … is open. Notebook ID …, revision …, N cells. Cell k selected …").

| State    | What the account holds                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `empty`  | No notebooks                                                                                                                                                                                     |
| `cycle`  | "Minor cycle" open: one cell with `set key A`, `set mode minor`, `chords pair = 1m7 fourth(1m7)`, `chords cycle = pair\|second(pair, -1)\|second(pair, -2)\|5dom7 -`, `play piano: chords cycle` |
| `broken` | "Scratch" open: a cell reading `play piano: Am F` (the `chords` keyword is missing), selected                                                                                                    |

## The cases

`derive` = the chords must come from a small seed and the language's interval functions, by degree. `literal` = the user named exact chords, so typing them is right. `—` = not a pitched-writing case.

| id  | group    | state  | harmony | expected                                                                                   |
| --- | -------- | ------ | ------- | ------------------------------------------------------------------------------------------ |
| h01 | harmony  | empty  | derive  | F# minor, piano, 8 bars                                                                    |
| h02 | harmony  | empty  | derive  | Bb major, piano, at least 4 bars                                                           |
| h05 | harmony  | empty  | derive  | D minor, piano chords; bars 3–4 are bars 1–2 a third higher; bars 5–6 are bars 1–2 again   |
| h10 | harmony  | empty  | derive  | G minor, piano chords answered by the same chords a fifth up on organ                      |
| h13 | harmony  | empty  | derive  | A, 12 bars, piano, every chord a dominant seventh, roots A, D and E                        |
| h15 | harmony  | empty  | derive  | 2m7 5dom7 1maj7 sounding in C, F and Bb from one chart                                     |
| l01 | literal  | empty  | literal | Am, F, C, G on piano, one bar each                                                         |
| w02 | workflow | cycle  | derive  | a new cell playing the cycle's seven chords a fourth higher on organ; first cell untouched |
| w06 | workflow | broken | —       | the broken cell fixed in place (`chords` added), no new cell                               |

## The prompts

### h01

```
write me a moody piano progression in F# minor, 8 bars, slow
```

### h02

```
jazzy piano chords in Bb. not just ii V I on repeat
```

### h05

```
a 2 bar chord pattern on piano in D minor, then the same pattern a third higher, then back down
```

### h10

```
two keyboards in G minor: piano plays 2 bars of chords, then organ answers with the same chords a fifth up
```

### h13

```
12 bar blues in A on piano, all dominant sevenths
```

### h15

```
a ii V I in C, then in F, then in Bb, on piano
```

### l01

```
play Am F C G on piano, one bar each, exactly those chords
```

### w02 (state: cycle)

```
add a cell that plays the cycle a fourth higher on organ
```

### w06 (state: broken)

```
my cell has an error, fix it
```

## What each run is scored on

All of it is computed from two things each run leaves behind: the notebooks as the run left them, and the list of tool calls with their arguments and results. No model judges anything.

| metric                    | kind                    | what it measures                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pass`                    | yes/no, headline        | all of: `saved`, `fits`, `harmony` where it applies, at most one failed write, no redundant calls                                                                                                                                                                                                                                                                                                                                                 |
| `saved`                   | yes/no                  | the account ends as the case expects (the right cell added or changed, nothing else touched), and the cell parses with no errors and plays                                                                                                                                                                                                                                                                                                        |
| `fits`                    | yes/no                  | the saved cell's key, mode, tempo, meter, instruments and length are what was asked, read back through the engine                                                                                                                                                                                                                                                                                                                                 |
| `harmony`                 | yes/no                  | `derive` cases, all of: no letter-named chords; at least one interval function (`fourth`, `fifth`, `sixth` …), or one named chart sounding under two keys or modes; the chords typed are at most half of the chords that sound; no notes stacked to stand in for a chord; transposing `set key` moves every pitch; the chords aren't 1 5 6 4, 1 6 4 5 or 6 4 1 5. `literal` cases: the exact chords asked for sound, as chords, not stacked notes |
| `typed_ratio`             | 0 to 1, lower is better | chords and notes typed, divided by chords and notes that sound. A chart typed chord by chord is 1.0; the harmony skill's own example is about 0.4                                                                                                                                                                                                                                                                                                 |
| `first_try`               | yes/no                  | the first write call saved with no errors                                                                                                                                                                                                                                                                                                                                                                                                         |
| `failed_writes`           | count                   | write calls the server refused for language errors                                                                                                                                                                                                                                                                                                                                                                                                |
| `dsl_errors`              | count                   | error lines across every refused write and failed parse                                                                                                                                                                                                                                                                                                                                                                                           |
| `redundant_calls`         | count                   | `parse` before a save; `list_notebooks`, `get_notebook` or `open_notebook` before writing to an empty account; `open_notebook` after a save                                                                                                                                                                                                                                                                                                       |
| `tool_calls`              | count                   | every tool call in the run                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `lookups`                 | count                   | `reference`, `library` and skill loads: reported, not penalised                                                                                                                                                                                                                                                                                                                                                                                   |
| `latency_s`, tokens, cost | numbers                 | how long and how much the run took                                                                                                                                                                                                                                                                                                                                                                                                                |

Considered and left out for now:

- **Whether it sounds good or matches a word like "moody".** That needs ears or a model judge, and a judge's taste is the least trustworthy part of an eval. Can be added later as a separate column.
- **The widget's rendering and sync.** Covered by the vitest suites in `mcp/tests`.
- **ChatGPT as the host.** It can't be driven headless from here.
