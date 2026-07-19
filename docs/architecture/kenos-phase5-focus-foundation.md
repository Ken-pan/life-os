---
title: Kenos Phase 5 Focus foundation
owner: kenpan
last_verified: 2026-07-19
doc_role: architecture-temporary-approval
status: temporary-approved-for-phase-5-focus-foundation
---

# Kenos Phase 5 Focus foundation

## Temporary approval

`TEMPORARY_APPROVED_FOR_PHASE_5_FOCUS_FOUNDATION`

批准范围（本地 / 可逆 / 非生产）：

- FocusContext canonical contract（additive, schemaVersion `"1"`）
- System/Platform owns FocusContext、InterruptionPolicy、DeferredItem、scoped Assistant policy、InterventionBudget
- Domain sessions remain behind EntityRef only（Training workout / Work project 等）
- Training Focus + Deep Work Focus 本地纵向切片
- Web AIOS + Apple iPhone/iPad/macOS Focus Session UI；Watch Focus-active glance
- Fake/local simulation only — 无生产 Executor、无生产通知、无 writer cutover

复审条件（任一触发必须复审，不得自动进入生产）：

- 生产 APNs / Apple Focus entitlement / App Group
- 真实 Approval approve/reject 或生产 Executor
- Domain Owner 变更或非 additive contract break
- Portal retirement / writer cutover / deploy

## Ownership

| Concern | Owner |
| --- | --- |
| FocusContext / transitions / interruption / deferred / budget | System / Platform |
| Workout session facts | Training |
| Work project / meeting context | Work |
| Plan task execution state | Plan |
| Assistant scoped answers + suggestions | Assistant (read FocusContext; no canonical domain writes) |

## Top-level IA prerequisite

`Today · Assistant · Spaces · Inbox`（Nav IA tranche 1）。Capture 仍为全局动作。

## Out of scope this tranche

生产主动智能、自动进入系统 Focus、不可逆删除、凭证操作、Portal cutover。
