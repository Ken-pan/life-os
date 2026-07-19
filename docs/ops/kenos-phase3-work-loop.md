---
title: Kenos Phase 3 Work loop foundation runbook
owner: kenpan
last_verified: 2026-07-19
status: work-loop-foundation-ready-no-production-cutover
---

# Kenos Phase 3 Work 生产力闭环（foundation）

## 授权

`TEMPORARY_APPROVED_FOR_PHASE_3_WORK_FOUNDATION`

允许：Work inventory、additive contracts/fixtures/Swift parity、review-only SQL/RLS、AIOS `/work` surface、WorkActionProposal→Plan **simulation**、Library EntityRef、Today Work projections、Connector read-only registry proposal、shadow diagnostics、Phase 3 guard。

禁止：生产 migration apply、Executor、writer cutover、自动 Connector→canonical Work 写入、Plan Task owner 变更、Library owner 变更、Phase 4 Apple UI、Phase 5 主动智能、deploy/push。

## Ownership（临时）

| Owner | Objects |
| --- | --- |
| Work | Project, Deliverable, Meeting, Decision, Work Context, statuses, source refs |
| Plan | Task, schedule, due, completion, recurrence, personal queue |
| Library | Document / note / research assets |
| Platform/System | Approval, Activity contract, Policy, EntityRef/Action envelopes |
| Assistant | Read projections / submit Actions / display context only |
| Connector | CaptureEnvelope / source refs only |

Plan projects（任务分组）≠ Work Projects。OPEN-002 仍阻止 Work body 镜像进个人云。

## 本地验证

```bash
node packages/contracts/scripts/kenos.test.mjs
node --test apps/aios/src/lib/workCommand.core.test.js
node scripts/check-kenos-phase3-work-db.mjs
node scripts/check-kenos-phase3.mjs
npm run test -w aios-os
```

UI：`apps/aios` 开发态打开 `/?kenosDemo=1` 与 `/work?kenosDemo=1`。Task conversion 默认 Off；演示态可 simulation Create task，且 `productionWrite: false`。

## 回滚

禁用 `VITE_KENOS_PHASE3_WORK` / 去掉 demo query；移除 `/work` 路由入口。review SQL 从未生产 apply，无需 drop 用户数据。
