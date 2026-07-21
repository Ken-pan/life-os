# SMOKE_TEST_REPORT

Stable release targets: `5219` / `5188` / `5190` (static, launchd).
Raw: `daily-beta-smoke-raw.json` · **PASS true**

| Flow              | Expected                                                 | Actual                                 | Status   |
| ----------------- | -------------------------------------------------------- | -------------------------------------- | -------- |
| FLOW1 Cold launch | Static health + `local-daily-beta` meta; not Vite `/src` | All UP; release meta OK                | **PASS** |
| FLOW2 Planner     | Today → Planner editor → mutate → Continue CTA → Today   | titleCount=1, mutated, cont, backToday | **PASS** |
| FLOW3 Fitness     | Set1→Set2 progress; Continue CTA                         | set1/set2/cont OK                      | **PASS** |
| FLOW4 Isolation   | A Recent; B no leak                                      | aHas, !bLeak                           | **PASS** |
| FLOW5 Degraded    | Fitness killed; Kenos Today still loads                  | aiosUp, fitDown, today                 | **PASS** |
| FLOW6 Restart     | `kenos-restart` all healthy                              | ok                                     | **PASS** |
| FLOW7 Continue UI | Open + Escape                                            | open1                                  | **PASS** |
| FLOW8 Rollback    | previous↔current both healthy                            | afterRb + restored                     | **PASS** |

Owner Review rehearsal shots: `shots/today-390.png`, `today-1440.png`, `spaces-1440.png`, `inbox-1440.png` (+ Continue covered by FLOW7).

Doctor: see `doctor.txt` (**PASS**).
