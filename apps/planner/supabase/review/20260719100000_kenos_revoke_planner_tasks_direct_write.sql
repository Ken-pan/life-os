-- Kenos P1-001 production remediation ARTIFACT (review-only).
-- DO NOT apply automatically. Status: PRODUCTION_REMEDIATION_ARTIFACT_READY
-- Hosted apply + writer cutover remain BLOCKED_PENDING_HOSTED_APPLY_AND_CUTOVER.
--
-- Purpose: revoke authenticated direct INSERT/UPDATE on public.planner_tasks once
-- kenos_create_plan_task_action (and related command RPCs) are live on hosted.

begin;

-- Inventory note (repo evidence, not live DB):
-- * apps/planner/supabase/migrations/20260705140000_planner_structured_tables.sql
--   still creates planner_tasks_insert_own / update_own / delete_own for authenticated.
-- * apps/planner/src/lib/repo.js still upserts planner_tasks for legacy sync.
-- * MCP add_task no longer upserts (command boundary + hosted RPC required).

-- Preconditions before apply:
-- 1. Hosted review SQL for kenos_create_plan_task_action applied and advisors green.
-- 2. Dual-user disposable + hosted privilege tests green.
-- 3. MCP / Apple / new clients proven not to require direct insert.
-- 4. Owner-approved cutover window + rollback drill.

-- Grant path for command writer (adjust role names to hosted reality before apply):
-- grant execute on function public.kenos_create_plan_task_action(jsonb) to authenticated;
-- revoke all on function public.kenos_create_plan_task_action(jsonb) from public;

-- Revoke direct writes from authenticated (cutover):
drop policy if exists "planner_tasks_insert_own" on public.planner_tasks;
drop policy if exists "planner_tasks_update_own" on public.planner_tasks;
drop policy if exists "planner_tasks_delete_own" on public.planner_tasks;

-- Keep SELECT for authenticated read models:
-- (re-create select policy if dropped by mistake — do not drop select here)

-- Optional: allow only SECURITY DEFINER command owner role to write:
-- create policy "planner_tasks_insert_via_command_role"
--   on public.planner_tasks for insert
--   to kenos_plan_command
--   with check (true);

commit;

-- Rollback SQL (restore authenticated self-write policies — emergency only):
-- begin;
-- create policy "planner_tasks_insert_own"
--   on public.planner_tasks for insert
--   to authenticated
--   with check ((select auth.uid()) = user_id);
-- create policy "planner_tasks_update_own"
--   on public.planner_tasks for update
--   to authenticated
--   using ((select auth.uid()) = user_id)
--   with check ((select auth.uid()) = user_id);
-- create policy "planner_tasks_delete_own"
--   on public.planner_tasks for delete
--   to authenticated
--   using ((select auth.uid()) = user_id);
-- commit;
