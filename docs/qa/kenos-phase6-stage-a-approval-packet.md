---
title: KENOS PRODUCTION WAVE 1 APPROVAL PACKET
owner: kenpan
last_verified: 2026-07-19
status: awaiting-owner-approval
---

# KENOS PRODUCTION WAVE 1 APPROVAL PACKET

Stage A complete. **No hosted migration has been applied. No writer cutover. No push performed by this Stage A task.**

## 1. Starting HEAD

`8e2c406dbf59a657679714537b4d537368658552` (Phase 5 tip at Stage A start)

## 2. Final local HEAD

`e13e245665ca7a6713bbd51bcf5670ee4630026a`

## 3. Commits

Stage A docs + Focus review SQL + Phase 6 guard (see `git log origin/master..master` after Stage A commits). Unrelated user WIP remains unstaged.

## 4. Production environment matrix

`docs/ops/kenos-phase6-production-environment-matrix.md`

Hosted project: `iueozzuctstwvzbcxcyh`. **No `kenos_*` tables/functions present** as of 2026-07-19 read-only inventory.

## 5. Hosted schema diff

`docs/ops/kenos-phase6-schema-diff-procedure.md`

Conclusion: Wave 1 is additive. Direct `planner_tasks_*_own` write policies still live.

## 6. Backup / restore proof

`docs/qa/kenos-phase6-backup-restore-proof.md`

**Incomplete:** restore drill not yet executed. Must complete before apply.

## 7. Migration list

`docs/ops/kenos-phase6-wave1-migration-package.md`

Order: Plan command → privileges → Approvals → Focus → Work.  
**Revoke direct Task write is NOT Wave 1 apply** (writer canary/cutover).

## 8. Exact SQL / RLS / grant changes (to apply after approval)

| File | Change class |
| --- | --- |
| `apps/planner/supabase/review/20260719010000_kenos_plan_create_task_command.sql` | create tables + SECURITY DEFINER command |
| `…/20260719020000_kenos_plan_privilege_model.sql` | worker role / grants |
| `…/20260719030000_kenos_action_approvals.sql` | Approval table + select policies + list RPC |
| `…/20260719110000_kenos_focus_context.sql` | Focus/Deferred/Suggestion + select-only authenticated |
| `…/20260719040000_kenos_work_domain.sql` | Work domain tables |

Revoke artifact (later wave): `…/20260719100000_kenos_revoke_planner_tasks_direct_write.sql`

## 9. Affected tables / functions

New: `kenos_plan_*`, `kenos_action_approvals`, `kenos_focus_*`, `kenos_deferred_items`, `kenos_proactive_suggestions`, Work review tables, `kenos_create_plan_task_action`, `kenos_list_*` RPCs.  
Unchanged in Wave 1: existing `planner_tasks` write policies.

## 10. Worker identity

`kenos_outbox_worker` (loginless) from privilege review SQL — **not** present hosted today. Must be created in Wave 1A/B privilege apply. Not a browser client role.

## 11. Security review checklist

- [ ] SECURITY DEFINER `search_path` fixed
- [ ] owner from `auth.uid()`
- [ ] no broad `public` execute
- [ ] authenticated cannot write Activity/Outbox/Focus/Approval directly
- [ ] dual-user plan executed on hosted
- [ ] advisors green

Plan: `docs/qa/kenos-phase6-dual-user-hosted-plan.md`

## 12. Dual-user test plan

Same as §11 plan — **not executed** in Stage A.

## 13. Observability

`docs/ops/kenos-phase6-observability-and-shadow.md`

## 14. Shadow plan

Independent legacy vs Kenos sources; blocking vs warning classes documented in observability doc. Portal default remains Off.

## 15. Cutover waves

Wave 1 = hosted read foundation only. Writer canary / cutover / Portal / Apple distribution require **separate** approval phrases.

## 16. Rollback commands

- Disable RPC grants to `authenticated`
- Leave additive tables in place
- Emergency: restore `planner_tasks_*_own` from comments in revoke SQL **if** revoke was applied (not Wave 1)
- Feature flags Off; clients stay on legacy writers

## 17. Blast radius

Empty Kenos tables + new RPCs. No Task rewrite. No Portal switch. No Apple production auth. No APNs.

## 18. Estimated downtime

None expected for additive DDL.

## 19. User-visible impact

None until clients deliberately switch read/write paths (later waves).

## 20. Unresolved decisions / Yellow

1. **Backup restore drill** not completed — required before apply.  
2. **OPEN-002** Work body mirroring still PENDING if Work payloads expand.  
3. **Focus hosted write RPC** not opened in 1A (select/list only) — deliberate.  
4. **complete_task** legacy upsert (P2-008) remains until writer canary.  
5. Unrelated local WIP dirty; must not be included in push.  
6. Local Kenos commits **ahead of origin/master** — push needs separate user authorization.

## 21. Exact approval phrase

To authorize Wave 1 hosted apply of the listed review SQL (additive schema/RLS/read RPC only; **no** writer revoke/cutover):

```text
APPROVE_KENOS_PRODUCTION_WAVE_1
```

Additional phrases (not granted by Wave 1):

```text
APPROVE_KENOS_PRODUCTION_WRITER_CANARY
APPROVE_KENOS_PRODUCTION_WRITER_CUTOVER
APPROVE_KENOS_LEGACY_WRITER_RETIREMENT
APPROVE_KENOS_APPLE_DISTRIBUTION
```

---

## Stage A stop

Awaiting Owner. Do not apply, cut over, deploy, or push from this packet alone.
