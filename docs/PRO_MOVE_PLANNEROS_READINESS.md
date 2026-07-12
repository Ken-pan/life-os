# PaperOS / Planner Provider reMarkable Paper Pro Move Readiness Audit

This document audits the Planner-backed PaperOS integration for the reMarkable
Paper Pro Move. Planner is the first functional provider for PaperOS.

## Summary Judgement: PASS (with minor WARN constraints)

### Rationale
1. **Device Verification Complete**: Device access via SSH, legacy storage path `/home/root/planneros-lite`, and OS characteristics (`5.7.126 (scarthgap)`) were fully verified. PaperOS now uses `/home/root/paperos` as the canonical target path.
2. **No Backend SvelteKit Server Runtime**: PlannerOS is configured as a Static Site (using `@sveltejs/adapter-static`). All dynamic API routes are implemented as Netlify Functions under `apps/planner/netlify/functions`.
3. **No Delta History Table**: The data is synchronized using structured tables (`planner_tasks`, `planner_lists`) or a legacy JSON blob (`planner_user_state`) by upserting whole tasks. There is no commit log or transaction history table. A sync delta endpoint (`/api/paper/delta`) will query updated times or construct virtual deltas.
4. **No Device Authentication**: Static API tokens mapping to User IDs are used for mock & MVP stages.

---

## Files Inspected

