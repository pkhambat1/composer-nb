# Eval summary: baseline

Attempts run: 27. Rows scored: 27. Errors: none.

## Metrics (mean over cases, 95% interval)
- pass: 0.556 ± 0.267 (n=9 cases)
- saved: 1.000 ± 0.000 (n=9 cases)
- fits: 1.000 ± 0.000 (n=9 cases)
- harmony: 0.542 ± 0.301 (n=8 cases)
- first try: 0.704 ± 0.230 (n=9 cases)
- typed ratio: 0.528 ± 0.227 (n=8 cases)

## Per run
- tool calls: 2.81
- failed writes: 0.41
- DSL errors: 0.59
- redundant: 0.04
- lookups: 1.33
- tool errors: 0.44
- latency: 17.29
- cost: 0.0561

Total measured cost: $1.5141. Total wall time: 466.8 s.

## By group

| group | runs | pass | saved | fits | harmony | first try | typed ratio | tool calls | failed writes | DSL errors | redundant | lookups | tool errors | latency | cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| harmony | 18 | 0.389 | 1.000 | 1.000 | 0.389 | 0.722 | 0.537 | 3.17 | 0.44 | 0.67 | 0.00 | 1.67 | 0.44 | 21.90 | 0.0628 |
| literal | 3 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 2.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0.00 | 6.83 | 0.0462 |
| drums | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| workflow | 6 | 0.833 | 1.000 | 1.000 | 1.000 | 0.500 | 0.000 | 2.17 | 0.50 | 0.67 | 0.17 | 0.50 | 0.67 | 8.69 | 0.0408 |
