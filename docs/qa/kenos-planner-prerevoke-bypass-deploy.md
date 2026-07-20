---
title: KENOS PLANNER PRE-REVOKE BYPASS FIX — OWNER-LIMITED PROD
owner: kenpan
last_verified: 2026-07-20
status: DEPLOYED — NO_LEGACY_REVOKE
---

# Planner due/schedule bypass + MCP complete → Kenos

| Item | Value |
| --- | --- |
| SHA | `9bc298c28a546f9e09dfbc27bfaeef457c3b5fd0` |
| Deploy (UI) | `6a5e2efe1457d911e47106a7` then functions refresh `6a5e2f18f5e5050e35b63590` |
| URL | https://planner.kenos.space |
| Bake | All Track A/B writers On; Owner email cohort; offline queue Off |
| Executor | disabled |
| Legacy revoke | **none** |

## Changes

1. TaskRow / InsightCard due shortcuts → `updateTaskDueDateAsync`
2. Schedule UI (`applyTaskSchedule` / clear / DayTimeline undo) → `updateTaskScheduleAsync`
3. MCP `complete_task` → `kenos_complete_plan_task_action` (no upsert fallback)
4. Capture convert client foundations on AIOS (flag default Off)

## Apple

Owner attested「真机已开」; KenosIOS installed on 17 Pro.

## Still blocked for Legacy revoke

Restore writer, uncovered fields, offline policy, observation packet, cohort expansion.
