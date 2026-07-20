---
title: KENOS PLANNER PRODUCTION COMPATIBILITY CANARY REPORT
owner: kenpan
last_verified: 2026-07-20
status: KENOS PLANNER PRODUCTION COMPATIBILITY CANARY — PASS
---

# KENOS PLANNER PRODUCTION COMPATIBILITY CANARY REPORT

**Phrase:** `APPROVE_KENOS_PLANNER_PRODUCTION_COMPATIBILITY_CANARY`

## Status phrase

**`KENOS PLANNER PRODUCTION COMPATIBILITY CANARY — PASS`**

Isolated Planner canary is live with Kenos writers fail-closed and legacy
`planner_*` path preserved. Owner authenticated read, dual-account isolation,
controlled Legacy smoke (create→edit→complete→reopen→delete), logout cleanup,
and offline→reconnect shell survival all closed. No Kenos double-write.

Production Planner / AIOS sites untouched during canary window.

---

## Dual-track boundary (frozen)

| Track                 | Allowed on canary                                                               |
| --------------------- | ------------------------------------------------------------------------------- |
| Legacy Planner Writer | `planner_tasks` / lists / projects / attachments upsert via existing sync       |
| Kenos Read Path       | Capability registry + AIOS Focus/Work/Today read contracts (AIOS canary)        |
| Kenos Writer          | **Blocked** — RPC denylist + Kenos table mutation proxy (`KENOS_WRITE_BLOCKED`) |

Never: Legacy write + Kenos write.

## 1. Exact source SHA

`PLANNER_COMPATIBILITY_CANARY_SHA=64b365ac8135dff9dda06cdde598310b1dac9e12`

(Code-bearing: logout isolation + prior guard/Focus-400 fixes.)

Deploy SHA for production compatibility must match this canary archive.

| Related tip                         | Notes                                      |
| ----------------------------------- | ------------------------------------------ |
| `74470f2fb…`                        | mutation/offline unit tests (CI e2e flaky) |
| `fea77aded…`                        | docs evidence refresh                      |
| AIOS prod `f87336224…` / `6a5d5003` | untouched                                  |

Wave 1 migration sha256 **unchanged** (PASS; tip `20260719130500`).

## 2. CI result

Logout-fix tip `64b365ac8…`:
https://github.com/Ken-pan/life-os/actions/runs/29709101185 — **success**

## 3. Canary URL / deploy ID

| Field                              | Value                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Planner Canary URL                 | https://planner-kenos-compat-canary.netlify.app                              |
| Site ID                            | `72f536f3-2805-4fea-94c4-10e9c3825574`                                       |
| Deploy ID                          | `6a5d678c1967b65603b10ff0`                                                   |
| Source                             | `git archive` `64b365ac8135dff9dda06cdde598310b1dac9e12`                     |
| Access                             | Netlify URL; `noindex` in `app.html`; no custom domain                       |
| Rollback / disable                 | Unpublish / delete site or redeploy empty; production Planner unaffected     |
| AIOS read-canary (Yellow fix)      | https://aios-kenos-read-canary.netlify.app deploy `6a5d5bdd654fcb52b5d4f7c3` |
| Prod Planner published (baseline)  | `6a5c617e6e1b41000893a948`                                                   |
| Prod AIOS published (untouched)    | `6a5d500302c73442caf47132`                                                   |

## 4. Environment model

Planner canary bake:

- `VITE_KENOS_COMPAT_CANARY=1`
- `VITE_KENOS_READ_CANARY=1`
- Kenos writers blocked by default
- Legacy `planner_*` mutations allowed
- No service-role in browser bundle

## 5. Optional capability 400 resolution

**PASS (code + AIOS read-canary)** — Focus side schema alignment; production AIOS
not redeployed in this task.

## 6. Degraded copy resolution

**PASS (shared UI)** — empty / unavailable / degraded / offline / unauthorized /
error without RPC jargon in product labels.

## 7. Planner read paths

**PASS** — Today / Inbox / Projects / Completed / Search / Settings load;
Owner cloud data syncs on canary (~360 live tasks / ~36 projects).

## 8–9. Task identity / Today counts

Covered by Planner unit + E2E. Canary does not introduce a second task identity
writer. Owner Today progress / overdue / inbox badges observed under auth.

## 10. Owner result

**PASS** — Owner authenticated canary read + sync:

- Settings shows Owner email; isolation email absent after Owner re-login
- Live tasks ≈ 360, projects ≈ 36 after sync
- Search / editor / Today shell usable

## 11. Second-account isolation

**PASS**

| Step | Result |
| ---- | ------ |
| Logout Owner | User-scoped tasks cleared (`taskCount=0`); settings shows Login |
| Login fitness-only user (`pettimes666666@gmail.com`) | Planner access denied |
| Non-owner normalize | `allowedApps` forced to fitness-only (`authController`) |
| Observed redirect | Immediate leave canary → `https://portal.netlify.app/` (canary host quirk: `*.netlify.app` → `portal.netlify.app`; production uses `portal.kenos.space`) |
| Owner data leak | **None** — isolation user cannot remain on Planner shell |
| Membership cleanup | Temporary test planner membership removed; fitness-only restored |

