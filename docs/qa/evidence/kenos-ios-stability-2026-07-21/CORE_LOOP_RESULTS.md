# CORE_LOOP_RESULTS

**kind:** AUTOMATED
**run:** `smoke-2026-07-21T17-36-09-337Z`
**HEAD:** `de41869aecbce0201036288bba49ebdd4b59c208`
**build:** `202607211735 / de41869ae`
**verdict:** `PASS`

## Cumulative

| Loop | Attempts | Passed | Failed | Recovered | P50 ms | P95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A_cold_launch | 3 | 3 | 0 | 0 | 235 | 1068 |
| B_plan | 3 | 3 | 0 | 0 | 269 | 505 |
| C_training | 3 | 3 | 0 | 0 | 259 | 481 |
| D_domains | 14 | 14 | 0 | 0 | 222 | 529 |
| E_assistant_inbox | 3 | 3 | 0 | 0 | 292 | 312 |

## Honesty

- Launch success ≠ DOM interaction success.
- Plan Flow A / Training Flow B full mutation: set `KENOS_STABILITY_RUN_FLOW_AB=1` or see dedicated flow harness evidence.
- Paper must remain PARTIAL — never claimed fully integrated.
- Safari chrome / double Dock require Owner visual confirm in dogfood log.
