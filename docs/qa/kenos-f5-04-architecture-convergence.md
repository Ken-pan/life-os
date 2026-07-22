---
title: KENOS F5-04 — Architecture Convergence
owner: kenpan
last_verified: 2026-07-21
doc_role: milestone-evidence-report
status: F5_04_LOCAL_VERIFIED
---

# KENOS F5-04 — Architecture Convergence

**Status: local-verified.** One canonical writer per core-loop entity; internal
tables are RPC-only; fake-success paths are removed from the verified loop; a
static guard now prevents regression. One tracked convergence debt remains
(flag-gated off in prod), plus owner-gated writer cutover.

## 1. Executable architecture map (core loop)

```
User intent (UI: CaptureQuick / Inbox convert / Task editor / complete)
  → client command  (captureWriters.host.js / captureConvertWriters.host.js /
                     planCreateTaskWriter.host.js / planUpdate*/complete)
  → authentication  (JWT; owner = auth.uid(); actor.id must equal auth.uid())
  → validation      (Zod @life-os/contracts/kenos.ts + RPC-side field checks)
  → canonical mutation  (SECURITY DEFINER RPC, single txn)
  → event/outbox    (kenos_plan_outbox, same txn)
  → Activity        (kenos_plan_activity, same txn)
  → projection      (planner_tasks row; portal_today_summary count)
  → Web read        (Planner own-row RLS; AIOS list RPCs)
  → Apple read      (same web surfaces in WKWebView → same Supabase)
  → Continue        (kenos.spaceSwitcher.v1 descriptor bound to entityId+ownerId)
```

Every step is code, proven by the F5-02 clean-room (32 migrations + 20 assertions)
and the P5 core-loop E2E (11/11).

## 2. Entity representations (classified)

| Entity | Canonical | Read projection | Transport/DTO | Local cache | Legacy/compat | Obsolete dup |
| --- | --- | --- | --- | --- | --- | --- |
| Plan Task | `planner_tasks` | Planner UI, portal_today_summary | `@life-os/contracts` action/result | planner local state, offline intent queue | Legacy full-state sync (repo.js) — see §4 | none |
| Capture | `kenos_capture_envelopes` | `kenos_list_capture_envelopes` | CaptureEnvelope contract | Apple KenosActions local queue (fake exec, never canonical) | AIOS `plannerAddTask` life_events (§4) | none |
| Activity | `kenos_plan_activity` | `kenos_list_plan_activity` (+ life_events compat, dedup by correlation) | Activity contract | — | life_events compat feed (read-only, merge dedup) | none |
| Continue | localStorage descriptor | AIOS Continue sheet | ResumeDescriptor (Zod) | native mirror file (non-beta only) | — | none |

No representation acts as a **second truth source**. Local caches and read
projections are explicit; the Apple native KenosStore is mock and inactive in
the daily-beta (all in-app web → same Supabase).

## 3. Single writer per entity — enforced

- Internal tables (`kenos_plan_activity`/`_outbox`/`_action_idempotency`/
  `kenos_capture_envelopes`/`kenos_action_approvals`) have **no client
  INSERT/UPDATE grant** — reachable only via SECURITY DEFINER RPCs. Proven in
  the clean-room: a direct authenticated read returns `permission denied`.
- Static guard `scripts/check-kenos-architecture.mjs` (wired into
  `verify-kenos-refactor.sh`) fails the build if client code writes those tables
  directly, references a service-role key, or adds a new `life_events core.*`
  writer. Passes clean today.

## 4. Duplicate write paths (honest status)

**Activation reality:** no `.env`/`netlify.toml` sets any `VITE_KENOS_*` flag, so
in default + production builds every Kenos writer flag is OFF — the Legacy
`repo.js` upsert is the **sole** prod writer (no dual-write in prod). Flags flip
on only in the owner canary (`kenos-daily-beta`, cohort = single owner email).

**Plan Task — THREE write mechanisms to `planner_tasks`:**
1. Legacy full-state sync: `apps/planner/src/lib/repo.js:164` upsert (LWW). The
   established, sole prod writer. Delete-tombstone at `:143`.
2. Kenos RPCs: `kenos_create/update/complete_*` (atomic + outbox + activity),
   cohort/flag-gated. In the owner canary, a create is de-duped and dedicated-
   field edits route to RPCs, but any **non-dedicated-field edit** (priority/
   tags/subtasks/notes) sets `legacyDirty` → `repo.js` re-upserts the whole row
   → a **real row-level dual-write in the canary only**, coordinated by
   `legacyDirty` + LWW; the RPC-owned outbox/activity are not re-emitted. This
   is the KR-P1-001A migration-in-progress; cutover (freeze the direct writer)
   is owner-gated and blocked because
   `apps/planner/supabase/review/20260719100000_kenos_revoke_planner_tasks_direct_write.sql`
   is unapplied review-only.
