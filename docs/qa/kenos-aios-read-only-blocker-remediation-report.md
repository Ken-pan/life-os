---
title: KENOS AIOS READ-ONLY BLOCKER REMEDIATION REPORT
owner: kenpan
last_verified: 2026-07-19
status: KENOS AIOS READ-ONLY BLOCKERS — FIXED_AND_CANARY_REVERIFIED
---

# KENOS AIOS READ-ONLY BLOCKER REMEDIATION REPORT

## Status phrase

**`KENOS AIOS READ-ONLY BLOCKERS — FIXED_AND_CANARY_REVERIFIED`**

Code + canary redeploy + Owner Smoke (incl. offline×5 + logout/re-login) complete on
https://aios-kenos-read-canary.netlify.app. Production AIOS was **not** redeployed with the fix.

Also recorded: **`READ_ONLY_MODE_CONVERSATION_WRITE_DETECTED`** for a pre-existing OWNER SMOKE row in `aios.conversations` (not deleted; cleanup awaits Owner).

---

## 1. Rollback result

**`AIOS_PRODUCTION_CLIENT_ROLLED_BACK`** — PASS

| Item                     | Value                                               |
| ------------------------ | --------------------------------------------------- |
| Production URL           | https://aios-kenos.netlify.app                      |
| Failed deploy (retained) | `6a5d3b8813e70ad66ebf2561` (SHA `f07944c9…`)        |
| Published after rollback | `6a5c617ee8396b00089a6d2e` (SHA `be6f2612…`)        |
| Method                   | `netlify api restoreSiteDeploy` — no Git auto-build |

## 2. Rollback deploy ID

`6a5c617ee8396b00089a6d2e`

## 3. Starting / final SHA

|                                     | SHA                                        |
| ----------------------------------- | ------------------------------------------ |
| Failed prod deploy tip              | `f07944c9210f08d40c8483e3a598b29f3c714bb8` |
| Rollback published tip              | `be6f2612d3f374ac322c58813528b4bf8f98eeac` |
| Remediation commits tip (this work) | `eb53577048b59f48ad0427b3c2d1ee566929eb75` |

## 4. Commits

1. `96ae165c1` — `fix(aios): stabilize Spaces identity and routing`
2. `a94ebffab` — `fix(aios): add offline navigation fallback and reconnect`
3. `691882e38` — `feat(aios): expose Assistant scope in read-only mode`
4. `da03329e5` — `fix(aios): prevent conversation persistence in read-only mode`
5. `eb53577048` — `docs(qa): record AIOS read-only rollback and blocker remediation`
6. Follow-up docs stamp for canary deploy ID (if any)

## 5. `each_key_duplicate` root cause

`apps/aios/src/routes/spaces/+page.svelte` merged:

- hosted AIOS Spaces (`id: 'training'`, …)
- external `KENOS_SPACES` (`id: 'training'` → Fitness Training)

into `{#each spaces as space (space.id)}`. Duplicate `training` keys crashed the Spaces page. SvelteKit URL could become `/spaces` while the previous Today UI remained painted → “URL=/spaces but UI=Today”.

## 6. Unique-key fix

- `spacesList.core.js` builds `listKey = hosted|external:<id>`
- Collision → `console.warn` (key only) + `#n` disambiguator; **no silent dedupe**
- Template keys on `space.listKey`

## 7. Route-state fix

- `+error.svelte` controlled error page (`data-testid="aios-route-error"`)
- Shell `navigationKey={page.url.pathname}` remains SSOT
- Logout clears conversation client copies (`clearConversationClientState`)

## 8. Offline 500 root cause

AIOS uses `adapter-static` + Netlify `/* → /index.html` SPA rewrite and **had no service worker**. Offline deep links / refresh left Chrome with `ERR_INTERNET_DISCONNECTED` (or host 500 if CDN miss) instead of an App Shell.

## 9. Offline fallback implementation

- `src/service-worker.js` — precache build/files; navigate network-first → cached `/` / `index.html`
- Layout registers SW; offline banner `data-testid="aios-offline-banner"`
- Inbox/Focus keep source-level offline via `ReadSourceState` (not fake empty/0)

## 10. Reconnect behavior

- `online` event → bounded retries (max 5, `reconnectDelayMs`)
- `refreshControlCenter({ force: true })` + `syncNow()` when logged in
- Stays on current route; no infinite loop

## 11. Assistant Global scope

Chip: **`Scope: All Kenos`** (`data-testid="assistant-scope-chip"`, `data-scope-kind="global"`)

## 12. Assistant Context scope

- Focus shell + Assistant page share `resolveAssistantScopeLabel`
- Work hub: **Context Assistant** entry (`data-testid="work-context-assistant-entry"`)
- Label form: `Scope: Work` / `Scope: Work · <Entity>`

## 13. Conversation record destination

| Field                     | Value                                                            |
| ------------------------- | ---------------------------------------------------------------- |
| System                    | Supabase project (Life OS)                                       |
| Schema/table              | `aios.conversations`                                             |
| Row id                    | `133c3694-0243-469b-b01b-5e495646841b`                           |
| user_id                   | `c2831538-94b0-4a57-b034-5e873a53c42e`                           |
| updated_at (UTC)          | `2026-07-19 21:09:43.529`                                        |
| Title (prefix)            | `OWNER SMOKE TEST：请创建一个名为`                               |
| Messages                  | 2                                                                |
| Sensitive markers         | none detected by simple regex                                    |
| Also possible client copy | `localStorage` key `aios_chats_v1` (cleared on logout after fix) |

## 14. Conversation-write classification

