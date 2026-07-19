---
title: KENOS AIOS PRODUCTION READ-ONLY REDEPLOY REPORT
owner: kenpan
last_verified: 2026-07-19
status: KENOS AIOS PRODUCTION READ-ONLY CLIENT — REDEPLOYED_AND_VERIFIED
---

# KENOS AIOS PRODUCTION READ-ONLY REDEPLOY REPORT

**Phrase:** `APPROVE_KENOS_AIOS_PRODUCTION_READ_ONLY_REDEPLOY`

## Status phrase

**`KENOS AIOS PRODUCTION READ-ONLY CLIENT — REDEPLOYED_AND_VERIFIED`**

---

## 1. Exact redeploy SHA

`AIOS_READ_ONLY_REDEPLOY_SHA=f87336224a4cb8c934aa90fd0819bb26a1e5f795`

Contains (verified in `git archive` of that commit):

- Spaces unique-key / `listKey` fix
- route/UI consistency (Spaces · Work under Spaces; Focus not primary tab)
- offline App Shell / reconnect code
- Global / Work Assistant scope chip
- conversation memory-only enforcement (cloud/canary)
- logout `aios_memory_*` clearing
- auth-wall title `Kenos — Sign in`

`origin/master` tip after freeze was docs-only vs apps/packages. Deploy used
**freeze SHA archive**, not dirty working tree and not tip.

## 2. Canary deploy / SHA correspondence

| Item                   | Value                                                    |
| ---------------------- | -------------------------------------------------------- |
| Final Canary deploy    | `6a5d4bf71702873dee82b865`                               |
| Reported Canary source | `f87336224` → `f87336224a4cb8c934aa90fd0819bb26a1e5f795` |
| Canary verdict         | `KENOS AIOS READ-ONLY CLIENT — FINAL_CANARY_PASS`        |

No `AIOS_READ_ONLY_REDEPLOY_SHA_MISMATCH`.

## 3. CI result

https://github.com/Ken-pan/life-os/actions/runs/29705748129 — **success** on
`f87336224a4cb8c934aa90fd0819bb26a1e5f795`

Wave 1 migration sha256 unchanged (five `20260719130*` files PASS).

## 4. Production deploy ID

`6a5d500302c73442caf47132`

- URL: https://aios-kenos.netlify.app
- Unique: https://6a5d500302c73442caf47132--aios-kenos.netlify.app
- Created: `2026-07-19T22:30:27.054Z`
- Published: yes

## 5. Previous deploy / rollback target

| Role                | Deploy ID                  |
| ------------------- | -------------------------- |
| Previous published  | `6a5c617ee8396b00089a6d2e` |
| **Rollback target** | `6a5c617ee8396b00089a6d2e` |

## 6. Deployment method

```text
git archive f87336224a4cb8c934aa90fd0819bb26a1e5f795 | tar -x -C /tmp/...
VITE_AIOS_CLOUD=1 VITE_KENOS_READ_CANARY=1 \
VITE_KENOS_PROD_READ_FOCUS=1 VITE_KENOS_PROD_READ_WORK=1 \
VITE_KENOS_PROD_READ_TODAY_OVERLAY=1 VITE_KENOS_PROD_SHADOW=1 \
npm run build -w aios-os

CI=1 npx netlify deploy --prod --no-build \
  --site=5bfa64b2-7108-479d-b9e2-45f9c4d9f791 \
  --filter aios-os --dir=apps/aios/build
```

## 7. Environment read-only configuration

Build-time Vite bake (same as FINAL canary):

| Semantic                 | Evidence                                   |
| ------------------------ | ------------------------------------------ |
| Read client / canary     | CDN `VITE_KENOS_READ_CANARY:`1``           |
| Cloud viewer             | CDN `VITE_AIOS_CLOUD:`1``                  |
| Domain writes            | not enabled; `KENOS_WRITE_BLOCKED` present |
| Executor / writer canary | disabled                                   |
| Conversation persist     | memory-only / blocked                      |
| Service-role in browser  | absent                                     |

## 8. Today result

**PASS**

## 9. Spaces / Work result

**PASS** — no `each_key_duplicate`; Work under Spaces; Focus not fifth tab