3. **`apps/planner/server/paperService.mjs` (paper e-ink device sync,
   `/api/paper/actions`) writes `planner_tasks` directly (`:805`, `:420`…),
   unconditional — no flag, no cohort, bypasses the command boundary → no
   `kenos_plan_activity`/outbox row.** This is the established paper provider
   path (per AGENTS, paper functions stay Planner-side), not a new dual-write,
   but it is a genuine parallel writer. Pinned in the architecture guard's
   server allowlist; convergence target: route through the Kenos RPC. Owner-gated.

Only the RPC emits Activity, so there is **no double Activity** from any of the three.

**Capture — one tracked competing writer, flag-gated OFF in prod:**
- Canonical: `kenos_ingest_capture_envelope_action` → `kenos_capture_envelopes`
  (CaptureQuick, Inbox).
- Legacy: AIOS assistant tool `plannerAddTask` (`apps/aios/src/lib/lifeos.js`)
  inserts `life_events core.task_captured` (the old event-bus task capture). The
  MCP `add_task` path already uses the canonical create RPC
  (`mcpTasks.mjs`/`mcp.mjs`), so this in-process tool is the divergent one.
  Gated by `assertDispatcherWriteAllowed` (fail-closed unless
  `VITE_KENOS_PROD_WRITES=1`). **Convergence target**: route `plannerAddTask`
  onto `kenos_create_plan_task_action`. Pinned in the architecture-guard
  allowlist so no NEW life_events core.* writer can be introduced.

## 5. Fake / misleading runtime paths

- Removed in P5: the Activity feed no longer shows UI-only fake entries — it
  reads canonical `kenos_list_plan_activity` (dedup vs life_events compat).
- Demo data (`apps/aios/src/lib/demoMode.js` / `demoData.js`) is localhost-only
  and opt-in (`?kenosDemo=1`), never in `CLOUD_BUILD` — not a production fake path.
- **FIXED this milestone**: `/api/paper/mock/*` endpoints returned
  `batchStatus:"applied"` with zero persistence and were deployed unguarded — a
  fake-success path reachable in production. Now 404 unless `PAPER_MOCK_ENABLED=1`
  (`_paperMockGuard.mjs`, dev/test only).
- No silently-swallowed mutation failure in the verified loop: writers are
  fail-closed (`prodWriteGuard`), RPCs raise deterministic errors, offline
  intents dead-letter after retries. The only fail-open swallow is a READ-side
  path (`readSources.js` keeps the legacy feed if the Kenos read errors) — by design.
- Apple `FakeActionExecutor` throws on `productionWrite` and is dev/local only;
  never wired to canonical tables (verified — Apple client never writes
  `planner_tasks`/`kenos_capture_envelopes`).

## 6. Contract / error / Activity / Continue consolidation

- **Contracts**: single source `@life-os/contracts/kenos.ts` (Zod), cross-checked
  against Swift by `check-kenos-contract-parity.mjs`. No generated Supabase types
  to drift.
- **Errors**: RPCs raise deterministic codes (`actor_user_mismatch`,
  `schema_version_not_supported`, `capture_not_found`, `action_id_reused`, …);
  clients map to consistent read states (`readProjections.core.js`
  permission_denied/offline/partial/empty). Raw DB errors are not surfaced to users.
- **Activity**: produced once, inside the mutation transaction; idempotent by
  key; `redacted_payload` column (no full sensitive payload); linked to canonical
  entity via `entity_ref`.
- **Continue**: descriptor carries canonical `entityId` + `ownerId` (Zod);
  planner adapter strips origin to a same-origin path; `fallbackResumeToHome`
  when the object is gone; owner-bound storage. Cross-user object access is
  prevented by RLS (F5-02 T3–T14).

## 7. Legacy removal protocol status

No legacy code deleted in this milestone (per protocol: prove zero callers first).
Tracked for removal with owner + prerequisite:
- Legacy Planner `repo.js` direct `planner_tasks` writer → remove after RPC
  writer cutover (KR-P1-001A); blocked because the revoke migration
  `review/20260719100000_kenos_revoke_planner_tasks_direct_write.sql` is
  unapplied review-only.
- `paperService.mjs` direct `planner_tasks` writer → route through the Kenos RPC.
- AIOS `plannerAddTask` life_events capture → converge to canonical RPC, then remove.
- `mcpTasks.mjs` `createMemoryCreateTaskDatabase` — **zero prod callers** (prod
  `mcp.mjs` uses the RPC directly) → safe removal candidate (test-only helper).
All except the last have runtime callers today, so they remain until migrated.

## 8. Architecture regression tests

`scripts/check-kenos-architecture.mjs` (self-tested) + the F5-02 clean-room
(canonical mutations go through RPCs; internal tables reject direct client
writes) + no-service-role-in-bundle scan. Wired into the standard guard suite;
green as of 2026-07-21.
