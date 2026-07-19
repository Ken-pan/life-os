---
title: KENOS PLANNER PRODUCTION COMPATIBILITY CANARY REPORT
owner: kenpan
last_verified: 2026-07-19
status: KENOS PLANNER PRODUCTION COMPATIBILITY CANARY — PASS_WITH_BLOCKERS
---

# KENOS PLANNER PRODUCTION COMPATIBILITY CANARY REPORT

**Phrase:** `APPROVE_KENOS_PLANNER_PRODUCTION_COMPATIBILITY_CANARY`

## Status phrase

**`KENOS PLANNER PRODUCTION COMPATIBILITY CANARY — PASS_WITH_BLOCKERS`**

Isolated Planner canary is live with Kenos writers fail-closed and legacy
`planner_*` path preserved. AIOS Observation Yellow (optional Focus side GET 400
+ degraded copy) is fixed in code and redeployed to **AIOS read-canary only**.

Blockers (not security/double-write incidents):

1. Owner authenticated smoke on Planner canary not completed in-agent (canary
   opened logged-out / local-empty).
2. Dual-account isolation not re-run (no second account session in agent).
3. Production Legacy Writer smoke (`KENOS PLANNER COMPAT SMOKE — <ts>`) **skipped**
   — no Owner-confirmed production mutation this window (per approval: do not
   fake pass).

No Kenos double-write. Production Planner / AIOS sites untouched.

---

## Dual-track boundary (frozen)

| Track | Allowed on canary |
| ----- | ----------------- |
| Legacy Planner Writer | `planner_tasks` / lists / projects / attachments upsert via existing sync |
| Kenos Read Path | Capability registry + AIOS Focus/Work/Today read contracts (AIOS canary) |
| Kenos Writer | **Blocked** — RPC denylist + Kenos table mutation proxy (`KENOS_WRITE_BLOCKED`) |

Never: Legacy write + Kenos write.

## 1. Exact source SHA

`PLANNER_COMPATIBILITY_CANARY_SHA=02aed2a92f773b6acd5635603a8b5940c56ef07e`

Parent tip before this work: `cef0280e17c7cec7fecfeba251a7c619d3e6fcbf`
(CI success). AIOS production remains
`f87336224a4cb8c934aa90fd0819bb26a1e5f795` / deploy `6a5d500302c73442caf47132`.

Canary hosts rebuilt from `git archive` of the freeze SHA (not dirty WIP tip).

Wave 1 migration sha256 **unchanged** (PASS; tip `20260719130500`).

## 2. CI result

Pre-change tip CI: https://github.com/Ken-pan/life-os/actions/runs/29705896665 — **success**

Post-push CI for freeze SHA — recorded after `git push origin master` (must be
success before treating freeze as CI-green).

## 3. Canary URL / deploy ID

| Field | Value |
| ----- | ----- |
| Planner Canary URL | https://planner-kenos-compat-canary.netlify.app |
| Site ID | `72f536f3-2805-4fea-94c4-10e9c3825574` |
| Deploy ID | `6a5d5bc1ea467a4e5542aeb1` |
| Source | `git archive` `02aed2a92f773b6acd5635603a8b5940c56ef07e` |
| Access | Netlify URL; `noindex` in `app.html`; no custom domain |
| Rollback / disable | Unpublish / delete site or redeploy empty; production Planner unaffected |
| AIOS read-canary (Yellow fix) | https://aios-kenos-read-canary.netlify.app deploy `6a5d5bdd654fcb52b5d4f7c3` |
| Prod Planner published (untouched) | `6a5c617e6e1b41000893a948` |
| Prod AIOS published (untouched) | `6a5d500302c73442caf47132` |

## 4. Environment model

Planner canary bake:

- `VITE_KENOS_COMPAT_CANARY=1`
- `VITE_KENOS_READ_CANARY=1`
- Kenos writers blocked by default
- Legacy `planner_*` mutations allowed
- No service-role in browser bundle

AIOS read-canary bake (unchanged pattern): cloud + read canary + Focus/Work/Today/Shadow On; writes fail-closed.

## 5. Optional capability 400 resolution

**PASS (code + AIOS read-canary)**

Root cause: Focus side selects requested non-existent columns (`title` /
`created_at` / `updated_at` on `kenos_deferred_items`).

Fix:

- Capability entries `focus.deferred.read` / `focus.suggestions.read`
- Flags `VITE_KENOS_PROD_READ_FOCUS_DEFERRED` / `_SUGGESTIONS` (`=0` → unavailable, **no network**)
- Schema-aligned selects when available
- Side errors → `error` / Focus `partial` with user-safe copy — **not** empty zero
- Unit tests in `focusSideReads.core.test.js`

