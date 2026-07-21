# A — PERSONAL DAILY BETA READY

```text
A — PERSONAL DAILY BETA READY
OWNER_REVIEW_REHEARSAL: PASSED
DAILY ENTRY: http://127.0.0.1:5219/
BUILD SHA: aff9303903c10752c0ea6ca657a1da36442d6d12
STARTUP: PASS
PLANNER: PASS
FITNESS: PASS
ISOLATION: PASS
DEGRADED MODE: PASS
RESTART: PASS
ROLLBACK: PASS
P0/P1: NONE
```

## What A means

Kenos is the default personal homepage on this machine:

- Today / Continue / Spaces / Inbox usable on stable local release
- Planner + Fitness Continuity work on local origins (not temporary Vite DEV)
- Login auto-start via user LaunchAgents
- Diagnose / restart / rollback without deleting data

## What A does **not** mean

- All domains migrated
- Old systems retired
- Production GA
- Money / Music / Knowledge / Home / Work fully switched

## Gates reused

| Gate | Status |
| ---- | ------ |
| Visual Quality | PASSED (P5 Final Audit) |
| Current-HEAD Continuity | PASSED (`…T01-39-14-798Z`) |
| Owner Review rehearsal | PASSED (this package) |
| Functional canonical | FROZEN `…T20-12-22-998Z` |

## Commands

```bash
bash scripts/kenos-daily-beta/bin/kenos-start
bash scripts/kenos-daily-beta/bin/kenos-stop
bash scripts/kenos-daily-beta/bin/kenos-restart
bash scripts/kenos-daily-beta/bin/kenos-status
bash scripts/kenos-daily-beta/bin/kenos-doctor
bash scripts/kenos-daily-beta/bin/kenos-rollback
```

Or: `bash scripts/kenos-daily-beta/kenos-ctl.sh <cmd>`

## Evidence index

- `daily-beta-results.json`
- `SERVICE_MAP.md`
- `START_STOP_ROLLBACK.md`
- `SMOKE_TEST_REPORT.md`
- `DATA_SAFETY_REPORT.md`
- `screenshot-manifest.json`
- `known-residuals.md`
- `doctor.txt`
- `shots/`
