---
title: KENOS AIOS READ-ONLY MAINTENANCE PACKET
owner: kenpan
last_verified: 2026-07-19
status: KENOS AIOS READ-ONLY MAINTENANCE PACKET — READY
---

# KENOS AIOS READ-ONLY MAINTENANCE PACKET

**Not authorized by Planner compatibility deploy.** This packet only prepares a
future AIOS-only maintenance redeploy.

## Verdict

**`KENOS AIOS READ-ONLY MAINTENANCE PACKET — READY`**

## Why

Planner Compatibility Canary shipped shared AIOS fixes that production AIOS does
**not** yet include:

| Fix | In code since | On AIOS prod (`6a5d5003…` / `f87336224…`) |
| --- | ------------- | ----------------------------------------- |
| Optional Focus deferred/suggestions capability + skip network when unavailable | `02aed2a92…` | **No** |
| Product degraded copy (empty / unavailable / degraded / …) | `02aed2a92…` | **No** |

Evidence: Observation Yellow was GET 400 on `kenos_deferred_items` /
`kenos_proactive_suggestions` wrong-column selects. Fixed on
https://aios-kenos-read-canary.netlify.app (`6a5d5bdd654fcb52b5d4f7c3`).

## Recommended maintenance SHA

Use a `git archive` tip that contains Focus side-read + copy fixes and has CI
PASS. Candidate ancestors: `02aed2a92…` or later docs/test-only tips that do not
change AIOS write semantics.

## Bake (same as current prod read-only)

```text
VITE_AIOS_CLOUD=1
VITE_KENOS_READ_CANARY=1
VITE_KENOS_PROD_READ_FOCUS=1
VITE_KENOS_PROD_READ_WORK=1
VITE_KENOS_PROD_READ_TODAY_OVERLAY=1
VITE_KENOS_PROD_SHADOW=1
# optional sides: omit or set VITE_KENOS_PROD_READ_FOCUS_DEFERRED=0 /
# VITE_KENOS_PROD_READ_FOCUS_SUGGESTIONS=0 to force unavailable without network
```

Writers remain fail-closed. No schema/migration. No conversation persistence
re-enable.

## Rollback

Previous published: `6a5d500302c73442caf47132` (or confirm live before apply).

## Exact future approval phrase (not this task)

`APPROVE_KENOS_AIOS_READ_ONLY_MAINTENANCE_REDEPLOY`

## Explicit non-goals

- Not part of Planner production deploy
- Do not restore auto-builds
- Do not deploy other sites
