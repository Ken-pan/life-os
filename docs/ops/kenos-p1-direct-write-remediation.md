# Kenos P1-001 — Direct-write production remediation plan

Status: `PRODUCTION_REMEDIATION_ARTIFACT_READY`  
Hosted gate: `BLOCKED_PENDING_HOSTED_APPLY_AND_CUTOVER`  
Date: 2026-07-19  
Baseline audit: `KENOS_P0_P4A_CORE_REVIEW_2026-07-19.md` @ `1896250e2`

This document is an artifact only. It does **not** apply production migrations, revoke live RLS, or cut over writers.

## 1. Current direct-write inventory (repository evidence)

| Path | Mechanism | Role |
| --- | --- | --- |
| `apps/planner/supabase/migrations/20260705140000_planner_structured_tables.sql` | `planner_tasks_insert_own` / `update_own` / `delete_own` for `authenticated` | Production migration still allows self-write |
| `apps/planner/src/lib/repo.js` | `planner_tasks.upsert` in sync | Legacy cloud sync writer |
| `apps/planner/src/lib/services/lifeEventsInbox.js` | Local task upsert helpers | Local event→task projection (not Kenos command) |
| `apps/planner/netlify/functions/mcp.mjs` | `complete_task` still upserts | Complete path legacy; **create path no longer upserts** |
| `apps/planner/server/mcpTasks.mjs` | Command boundary only | Create path rejects `persistTask` |
| `apps/planner/supabase/review/20260719010000_kenos_plan_create_task_command.sql` | `kenos_create_plan_task_action` | Review-only; **not** in `migrations/` |

## 2. Production revoke / grant review SQL

See review artifact:

`apps/planner/supabase/review/20260719100000_kenos_revoke_planner_tasks_direct_write.sql`

- Revokes authenticated insert/update/delete policies after command RPC is live.
- Keeps SELECT for read models.
- Includes commented rollback policy restoration.

## 3. Hosted migration plan

1. Security review of `kenos_create_plan_task_action` (definer, `search_path`, grants).
2. Apply Kenos Plan command review SQL to hosted via explicit owner-approved process (not CI auto-apply).
3. Run hosted advisors (security + performance).
4. Dual-user privilege verification on hosted (not only disposable).
5. Apply revoke SQL in a change window.
6. Observe MCP create + Planner UI create via command only.
7. Only then mark writer cutover complete in the Ledger.

## 4. Rollback SQL

Included as comments in the revoke review SQL. Emergency restore recreates `planner_tasks_*_own` policies for `authenticated`.

## 5. Dual-user / disposable privilege tests

Existing disposable RLS proof for Kenos review SQL remains the local evidence path. Hosted dual-user verification is still required before cutover and is **not** claimed here.

## 6. Cutover preconditions

- [ ] Hosted command RPC applied
- [ ] Hosted advisors green
- [ ] Hosted dual-user write deny for authenticated insert
- [ ] MCP create uses RPC (no upsert fallback)
- [ ] Apple / new clients do not require direct insert
- [ ] Independent shadow thresholds owner-approved (Portal default still Off)
- [ ] Rollback drill completed
- [ ] Observability for Action/Outbox/Activity

## 7. Proof: MCP / new clients do not depend on direct create write

- MCP `executeAssistantCreateTaskCommand` rejects `persistTask` with `direct_task_write_forbidden`.
- Production MCP without hosted RPC returns `hosted_rpc_required` (fail closed).
- Server command binds `authUserId` and authoritative risk; no payload actor fallback.

## 8. Gate label

`BLOCKED_PENDING_HOSTED_APPLY_AND_CUTOVER`

Do not treat `PRODUCTION_REMEDIATION_ARTIFACT_READY` as production applied or writer cutover complete.
