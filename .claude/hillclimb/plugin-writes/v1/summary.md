# Eval summary: v1

Attempts run: 27. Rows scored: 27. Errors: none.

## Metrics (mean over cases, 95% interval)
- pass: 0.889 ± 0.154 (n=9 cases)
- saved: 1.000 ± 0.000 (n=9 cases)
- fits: 1.000 ± 0.000 (n=9 cases)
- harmony: 1.000 ± 0.000 (n=8 cases)
- first try: 0.704 ± 0.254 (n=9 cases)
- typed ratio: 0.347 ± 0.210 (n=8 cases)

## Per run
- tool calls: 3.26
- failed writes: 0.33
- DSL errors: 0.48
- redundant: 0.07
- lookups: 1.37
- tool errors: 0.41
- latency: 23.65
- cost: 0.0636

Total measured cost: $1.7165. Total wall time: 638.4 s.

## By group

| group | runs | pass | saved | fits | harmony | first try | typed ratio | tool calls | failed writes | DSL errors | redundant | lookups | tool errors | latency | cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| harmony | 18 | 0.944 | 1.000 | 1.000 | 1.000 | 0.722 | 0.296 | 3.67 | 0.33 | 0.44 | 0.00 | 1.61 | 0.33 | 31.32 | 0.0728 |
| literal | 3 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 2.33 | 0.00 | 0.00 | 0.00 | 1.33 | 0.00 | 7.34 | 0.0496 |
| drums | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| workflow | 6 | 0.667 | 1.000 | 1.000 | 1.000 | 0.500 | 0.000 | 2.50 | 0.50 | 0.83 | 0.33 | 0.67 | 0.83 | 8.78 | 0.0430 |
