---
title: KENOS AIOS READ-ONLY PRODUCTION OBSERVATION REPORT
owner: kenpan
last_verified: 2026-07-19
status: KENOS AIOS READ-ONLY PRODUCTION — OBSERVATION_PASS
---

# KENOS AIOS READ-ONLY PRODUCTION OBSERVATION REPORT

**Phrase:** `APPROVE_KENOS_AIOS_READ_ONLY_PRODUCTION_OBSERVATION`

## Status phrase

**`KENOS AIOS READ-ONLY PRODUCTION — OBSERVATION_PASS`**

No security incident, no production conversation write, no Kenos domain mutation,
no unintended client redeploy. Yellow product/degraded-read notes remain (below);
rollback not recommended.

---

## 1. Observation window

| Field       | Value                                                         |
| ----------- | ------------------------------------------------------------- |
| Start (UTC) | `2026-07-19T22:44:59Z`                                        |
| End (UTC)   | `2026-07-19T22:52:00Z` (approx.)                              |
| Mode        | Read-only observation only (no deploys / DB writes / writers) |
| URL         | https://aios-kenos.netlify.app                                |

Continuous with post-redeploy Owner session on the same published deploy.

## 2. Production deploy SHA / ID

| Field                     | Value                                      |
| ------------------------- | ------------------------------------------ |
| SHA                       | `f87336224a4cb8c934aa90fd0819bb26a1e5f795` |
| Deploy ID                 | `6a5d500302c73442caf47132`                 |
| Published                 | yes (`ready`)                              |
| New deploys during window | **none**                                   |

## 3. Usage flows completed

Authenticated observation smoke (Owner session present at window start):

| Flow                     | Rounds | Result                                                                                                                        |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Today                    | ×2     | PASS                                                                                                                          |
| Spaces → Work            | ×2     | PASS (URL/UI match; Spaces current on Work)                                                                                   |
| Global Assistant         | ×2     | PASS — `Scope: All Kenos`                                                                                                     |
| Work Context Assistant   | ×1     | PASS — `Scope: Work`                                                                                                          |
| Inbox                    | ×2     | PASS (unavailable shown as `—`)                                                                                               |
| Focus                    | ×1     | PASS (not primary tab)                                                                                                        |
| Offline → Reconnect      | ×1     | PASS                                                                                                                          |
| Logout + cache isolation | ×1     | PASS                                                                                                                          |
| Login again (in-window)  | —      | Owner must re-auth for continued use; isolation verified on logout. Prior same-deploy re-login already proven after redeploy. |

No `each_key_duplicate`. No `SMOKE_PROOF` residual on Assistant after re-login period / logout wall.

## 4. RPC latency / errors

### Browser (authenticated Today settle)

| Metric                 | Value                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sampled list/read RPCs | 5                                                                                                                                                  |
| p50                    | **166 ms**                                                                                                                                         |
| p95 / max              | **311 ms** (`portal_today_summary`)                                                                                                                |
| Sampled paths          | `portal_today_summary`, `kenos_list_action_approvals`, `kenos_list_focus_contexts`, `kenos_list_work_projects`, `kenos_list_work_action_proposals` |

### Supabase API logs (last ~24h sample, n=100, desensitized)

| Class                                            | Notes                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Status mix                                       | 200×89, 400×10                                                                                                                 |
| Read GETs                                        | `conversations`, `user_state`, `memories`, `life_events`, `planner_tasks`                                                      |
| Read RPCs (POST)                                 | `portal_today_summary`, `kenos_list_*` — **not** domain writers                                                                |
| Write RPC (`store_` / `transition_` / `create_`) | **none** observed                                                                                                              |
| Table POST/PATCH `conversations`                 | **none**                                                                                                                       |
| 400 errors                                       | `GET /rest/v1/kenos_deferred_items` (5), `GET /rest/v1/kenos_proactive_suggestions` (5) — degraded optional tables; **Yellow** |
| Schema cache / PGRST mismatch storms             | none in sample                                                                                                                 |

Server-side duration fields were not present in log lines; latency from browser Performance Resource Timing above.

## 5. Auth / RLS results

| Check                         | Result                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Auth logs                     | password/token logins + logout + `token_revoked` present                        |
| `refresh_token_not_found`     | present after logout / stale sessions — **expected**; not treated as RLS bypass |
| Anon `kenos_list_*`           | **401 permission_denied**                                                       |
| Anon invalid key              | **401**                                                                         |
| `aios.conversations` policies | `select/insert/update/delete_own` present                                       |
| RLS bypass                    | **not observed**                                                                |

No service-role material in client HTML/CDN assets (prior redeploy check; unchanged deploy).

## 6. Route / render errors

| Check                                 | Result                    |
| ------------------------------------- | ------------------------- |
| `each_key_duplicate`                  | none                      |
| Spaces crash                          | none                      |
| URL/UI mismatch                       | none                      |
| 500 / blank error page                | none                      |
| Client error rate (interactive smoke) | **0** blocking exceptions |

## 7. Offline / Reconnect

**PASS** (authenticated)

- Banner: `当前离线 · 显示已缓存内容；恢复网络后将自动重试`
- App shell retained; SPA `/` → `/spaces` offline OK
- No `ERR_INTERNET_DISCONNECTED` / 500
- Online: banner cleared without manual refresh

