# CORE_LOOP_RESULTS

**kind:** AUTOMATED  
**run:** `smoke-2026-07-21T17-25-21-888Z`  
**HEAD:** `71ad6d5f3aca78a1b7985e77061f13fac59afb10`  
**build:** `202607211716 / 71ad6d5f3`  
**verdict:** `PASS`

## Cumulative

| Loop | Attempts | Passed | Failed | Recovered | P50 ms | P95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A_cold_launch | 3 | 3 | 0 | 0 | 261 | 676 |
| B_plan | 3 | 3 | 0 | 0 | 282 | 464 |
| C_training | 3 | 3 | 0 | 0 | 266 | 466 |
| D_domains | 14 | 14 | 0 | 0 | 226 | 517 |
| E_assistant_inbox | 3 | 3 | 0 | 0 | 289 | 308 |

## Honesty

- Launch success ≠ DOM interaction success.
- Plan Flow A / Training Flow B full mutation: set `KENOS_STABILITY_RUN_FLOW_AB=1` or see dedicated flow harness evidence.
- Paper must remain PARTIAL — never claimed fully integrated.
- Safari chrome / double Dock require Owner visual confirm in dogfood log.
