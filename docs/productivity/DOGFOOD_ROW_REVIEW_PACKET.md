# Agent-Created Dogfood Row Review Packet (G6)

> Read-only. Nothing deleted. The 15 agent-created outbox **actions** produced **9 persisted
> data rows** (3 project contexts, 3 Planner tasks, 3 project links) plus an immutable audit
> trail (15 outbox rows now `published`, 15 `kenos_plan_activity` rows, 15 of the 25
> `life_events`). All rows are owned by the real owner account; none are fixtures; none cross users.

## Persisted data artifacts (9 rows)

| # | Type | Safe identifier | Project | In Today/Cockpit? | Deletion cascade/orphan | Recommend | Reversible cleanup action |
|---|---|---|---|---|---|---|---|
| 1 | project_context | outcome: "Kenos 生产力脊柱上线…" | project-lifeos-aios (dev) | Yes (spine list + next action) | none; project row in planner_projects untouched; links independent | **KEEP** | `project.set_context {status:'archived'}` or `delete from kenos_project_context where project_id='project-lifeos-aios' and user_id=<owner>` |
| 2 | project_context | outcome: "把 Ingram Search…可评审" | 244436ae… (work) | Yes | none | **KEEP** | same, project_id=244436ae… |
| 3 | project_context | outcome: "照片库整理…月度流程" | 1cd0c24a… (personal) | Yes | none | **KEEP** | same, project_id=1cd0c24a… |
| 4 | planner_task | "Spine 验收:Project Cockpit 首版走查…" | project-lifeos-aios | Yes (next action) | context.next_action_task_id + link #7 would dangle (filtered at read) | **REVIEW** | `plan.archive_task {taskId:'42e1b766-…'}` (soft, undoable via reopen) |
| 5 | planner_task | "Ingram Search:整理当前迭代 Next/阻塞/等待清单" | 244436ae… | Yes | dangles link #8 | **REVIEW** | `plan.archive_task {taskId:'4c65a5c1-…'}` |
| 6 | planner_task | "Photo Organizor:跑一轮 7 月照片整理批处理并归档" | 1cd0c24a… | Yes | dangles link #9 | **REVIEW** | `plan.archive_task {taskId:'2c95fcbb-…'}` |
| 7 | project_link (next→task#4) | mirrors task #4 title | project-lifeos-aios | Yes | none | **KEEP** | `project.unlink_object {linkId:'3035986a-…'}` (soft-delete) |
| 8 | project_link (next→task#5) | mirrors task #5 title | 244436ae… | Yes | none | **KEEP** | `project.unlink_object {linkId:'15a08abe-…'}` |
| 9 | project_link (next→task#6) | mirrors task #6 title | 1cd0c24a… | Yes | none | **KEEP** | `project.unlink_object {linkId:'5f08c682-…'}` |

## Audit-trail rows (immutable — KEEP)

- **15 outbox rows** (`status=published`, post-epoch) — the delivery record; forward-only, do not mutate.
- **15 `kenos_plan_activity` rows** — append-only command ledger (correlation-linked).
- **15 `life_events`** (of 25; the other 10 are the owner's organic Planner activity the worker swept) — deleting an event only removes the projection, not the business state.

## Recommendation summary

- **Contexts (1–3) and links (7–9): KEEP.** They are the pure orchestration overlay for the dogfood — the intended output of the milestone — and are trivially reversible (archive/unlink) with no cascade. Mark **REVIEW** only if the owner did not want these three projects onboarded to the spine.
- **Tasks (4–6): REVIEW.** These are the only artifacts written into the **canonical** `planner_tasks` store, so they appear as real tasks in the owner's Planner. They are legitimate next-actions but were agent-created; the owner should confirm keep or `plan.archive_task` (soft, reversible via `plan.reopen_task`).

## One-shot reversible cleanup (OWNER, only if REVIEW → remove)

To remove the entire dogfood footprint (contexts + links + soft-archive tasks), under an Owner
authorization (`--operation service_role_rpc_write`), run the exact reversible actions in the table
above for all 9 rows. The 3 tasks archive (not hard-delete) so they can be reopened. No audit-trail
row is touched. **This milestone performs none of these — they are listed for the owner to choose.**
