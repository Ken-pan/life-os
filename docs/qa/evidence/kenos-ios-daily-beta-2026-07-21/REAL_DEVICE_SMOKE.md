# REAL_DEVICE_SMOKE — Ken’s 17 Pro

**run_id:** `unlocked-full-smoke-2026-07-21T03:27Z`
**HEAD SHA:** `d8ec099ca92055bda74bc0b41bacc5708b303348`
**app:** `space.kenos.app.ios` `1.0.0` / `20260721` (stamp `202607210317`)
**origin:** `http://10.20.202.15:5219`
**phone:** `10.20.202.6`

## Results

| Flow | Expected | Actual | Exit | Evidence |
| --- | --- | --- | --- | --- |
| Cold launch Today | App opens shell `/` | launch ec=0 + phone GET `/` 200 | **PASS** | `logs/today-launch.txt`, `logs/today-traffic.txt` |
| Spaces | `/spaces` loads | phone GET `/spaces` 200 | **PASS** | `logs/spaces-traffic.txt` |
| Inbox | `/inbox` loads | phone GET `/inbox` 200 | **PASS** | `logs/inbox-traffic.txt` |
| Settings | `/settings` loads | phone GET `/settings` 200 | **PASS** | `logs/settings-traffic.txt` |
| Planner Continuity | `:5188/schedule` | phone GET `/schedule` 200 | **PASS** | `logs/planner-seq-traffic.txt` |
| Fitness Continuity | `:5190/` | phone GET `/` + exercise asset 200 | **PASS** | `logs/fitness-seq-traffic.txt` |
| Auth (Supabase session) | LocalStorage/cookies have session | none — SDK literals only | **FAIL** | `logs/auth-verdict-redacted.json` |
| FLOW A Plan edit+persist | Owner edits task, relaunch keeps it | not run (blocked on Auth) | **BLOCKED** | — |
| FLOW B Training set resume | Set 1→Continue Set 2 | not run (blocked on Auth) | **BLOCKED** | — |
| FLOW C Account B isolation | B hides A recents | not run on device | **BLOCKED** | Mac Continuity unit isolation retained; phone Account B pending |

## Notes

- Screenshots via `idevicescreenshot` unavailable over wireless CoreDevice (`No device found`); traffic logs are primary proof.
- Native shell + LAN Web path is live; Daily Beta claim remains blocked on owner Auth + interactive Plan/Training/Account B.