## 8. Assistant scope

**PASS** — Global `Scope: All Kenos`; Work `Scope: Work`; return path restores Global.

## 9. Logout / cache isolation

**PASS**

- Title `Kenos — Sign in`
- `aios_chats_v1` cleared; all `aios_memory_*` cleared; no `aios_*` keys
- Device bag `aiosos_v1` retained
- Auth wall shows no prior user conversation titles / `SMOKE_PROOF`

## 10. Mutation audit

| Surface                                            | Result                 |
| -------------------------------------------------- | ---------------------- |
| Kenos Focus / Work / Approval / Outbox / proposals | all **0** rows         |
| `kenos_store_*` / `transition_*` / Executor RPCs   | **none** in API sample |
| Browser unintended write attempts                  | none observed          |
| Connector mutations from AIOS                      | none observed          |

`POST /rpc/kenos_list_*` and `portal_today_summary` classified as **reads**, not domain writes.

## 11. Conversation row count

| When                | count  | max_updated     |
| ------------------- | ------ | --------------- |
| Window start        | 13     | `1784495383529` |
| Window end          | **13** | `1784495383529` |
| Newer than baseline | **0**  |

OWNER SMOKE row retained (not deleted — out of scope).

## 12. Legitimate concurrent writes

| Signal                | Value | Classification                                    |
| --------------------- | ----- | ------------------------------------------------- |
| `planner_tasks` count | 1664  | unchanged vs prior baseline; not AIOS Kenos write |
| `life_events` count   | 22    | unchanged; historical non-Kenos activity          |
| Kenos domain tables   | 0     | AIOS writers idle                                 |

No AIOS-correlated domain mutation attributed.

## 13. Netlify / Gallery status

| Check                      | Result                             |
| -------------------------- | ---------------------------------- |
| AIOS published             | `6a5d500302c73442caf47132`         |
| AIOS `stop_builds`         | **true**                           |
| planner…home `stop_builds` | **true** (published IDs unchanged) |
| Active AIOS builds         | none                               |
| UIUX Gallery               | `disabled_manually`                |
| DB tip                     | `20260719130500`                   |

## 14. Incidents / warnings

### Yellow (non-blocking)

1. Optional table GET **400**: `kenos_deferred_items`, `kenos_proactive_suggestions`
2. Today / Work / Inbox degraded or empty-vs-unavailable copy during reads (fail-closed UX; not fake zeros)
3. Auth `refresh_token_not_found` after logout / stale refresh (expected)
4. Focus not in global nav
5. Dual-account cross-user interactive not re-run in this window
6. Observation closed on auth wall after logout (Owner re-login for continued daily use)

### Red / rollback triggers

**None.**

## 15. Rollback readiness

**READY** — AIOS-only restore to `6a5c617ee8396b00089a6d2e` if a future Red trigger appears. Not recommended now.

## 16. Remaining Red / Yellow gates

| Gate                             | Severity                   |
| -------------------------------- | -------------------------- |
| Optional Kenos table 400s        | Yellow                     |
| Degraded Today/Work/Inbox reads  | Yellow                     |
| Focus nav absence                | Yellow                     |
| Dual-account interactive         | Yellow                     |
| OWNER SMOKE conversation cleanup | Yellow (separate approval) |

## 17. Readiness for Planner read-only deployment

**NOT YET as automatic next step.** AIOS observation pass supports considering a
**separate** Owner approval for Planner read-only after a short hold if desired.
Keep seven-site `stop_builds=true`.

## 18. Readiness for writer canary

**NO**

## 19. Exact next recommended approval

Hold AIOS production read-only; continue casual Owner use.

When ready for the next platform step (Owner choice), preferred phrase:

`APPROVE_KENOS_PLANNER_PRODUCTION_READ_ONLY_DEPLOY`

Do **not** approve writer canary, auto-build restore, Portal switch, Executor, or
OWNER SMOKE deletion without their own phrases.

---

## Observation checklist (desensitized)

| #   | Item                          | Result                                         |
| --- | ----------------------------- | ---------------------------------------------- |
| 1   | AIOS client error rate        | 0 blocking in smoke                            |
| 2   | RPC success/error             | list RPCs OK; optional table GET 400 Yellow    |
| 3   | RPC p50/p95                   | 166 / 311 ms (browser sample)                  |
| 4   | Auth refresh failures         | post-logout `refresh_token_not_found` expected |
| 5   | RLS denial                    | anon list RPC 401 permission_denied            |
| 6   | Schema mismatch               | no PGRST storm                                 |
| 7   | unavailable/empty/degraded    | present; fail-closed copy                      |
| 8   | Offline/reconnect failures    | 0                                              |
| 9   | Route/render exceptions       | 0                                              |
| 10  | each_key_duplicate            | 0                                              |
| 11  | Wrong-user/stale cache        | 0 on logout wall                               |
| 12  | Assistant scope errors        | 0                                              |
| 13  | Unintended mutation attempts  | 0                                              |
| 14  | conversations inserts/updates | 0 (count/max stable)                           |
| 15  | Kenos domain mutations        | 0                                              |
| 16  | Netlify deploy activity       | none new                                       |
| 17  | Seven-site stop_builds        | all true                                       |
| 18  | UIUX Gallery                  | disabled_manually                              |
