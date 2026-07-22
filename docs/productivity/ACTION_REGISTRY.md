# Kenos Action Registry(Phase A · A2/A3)

> 真源:`packages/contracts/src/kenos-actions.mjs`(代码级、版本控制内、运行时可 import)。
> 本文档是导读;冲突时以代码为准。测试:`packages/contracts/scripts/kenos-actions.test.mjs`。

## 每个 Action 的声明字段

`actionType · canonicalOwner · executor · riskLevel · reversible · idempotencyStrategy · approvalPolicy · activityType · outboxRequirement · timeoutMs · retryPolicy`(+可选 `undoActionType` / `frozen`)。缺任一字段在模块加载时直接 throw;测试锁定 ≥20 个动作、全部 frozen 对象。

## 风险等级与默认策略

| 等级 | 含义 | 策略(policyDecision) |
|---|---|---|
| R0 | 读/导航 | auto |
| R1 | 私有可逆写 | auto + Activity + undo 路径 |
| R2 | 外部可见/大范围可逆 | confirm_diff(normalized diff + 批量确认) |
| R3 | 破坏性/资金/安全敏感/不可逆 | per_item_approval(逐项、参数绑定、短时有效) |

**模型不得自行降低风险:** `resolveEffectiveRisk` 取「注册表声明」与「请求风险」的最大值;未知 action → null,调用方必须 fail-closed。`frozen` 动作(work.create_project / work.archive_project)一律 deny——**不得建立第二套 Project 真源**。

## 注册清单(22 个)

- **plan.*(8,R1,executor=既有生产 RPC):** create_task / update_task_title / update_task_due_date / update_task_schedule / update_task_project / complete_task(undo=reopen) / reopen_task(undo=complete) / archive_task
- **project.*(4,R1,executor=kenos_project_spine_action):** set_context / set_next_action / link_object / unlink_object
- **capture.*(2,R1):** ingest_envelope / convert_to_plan_task
- **approval.*(2,R1):** request(无 outbox) / decide(outbox 投递 approval.decided)
- **focus.*(2,R1):** start_context / end_context
- **outbox.dead_letter(R2,confirm_diff)** — 人工运维动作
- **assistant.save_memory(R1,executor=local:memoryStore)**
- **work.*(2,R3,frozen)** — 注册以封路,策略层 deny

## 审批接线(A3)

管线(apps/aios/src/lib/kenos/actionPipeline.core.js,接进 tools.js executeTool):

```text
executeTool → normalizeAction(TOOL_ACTION_MAP) → actionRegistry → policyDecision
           → approval when required(R2/R3 先拒并要求走审批) → executor → activity
```

- 已接线写工具:`planner_add_task`(→plan.create_task)、`save_memory`、`start_focus`、`end_focus`;R0 导航白名单:`open_space`、`compose_library_note`、`open_browser_page`、`browser_interact`。
- **approval-bypass 护栏测试**(actionPipeline.core.test.js):TOOL_ACTION_MAP 中每个工具必须在 tools.js 源码里出现 `guardToolAction('<name>'`,否则测试红;未声明的副作用工具运行时直接拒绝。
- 旧 env-flag deny-list(prodWriteGuard)保留为第二层 fail-closed(叠加,不替代)。

### 审批参数绑定

`kenos_action_approvals.normalized_parameters_hash` = 规范化(递归 key 排序)参数 JSON 的 sha256(`canonicalParametersJson` + `normalizedParametersHash`)。

- 请求侧(migration `20260722210000_kenos_approval_parameter_binding.sql`):`kenos_request_action_approval_action` 校验并持久化 hash;**同一 proposed action 出现不同 hash 的新请求时,旧 pending 审批自动转 superseded**(decided_by='system:parameter_change')。
- 执行侧:`approvalBindingValid(approval, action)` — status=approved + 未过期 + action_type 一致 + hash 重算一致,四者缺一不可;参数变化即失效。审批本身绑定 user_id(owner_id)/action_type/tool 映射/target(entity_refs)/risk/expires_at/correlation_id(表既有列)。
- 本轮 canary 动作全为 R1(auto),R2/R3 的实际执行路径保持 executor disabled(Owner gate);架构与绑定校验已统一并有测试。

## 新增 Action 的规程

1. 在 `kenos-actions.mjs` 注册完整字段(风险宁高勿低);2. SQL executor 走「信封校验+幂等+outbox+activity 单事务」模板;3. 若助手可调,加入 TOOL_ACTION_MAP 并在 executeTool 里 `guardToolAction`;4. 若需 worker 投递,加入 `CANARY_ACTION_TYPES` + `LIFE_EVENT_TYPE_BY_ACTION`(必须证明 replay-safe);5. 跑 contracts + aios + planner 测试。
