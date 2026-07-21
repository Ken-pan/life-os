# DAILY_LOG — iOS Stability

Mark each entry AUTOMATED or OWNER_DOGFOOD. Do not fabricate calendar days.

## 2026-07-21

| time (UTC) | kind | entry | action | result | notes |
| --- | --- | --- | --- | --- | --- |
| 17:15 | AUTOMATED | closure#1 | rebuild HEAD + preflight/smoke/soak | smoke FAIL (transient inbox CoreDevice 10004) | soak/doctor PASS |
| 17:19 | AUTOMATED | closure#2 | retry launch + soak | AUTOMATED PASS | P1 LAN IP residual |
| 17:21–17:23 | AUTOMATED | Flow A/B | diagnose sync clobber | Flow A FAIL_PLANNER_SYNC_CLOBBER; Flow B PASS | product bug found |
| 17:24 | AUTOMATED | Flow A/B | after migrate LWW fix | Flow A PASS; Flow B PASS | |
| 17:25 | AUTOMATED | closure#3 | final smoke/soak | AUTOMATED PASS | Owner 3-day still OPEN |
