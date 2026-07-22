# CORE_LOOP_RESULTS

**kind:** AUTOMATED  
**run:** `smoke-2026-07-22T04-33-48-905Z`  
**HEAD:** `4a4e9821ffc8a4adabc33c480ee0a98914a810ff`  
**build:** `202607220250 / 05930e624`  
**verdict:** `PASS`

## Cumulative

| Loop | Attempts | Passed | Failed | Recovered | P50 ms | P95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A_cold_launch | 3 | 3 | 0 | 0 | 435 | 1461 |
| B_plan | 3 | 3 | 0 | 0 | 406 | 454 |
| C_training | 3 | 3 | 0 | 0 | 410 | 455 |
| D_domains | 14 | 14 | 0 | 0 | 450 | 1160 |
| E_assistant_inbox | 3 | 3 | 0 | 0 | 447 | 464 |

## Honesty

- Launch success ≠ DOM interaction success.
- Plan Flow A / Training Flow B full mutation: set `KENOS_STABILITY_RUN_FLOW_AB=1` or see dedicated flow harness evidence.
- Paper must remain PARTIAL — never claimed fully integrated.
- Safari chrome / double Dock require Owner visual confirm in dogfood log.
