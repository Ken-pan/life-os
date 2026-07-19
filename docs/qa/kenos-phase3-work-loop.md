---
title: Kenos Phase 3 Work loop QA
owner: kenpan
last_verified: 2026-07-19
status: work-loop-foundation-ready
---

# Kenos Phase 3 — Work loop foundation QA

## Verdict target

`WORK_LOOP_FOUNDATION_READY` under `LOCAL_BETA_IN_PROGRESS_NO_PRODUCTION_CUTOVER`.

## Desktop / mobile checklist

| Check | Evidence |
| --- | --- |
| Today Work section shows owner/source/freshness/deep link/classification/action capability | `/` with `?kenosDemo=1` |
| Work overview shows goal / next deliverable / blocked / decisions / proposals | `/work?kenosDemo=1` |
| Create task requires explicit click; simulation banner; no production write | proposal card button |
| Empty / unsupported states when flag Off | `/work` without demo/flag |
| 390×844 layout readable; focusable Create task / refresh | browser QA |
| Keyboard: tab to Create task and activate | browser QA |

## Automated

- contracts corpus + Swift parity
- `workCommand.core.test.js`
- disposable Work DB/RLS (`check-kenos-phase3-work-db.mjs`)
- `check-kenos-phase1/2/3.mjs`
- AIOS test/check/build

## Non-claims

No production apply, Executor, Connector auto-write, Plan Task dual writer, Phase 4/5.