- [package.json](file:///Users/kenpan/「Projects」/life-os/apps/planner/package.json) — Build, typecheck, lint, and test scripts.
- [svelte.config.js](file:///Users/kenpan/「Projects」/life-os/apps/planner/svelte.config.js) — Static adapter settings.
- [netlify.toml](file:///Users/kenpan/「Projects」/life-os/apps/planner/netlify.toml) — Netlify build and routing settings.
- [src/lib/types.js](file:///Users/kenpan/「Projects」/life-os/apps/planner/src/lib/types.js) — Task, list, and setting definitions.
- [src/lib/repo.js](file:///Users/kenpan/「Projects」/life-os/apps/planner/src/lib/repo.js) — DB loading and upserting via Supabase client.
- [src/lib/sync.js](file:///Users/kenpan/「Projects」/life-os/apps/planner/src/lib/sync.js) — Bidirectional synchronization and conflict merging.
- [src/lib/domain/tasks.js](file:///Users/kenpan/「Projects」/life-os/apps/planner/src/lib/domain/tasks.js) — Task mutation helper functions.
- [src/lib/domain/schedule.js](file:///Users/kenpan/「Projects」/life-os/apps/planner/src/lib/domain/schedule.js) — Scheduling and time block logic.
- [netlify/functions/ai-plan.mjs](file:///Users/kenpan/「Projects」/life-os/apps/planner/netlify/functions/ai-plan.mjs) — Netlify routing and edge function pattern.

---

## Current Data Model

| Field / Model | Type | Description |
|---|---|---|
| **Task** (`Task`) | `Object` | The core task structure. |
| `id` | `string` | Unique task identifier. |
| `title` | `string` | Task title. |
| `notes` | `string` | Task notes/remarks (text field, no NoteOS link). |
| `listId` | `string` | ID of parent task list (default: `inbox`). |
| `priority` | `'P0'\|'P1'\|'P2'\|'P3'` | Priority level (`P0` is highest). |
| `urgency` | `'urgent'\|'normal'\|'low'` | Urgency level. |
| `size` | `'small'\|'medium'\|'large'\|'epic'` | Size of task. |
| `area` | `'life'\|'work'\|'planner'\|...` | Domain area. |
| `dueDate` | `string \| null` | Due date `YYYY-MM-DD`. |
| `dueTime` | `string \| null` | Due time `HH:mm`. |
| `scheduledDate` | `string \| null` | YYYY-MM-DD planned execution date. |
| `scheduledStart` | `string \| null` | HH:mm planned start time. |
| `durationMinutes` | `number \| null` | Planned duration. |
| `completed` | `boolean` | Completion state. |
| `completedAt` | `number \| null` | Milliseconds timestamp. |
| `updatedAt` | `number` | Milliseconds timestamp. |
| `deletedAt` | `number \| null` | Tombstone deletion marker. |
| `meta.kind` | `'micro'\|'standard'\|'focus'\|'habit'` | Specific task subtype. |

---

## Current Mutation Functions

| Function Name | Location | Description |
|---|---|---|
| `createTask(input)` | `tasks.js` | Instantiates a new task with defaults and saves it to local state. |
| `updateTask(id, patch)` | `tasks.js` | Modifies an existing task properties, updates `updatedAt`, and saves. |
| `toggleComplete(id)` | `tasks.js` | Toggles completed boolean, logs timestamp, and handles recurrence. |
| `deleteTask(id)` | `tasks.js` | Sets `deletedAt` and `updatedAt` for tombstone soft-deletion. |
| `restoreTask(id)` | `tasks.js` | Clears `deletedAt` tombstone. |

---

## Current API Conventions

PlannerOS is built as an SPA and runs entirely client-side. Server/dynamic actions are delegated to Netlify Functions:
- Located under `apps/planner/netlify/functions/`.
- Written in ES Modules (`.mjs`).
- Expose routing using `export const config = { path: '/api/some-route' }`.
- Return standard `Response` objects.

---

## Gaps for Pro Move Integration

1. **API Infrastructure**: Completed mock layer in PR-1.
2. **Delta Tracking**: The device client needs to retrieve changes incrementally since a specific cursor. Currently, changes are merged via Last-Write-Wins (LWW) client-side. The API must emulate cursor changes based on the task's `updatedAt` timestamps.
3. **Write Path / Batch Actions**: Netlify functions must be able to load, merge, and save state to Supabase directly, bypassing client-side Svelte state when actions are submitted from the device.

---

## Risks and Blockers

- **Concurrency & Merge Conflicts**: Writing directly to Supabase via Netlify functions can conflict with simultaneous updates from the client app if not carefully merged using Svelte-compatible LWW rules.
- **Serverless Limits**: Fetching all tasks of a user in serverless functions to perform virtual deltas could become slow if the user has thousands of tasks.

---

## Current State Update (2026-07-09)

The original readiness audit is now behind the implementation state:

- PR-1 mock endpoints exist and passed local gate verification.
- PR-2 real read endpoints exist for `/api/paper/today` and `/api/paper/delta`, with dry-run actions verified.
- PR-3A action-log/idempotency design is complete.
- PR-3B `task.complete` real-write path is implemented behind `PAPER_ACTIONS_WRITE_ENABLED`.
- PR-3B local HTTP endpoint validation is a full PASS: fresh complete, duplicate retry, unsupported actions, stale version, and received-state recovery all passed with RLS enabled.
- Staging/production write enablement is still gated.
- Device UX work is tracked on the Planner roadmap as the P-MOVE series;
  PAPR.DEV.1 through PAPR.DEV.4 all passed live device gates on 2026-07-09.

See [`roadmap/apps/planner-pro-move.md`](./roadmap/apps/planner-pro-move.md) for the active execution plan,
and [`PRO_MOVE_STATUS_VS_IDEAL.md`](./PRO_MOVE_STATUS_VS_IDEAL.md) for the
gap-analysis cross-check.

## PR Roadmap

- **PR-1**: ✅ Paper API mock layer.
- **PR-2**: ✅ Real read-only Supabase integration for Today and virtual delta.
- **PR-3A**: ✅ Action log and idempotency design.
- **PR-3B**: ✅ Real write MVP for `task.complete`; local HTTP full pass, staging/production gate remains.
- **PAPR.DEV.1**: ✅ Device-side home-only PaperOS launcher baseline under `/home/root/paperos`.
- **PAPR.DEV.2**: ✅ Read cache path — last-good `cache.json`, offline launch verified.
- **PAPR.DEV.3**: ✅ CJK font (Noto Sans CJK SC) + e-ink pagination, operator-verified.
- **PAPR.DEV.4**: ✅ Exit button, crash auto-recovery, systemd device launcher.
- **PAPR.WRITE.5**: ⏳ Controlled write MVP — blocked on staging validation.