## 12. Logout / cache result

**PASS** — logout clears user-scoped tasks/projects/outbox; device settings
preserved; cold-start never-logged-in path not wiped.

## 13. Legacy Writer endpoint

| Target                                                         | Status  |
| -------------------------------------------------------------- | ------- |
| `public.planner_tasks` (+ lists/projects/attachments) upsert   | Allowed |
| `planner_user_state` settings blob upsert                      | Allowed |
| `kenos_create_plan_task_action` / Kenos store\|transition RPCs | Blocked |
| Kenos domain tables insert/update/delete                       | Blocked |
| Local `kenosActionOutbox` / `kenosActivity`                    | Client-local only; not in `exportPayload()` |

## 14–15. Legacy mutation smoke / correlation

| Phase                         | Result |
| ----------------------------- | ------ |
| Phase 1 local/guard           | **PASS** — legacy allowed; Kenos blocked; E2E create/edit/complete/delete ×3 |
| Phase 2 production-data smoke | **PASS** |

Smoke task:

| Field | Value |
| ----- | ----- |
| Title (create) | `KENOS PLANNER COMPAT SMOKE — 2026-07-20T01-32-11Z` |
| Title (edit) | `… EDIT` |
| Legacy row id | `d44b56b1-19e8-491d-b7d9-f4cbb2b94122` |
| Flow | create → edit → complete → reopen → delete |
| Durable tombstone | `deletedAt=1784511229786` on `planner_tasks` after upload |
| Kenos domain totals during/after | **0** |

Note: first delete raced with download merge (cloud non-deleted row reappeared);
second delete + explicit「上传到云端」persisted tombstone. Not a dual-write;
legacy sync merge race only.

## 16. Kenos mutation audit

**PASS** — Kenos RPC/table mutations blocked; domain tables remain 0.

## 17. Duplicate-write result

**PASS** — single legacy sync path; Kenos write path closed.

## 18–19. Read-after-write / shadow mismatches

**PASS for dual-track scope** — smoke row visible only on legacy `planner_tasks`;
no Kenos twin rows.

## 20. Offline / reconnect

**PASS** — offline contract unit tests + authenticated canary:
`navigator.onLine=false` while shell retained; reconnect reload restored
Owner task/project counts (~360 / ~36).

## 21. UI/UX findings

Planner domain IA retained. No Work / Approval / Focus global tabs added.
Canary-only: non-owner portal redirect host resolves to `portal.netlify.app`
(404) — production custom domain unaffected.

## 22. Tests and repeated runs

| Suite                                           | Result                     |
| ----------------------------------------------- | -------------------------- |
| AIOS `node --test` (incl. focusSideReads)       | PASS                       |
| Planner vitest + guard/session/mutation/offline | PASS (163)                 |
| `check-kenos-phase1` / `phase6`                 | PASS                       |
| Wave1 checksum                                  | PASS                       |
| Planner E2E create/edit/complete/delete ×3      | **12/12 PASS**             |
| CI on canary SHA `64b365ac8`                    | **success**                |

## 23. Migration checksum

**PASS** — tip still `20260719130500`; files unchanged.

## 24. Seven-site pause status

All production sites `stop_builds=true` (verified at canary close). Prod Planner
published still `6a5c617e6e1b41000893a948` until compatibility deploy.

## 25. Gallery status

`disabled_manually`

## 26. Incidents / warnings

- No Red / no STOPPED_AND_INCIDENT
- Yellow residual (non-blocking for Planner compat deploy): Production AIOS still
  on pre-Focus-fix deploy until separate redeploy approval
- Canary portal redirect URL quirk on `*.netlify.app` (documented)

## 27. Remaining Red / Yellow gates

| Gate                          | Severity                         |
| ----------------------------- | -------------------------------- |
| Prod AIOS yellow-fix redeploy | Yellow (separate phrase)         |
| Kenos Writer canary           | **NO** — packet only after deploy |

## 28. Readiness for Planner production compatibility deploy

**YES** — freeze `PLANNER_COMPATIBILITY_DEPLOY_SHA=64b365ac8135dff9dda06cdde598310b1dac9e12`
matching canary archive; bake same flags; deploy **only** `planneros-ken`; keep
`stop_builds=true`.

## 29. Readiness for other domain clients

**NO** automatic green light.

## 30. Readiness for Kenos Writer canary

**NO** — prepare packet only after production compat deploy + observation.

## 31. Exact next approval phrase

Already authorized for this long-run:

`APPROVE_KENOS_PLANNER_PRODUCTION_COMPATIBILITY_DEPLOY`

Do **not** start Kenos Writer canary or restore auto-builds.
