# Kenos Outbox 语义清点(Phase A · A1/A4)

> 日期:2026-07-22 · 基线 commit:23cb21e14 · 数据:生产库 live-query
> Worker epoch(隔离线):**2026-07-22T17:00:00Z**(`OUTBOX_WORKER_EPOCH`,packages/contracts/src/kenos-actions.mjs)

## 核心结论

1. **所有 outbox 行的业务态都已在同事务提交。** 每个 `kenos_*_action` RPC 在单个事务里写 幂等表 → 业务表(planner_tasks 等) → outbox(pending) → activity(succeeded)。outbox 消息是**投影/通知投递半**,不是待执行的业务副作用。历史 150 行的 correlation_id 与 activity 关联率 = 150/150(100%)。
2. **历史 pending 大部分是 QA 残留。** 幂等键前缀直接暴露生产者;引用实体已被清理的行(15 个 task 缺失、19 个 capture envelope 缺失)全部对应 `p5-loop-*` clean-room E2E 或 `*-smoke-*` 冒烟。
3. **投递语义 = 幂等投影到 `life_events`**(dedupe 唯一索引 `life_events_kenos_outbox_dedupe` on `(user_id, payload->>'outbox_id')`),事件 `status='processed'`(Planner 的 lifeEventsInbox 只消费 fitness/finance 两类,不受影响)。Today「Recently progressed projects」是第一个真实消费者。

## 逐类清点(截至 epoch 前的历史 150 行)

| action_type | producer(幂等键前缀证据) | 业务态已提交? | intended consumer | side effect | replay safe | 历史行数 | decision |
|---|---|---|---|---|---|--:|---|
| plan.create_task | plan_ui(61)+capture_convert(11)+smoke/seed(9) | ✅ planner_tasks 同事务 | life_events 投影(当时不存在) | 无(纯投影) | ✅(幂等索引) | 80 pending | **quarantine**(epoch 隔离,不重放) |
| plan.create_task (dead_letter) | outbox-smk | ✅(state-machine smoke) | — | — | — | 1 dead_letter | **keep as-is**(QA 产物,terminal_reason 自述) |
| plan.complete_task | plan_ui_complete + mcp_complete | ✅ | 同上 | 无 | ✅ | 10 | quarantine |
| plan.update_task_title | plan_ui_edit + edit | ✅ | 同上 | 无 | ✅ | 9 | quarantine |
| plan.update_task_due_date | plan_ui_due + smoke | ✅ | 同上 | 无 | ✅ | 12 | quarantine |
| plan.update_task_schedule | schedule-smoke ×4 + plan_ui_schedule | ✅(全 smoke 为主) | 同上 | 无 | ✅ | 5 | quarantine |
| plan.update_task_project | plan.update_task_project | ✅ | 同上 | 无 | ✅ | 1 | quarantine |
| plan.reopen_task | mcp-complete-smoke-reopen 等 | ✅ | 同上 | 无 | ✅ | 2 | quarantine |
| plan.archive_task | out-arch/ui-cap-arch/smoke | ✅ | 同上 | 无 | ✅ | 6 | quarantine |
| capture.ingest_envelope | capture_ingest/ui-cap/canary | ✅ envelope 同事务(19/23 envelope 已被 QA 清理→**orphaned**) | 分类/转换管线(不存在) | 无 | ✅ | 13 | quarantine(orphan 不重放) |
| capture.convert_to_plan_task | capture_convert | ✅ task 同事务 | 同上 | 无 | ✅ | 10 | quarantine |
| approval.decide | act-chain-dec | ✅ 决定已落(payload executor:'disabled';引用的 approval 行已被清理→**orphaned**) | 被批准动作的执行器(disabled) | 当时明确禁用 | ⚠️ orphan | 1 | quarantine(orphan) |

**分类五桶归位:** 已提交仅缺投影 = 全部 150 行;真正未执行的副作用 = 0;clean-room/QA replay ≈ 至少 60+ 行(键前缀可证);orphaned(引用实体已清理)= 34 行(15 task + 19 envelope/approval 交叠);unknown = 0。

**Quarantine 机制:** 不改历史行状态(零风险、可审计、可逆)。worker 的 claim SQL(`kenos_outbox_worker_claim`)与核心过滤(`shouldProcessRow`)双层强制 `created_at >= epoch`;metrics 分开报告 `new` 与 `historicalQuarantined`。若未来要重放某历史行:先人工确认实体存在,再 `kenos_outbox_worker_requeue`(仅 dead_letter)或以新 action 重发——**默认永不重放**。

## Canary worker(A4 实现)

- 运行体:`apps/planner/agent/outbox-worker.mjs`(launchd `space.kenos.outbox-worker`,KeepAlive);纯逻辑在 `apps/planner/server/outboxWorker.core.mjs`(单测覆盖)。
- SQL 面(migration `20260722191520_kenos_outbox_worker_delivery.sql`,service_role only):
  `kenos_outbox_worker_claim(epoch, limit≤50, lease)` FOR UPDATE SKIP LOCKED + lease(processing 期间 next_attempt_at=租约到期,过期可重取)· `_deliver`(事务内 insert life_events on conflict do nothing + CAS→published)· `_fail`(attempts≥5 或 permanent→dead_letter,否则 retry)· `_requeue`(仅 dead_letter→pending,人工)· `_metrics`。
- 参数:batch 10 · poll 20s · lease 300s · max_attempts 5 · retry 30s/2m/10m/1h/6h(`RETRY_SCHEDULE_MS`)。
- 消费白名单:`CANARY_ACTION_TYPES`(15 类:plan.* ×8、project.* ×4、capture.* ×2、approval.decide)。白名单外(focus.*、work.*)即使入队也不消费(fail-closed,log warn)。
- 紧急停用:`touch ~/.kenos/outbox-worker.disable` 或 env `KENOS_OUTBOX_WORKER_DISABLED=1`(每轮轮询检查)。
- 凭据:`~/.kenos/outbox-worker.env`(chmod 600,SUPABASE_SERVICE_ROLE_KEY)。

## 验证记录(2026-07-22,生产库)

- 25 条 post-epoch 真实 canary(含 Ken 当日 Planner UI 的 create/complete + spine 种子动作)全部 drain:`{"new":{"published":25}}`,oldest age → null。
- 重复投递幂等:published 行人为回置 processing 再投递 → `duplicate:true`,该 outbox_id 的 life_events 恒为 1 行。
- 25 events / 25 distinct outbox_ids;activity correlation 25/25。
- 历史 149 pending + 1 dead_letter 全程原样未动。