**`READ_ONLY_MODE_CONVERSATION_WRITE_DETECTED`**

Created under the failed/read-only production smoke window via AIOS cloud sync (`conversations` upsert). Not on Kenos domain write denylist at the time.

## 15. Read-only persistence behavior (chosen option **1**)

On `VITE_AIOS_CLOUD=1` or `VITE_KENOS_READ_CANARY=1` while writes fail-closed:

- Assistant turns stay **in-memory for the session only**
- No `localStorage` persist / no cloud upsert / no image upload
- Pull of existing remote conversations still allowed
- Local Tauri / non-cloud builds unchanged

**Cleanup (Owner decision only — not executed):**

```sql
-- soft-delete option (Owner must approve before run)
update aios.conversations
set deleted = true, updated_at = (extract(epoch from now()) * 1000)::bigint, payload = null
where id = '133c3694-0243-469b-b01b-5e495646841b';
```

## 16. Three-layer fail-closed result

| Layer                | Result                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Capability registry  | Write surfaces unavailable                                                                                 |
| Action dispatcher    | Planner/Focus/Work/Executor tools blocked                                                                  |
| Network allowlist    | Kenos tables + RPCs blocked; **conversations/memories/user_state** blocked on cloud/canary                 |
| Mutation audit kinds | `model_read` / `conversation_persistence` / `domain_mutation` / `analytics_logging` / `local_only_storage` |

## 17. Tests / repeated-run evidence

- `npm run test -w aios-os` → **98/98 PASS** (+ mcp.presets)
- Spaces listKey suites (same displayName, same id across namespaces, collision warn)
- Assistant scope label suites
- Conversation persist + classifyMutationKind suites
- Network reconnect bound suites
- prodReadPath canary write blocks including `conversations.upsert`

## 18. CI / guards

- `npm run check -w aios-os` — 0 errors
- `npm run build -w aios-os` — OK
- `check-kenos-phase1/2/6` — OK
- `git diff --check` on touched AIOS paths — OK
- Root turbo CI: after push (pause holds; push must not auto-deploy prod clients)

## 19. Canary URL / deploy SHA

| Item              | Value                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| URL               | https://aios-kenos-read-canary.netlify.app                                                              |
| Site id           | `8557bb44-6063-4720-ac03-b4e3ed12bbc2`                                                                  |
| Domain            | `*.netlify.app` only (no `kenos.space`)                                                                 |
| Flags             | `VITE_AIOS_CLOUD=1` `VITE_KENOS_READ_CANARY=1` Focus/Work/Today/Shadow On                               |
| Deploy SHA        | `eb53577048b59f48ad0427b3c2d1ee566929eb75` (source tip at canary build; Netlify canary has no git link) |
| Canary deploy ID  | `6a5d4835b9334bfe8103ab23`                                                                              |
| Unique deploy URL | https://6a5d4835b9334bfe8103ab23--aios-kenos-read-canary.netlify.app                                    |

## 20. Owner smoke results

| #                                 | Check                                        | Result                                                                |
| --------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| 1–20 interactive Owner Smoke      | Login → offline×5 → logout → re-login        | **PASS** — `docs/qa/kenos-aios-read-canary-owner-smoke-2026-07-19.md` |
| Automated unit/integration        | Spaces / persist / scope / fail-closed       | **PASS**                                                              |
| Prod rollback login wall / shells | HTTP 200 for `/` `/spaces` `/inbox` `/focus` | **PASS** (post-rollback)                                              |

Phrase: **`AIOS_READ_ONLY_CANARY_OWNER_SMOKE_COMPLETE`**

## 21. Production DB unchanged

- Migration tip remains `20260719130500`
- No schema changes applied this task
- OWNER SMOKE conversation row **retained** (audit only)

## 22. Seven-site pause state

Expected: all seven `stop_builds=true` (re-verified immediately before push/canary deploy).

## 23. Gallery status

`disabled_manually` (unchanged)

## 24. Incidents / warnings

- **Yellow:** OWNER SMOKE conversation already persisted to production `aios.conversations` before remediation
- **Yellow:** Focus not in global nav (offline return-to-`/focus` awkward); `aios_memory_*` not cleared on logout; title may lag under CloudGate
- Failed deploy `6a5d3b8813e70ad66ebf2561` retained for evidence
- Latest canary deploy with scope fix: `6a5d498b21f0e8d264da5f2b`

## 25. Remaining Red / Yellow gates

| Gate                                 | State                           |
| ------------------------------------ | ------------------------------- |
| Owner canary smoke (incl. offline×5) | **PASS**                        |
| Redeploy AIOS production with fix    | Red — needs new approval phrase |
| Other six client sites               | Red — paused; not approved      |
| Writer canary                        | Red — not approved              |
| Conversation soft-delete             | Yellow — awaits Owner           |

## 26. Readiness to redeploy AIOS production

**Ready for Owner approval only** — canary Owner Smoke complete; do **not** auto-redeploy.

## 27. Readiness for other client sites

**No**

## 28. Readiness for writer canary

**No**

## 29. Exact next approval phrase

After Owner completes canary smoke:

```text
APPROVE_KENOS_AIOS_PRODUCTION_READ_ONLY_REDEPLOY
```

Optional cleanup phrase (separate):

```text
APPROVE_KENOS_AIOS_OWNER_SMOKE_CONVERSATION_SOFT_DELETE
```

---

## Not done (correctly)

- No AIOS production redeploy of the fix
- No restore of seven-site auto-builds
- No writer / Portal / Executor / Gallery / Apple
- No Wave 1 migration edits
- No `git add -A` / stash / hard reset