Production AIOS (`6a5d5003…`) **not** redeployed in this task.

## 6. Degraded copy resolution

**PASS (shared UI)**

`ReadSourceState` + `capabilityEmptyCopy` now distinguish:

empty / unavailable / degraded / offline / unauthorized / error

without RPC / migration / HTTP / schema jargon in product labels.

## 7. Planner read paths

Canary shell loads Today / Inbox / Projects / Completed / Search / Settings.
Authenticated production-data read **pending Owner login** on canary (Yellow).

## 8–9. Task identity / Today counts

Covered by existing Planner unit + E2E (local-first). Cross-source Kenos
projection dedup remains AIOS-side; Planner canary does not introduce a second
task identity writer.

## 10. Owner result

**PENDING / Yellow** — canary session was unauthenticated (local empty Today).

## 11. Second-account isolation

**PENDING / Yellow**

## 12. Logout / cache result

**PENDING / Yellow** (requires Owner + test user cycle on canary)

## 13. Legacy Writer endpoint

| Target | Status |
| ------ | ------ |
| `public.planner_tasks` (+ lists/projects/attachments) upsert | Allowed |
| `kenos_create_plan_task_action` / Kenos store|transition RPCs | Blocked |
| Kenos domain tables insert/update/delete | Blocked |

Evidence: `prodWriteGuard.core.test.js` + baked `KENOS_WRITE_BLOCKED` in canary chunk.

## 14–15. Legacy mutation smoke / correlation

| Phase | Result |
| ----- | ------ |
| Phase 1 local/guard | **PASS** — legacy tables allowed; Kenos writers blocked |
| Phase 2 production smoke task | **SKIPPED** (not forged) |

## 16. Kenos mutation audit

During canary deploy + local tests: no Kenos store/transition writes introduced.
Domain tables remain at observation baseline (0) unless unrelated actors write.

## 17. Duplicate-write result

**PASS** for guard design — single legacy path; Kenos write path closed.

## 18–19. Read-after-write / shadow mismatches

Not exercised against production data this window (Owner login pending).

## 20. Offline / reconnect

Planner E2E / PWA coverage remains; Kenos integration did not add a second
offline write queue. Full canary offline×1 with auth — Yellow.

## 21. UI/UX findings

Planner domain IA retained (今天 / 收件箱 / 项目 / …). No new system-level IA.
Work / Approval / Focus not added as Planner global tabs.

## 22. Tests and repeated runs

| Suite | Result |
| ----- | ------ |
| AIOS `node --test` (incl. focusSideReads) | PASS |
| Planner vitest + guard tests | PASS (152) |
| `check-kenos-phase1` / `phase6` | PASS |
| Wave1 checksum | PASS |
| Planner E2E desktop full | **118 passed** / 6 skipped |
| Planner E2E repeat (triage/schedule/project) | PASS (see `/tmp/planner-e2e-2.log`) |

## 23. Migration checksum

**PASS** — tip still `20260719130500`; files unchanged.

## 24. Seven-site pause status

All production sites `stop_builds=true`. Prod Planner published still
`6a5c617e6e1b41000893a948`. Prod AIOS still `6a5d500302c73442caf47132`.

## 25. Gallery status

`disabled_manually`

## 26. Incidents / warnings

- Yellow: Owner/dual-account/prod legacy smoke incomplete
- Yellow: Production AIOS still on pre-fix deploy for optional-side 400 until separate redeploy approval
- No Red / no STOPPED_AND_INCIDENT

## 27. Remaining Red / Yellow gates

| Gate | Severity |
| ---- | -------- |
| Owner canary authenticated reads | Yellow |
| Dual-account isolation on canary | Yellow |
| Production Legacy Writer smoke | Yellow |
| Prod AIOS yellow-fix redeploy | Yellow (separate phrase) |

## 28. Readiness for Planner production compatibility deploy

**NOT YET** — complete Owner + dual-account + optional prod legacy smoke first.

## 29. Readiness for other domain clients

**NO** automatic green light.

## 30. Readiness for Kenos Writer canary

**NO**

## 31. Exact next approval phrase

After Owner finishes canary login smoke + dual-account + (optional) marked
legacy prod smoke:

`APPROVE_KENOS_PLANNER_PRODUCTION_COMPATIBILITY_DEPLOY`

Do **not** start Kenos Writer canary or restore auto-builds.