## 10. Global scope result

**PASS** — `Scope: All Kenos` (also after Owner re-login)

## 11. Context scope result

**PASS** — `Scope: Work`; return to Global restores `All Kenos`

## 12. Inbox / Focus result

**PASS**

## 13. Write fail-closed result

**PASS**

## 14. Conversation rows before / after

| When                              | count  | max_updated     |
| --------------------------------- | ------ | --------------- |
| Throughout Owner smoke + re-login | **13** | `1784495383529` |

OWNER SMOKE row untouched; not deleted.

## 15. Domain mutation audit

Kenos Focus / Work / Approval / Outbox counts remain **0**. No conversation
upsert; no Task/Focus/Approval/Work/Outbox/Executor mutations from AIOS smoke.

## 16. Logout / memory result

**PASS** — `aios_chats_v1` cleared; `aios_memory_*` cleared; device `aiosos_v1`
retained

## 17. Auth-wall title result

**PASS** — `Kenos — Sign in`

## 18. Relogin result

**PASS** (Owner re-authenticated)

- Today loads without auth wall
- Global chip `Scope: All Kenos` (not stuck on Work)
- No `SMOKE_PROOF` in UI
- No `OWNER SMOKE` visible in Assistant list (empty local/read-only chats:
  「还没有对话」)
- `aios_chats_v1` remains null until new local memory-only activity

## 19. Offline / Reconnect result

**PASS** (authenticated ×1)

| Check                           | Result                                            |
| ------------------------------- | ------------------------------------------------- |
| App Shell                       | present (nav + page)                              |
| Offline banner                  | `当前离线 · 显示已缓存内容；恢复网络后将自动重试` |
| SPA `/` → `/spaces` offline     | Spaces OK; no `each_key_duplicate`                |
| 500 / ERR_INTERNET_DISCONNECTED | none                                              |
| Reconnect                       | banner cleared automatically; no manual refresh   |

## 20. Console / network errors

No deploy-blocking incidents. Stale/unavailable read copy expected.

## 21. Incidents / warnings

Yellow (non-blocking):

- Focus not in global nav
- Live dual-account A→B not re-run on this redeploy
- OWNER SMOKE conversation soft-delete awaits separate approval

## 22. Rollback readiness

**READY** — `6a5c617ee8396b00089a6d2e` (AIOS only)

## 23. AIOS stop_builds status

**true**

## 24. Other six sites status

All `stop_builds=true`; published IDs unchanged (`be6f2612…` family)

## 25. Gallery status

`disabled_manually`

## 26. Production DB status

Tip `20260719130500`; no new migration; writers closed

## 27. Remaining Red / Yellow gates

| Gate                               | Severity                   |
| ---------------------------------- | -------------------------- |
| Focus global-nav absence           | Yellow                     |
| Dual-account isolation interactive | Yellow                     |
| OWNER SMOKE conversation cleanup   | Yellow (separate approval) |

No Red gates blocking this redeploy verdict.

## 28. Production observation readiness

**YES** — observe conversation count=13, Kenos domain zeros, `stop_builds`,
published deploy `6a5d500302c73442caf47132`.

## 29. Readiness for Planner read-only deploy

**NOT YET** — requires separate Owner approval; keep six-site pause.

## 30. Readiness for writer canary

**NO**

## 31. Exact next recommended approval

Do **not** restore auto-builds, deploy other sites, or start writer canary.

Recommended next (Owner choice, separate phrase):

- `APPROVE_KENOS_PLANNER_PRODUCTION_READ_ONLY_DEPLOY` — only after intentional
  observation window on AIOS; **or**
- observation-only hold on AIOS read-only production; **or**
- separate phrase to soft-delete OWNER SMOKE conversation if desired.

---

## Hosting recheck (task end)

| Check                        | Result                     |
| ---------------------------- | -------------------------- |
| AIOS published               | `6a5d500302c73442caf47132` |
| AIOS + six sites stop_builds | true                       |
| Gallery                      | disabled_manually          |
| Other sites new prod deploys | none                       |
| DB tip                       | `20260719130500`           |
| Writers                      | closed                     |
