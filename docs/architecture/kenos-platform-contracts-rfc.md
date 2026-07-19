---
title: Kenos Core Platform Contracts RFC
owner: kenpan
last_verified: 2026-07-19
doc_role: architecture-rfc
status: V1_FROZEN_FOR_PHASE_1_PRODUCTION_REVIEW
rfc_version: 1.0.0
---

# Kenos Core Platform Contracts RFC

## 1. 目的

定义 Web Spaces、Apple 客户端、Paper、Web Lens、Figma/Jira Connectors、Assistant 和后台 worker 之间的最小稳定语义。共享契约只描述“是什么”和“允许做什么”，不包含 UI、CSS、Svelte store、路由或某个 app 的内部表结构。

这是 Phase 1 已冻结的 v1 production-review contract。运行时真源是 `packages/contracts/src/kenos.ts`，机器可读的版本、枚举、必填字段、Outbox 转移和 fixture 目录是 `packages/contracts/fixtures/kenos/v1/manifest.json`。同一 corpus 已在 TypeScript、Planner browser/server、disposable SQL 和 Swift Codable 中验证。此冻结只授权生产安全/迁移评审，不表示生产 migration、writer cutover、deploy 或 Phase 2 已批准。

## 2. 现有基础与增量策略

当前 `@life-os/contracts` 已有 appearance、meta、sync、nav、content、feedback 和 runtime `events`。新契约应增量加入，不另建第二个通用 contracts package。

拟新增模块:

```text
@life-os/contracts/entity
@life-os/contracts/action
@life-os/contracts/capture
@life-os/contracts/activity
@life-os/contracts/approval
@life-os/contracts/mutation
@life-os/contracts/connector
@life-os/contracts/recommendation
@life-os/contracts/asset
```

规则:

- type-only 模块继续无运行时依赖。
- 需要不可信输入校验的 envelope 可像 `events` 一样提供 Zod runtime schema。
- `contracts` 不依赖 theme、platform-web、sync、apps 或原生 SDK。
- 所有跨域 ID、枚举和 envelope 版本都在这里定义；领域 payload schema 归领域所有。

## 3. 通用标识

```ts
export type KenosDomainId =
  | 'core'
  | 'assistant'
  | 'work'
  | 'plan'
  | 'library'
  | 'memory'
  | 'health'
  | 'training'
  | 'money'
  | 'home'
  | 'music'
  | 'paper'
  | 'system'
  | 'automation'
  | 'notifications'
  | 'integration'

export type SecurityDomain = 'personal' | 'work' | 'household' | 'system'

export type DataClassification =
  | 'public'
  | 'personal'
  | 'sensitive'
  | 'work_confidential'
  | 'restricted_local_only'
  | 'ephemeral'

export type ISODateTime = string
export type UUID = string
```

校验要求:

- UUID 和 timestamp 在 runtime boundary 校验，不依赖 TypeScript 假设。
- 未知 security domain 或 classification 拒绝写入，不静默映射。
- 缺失 classification 的 legacy 读取按更严格默认处理，迁移完成后变为 NOT NULL。

## 4. Entity Contract

### 4.1 EntityRef

跨领域只传引用，不传目标领域内部可写对象。

```ts
export interface EntityRef {
  id: UUID
  type: string
  ownerDomain: KenosDomainId
  ownerId: UUID
  version?: number
}
```

约束:

- `id` 是全局引用 ID；`ownerId` 是领域内部主键。若早期二者相同也不可省略语义。
- `type` 使用稳定命名，例如 `plan.task`、`work.project`、`library.document`。
- 其他域不能依赖目标表名、SQL schema 或 URL 构造引用。
- `EntityRef` 不授权访问。读取仍经过 auth context 和 policy。

### 4.2 EntityMetadata

```ts
export interface EntityMetadata extends EntityRef {
  securityDomain: SecurityDomain
  dataClassification: DataClassification
  createdAt: ISODateTime
  updatedAt: ISODateTime
  archivedAt?: ISODateTime | null
}
```

### 4.3 EntityLink

```ts
export type EntityLinkRelation =
  | 'references'
  | 'derived_from'
  | 'supports'
  | 'blocks'
  | 'fulfills'
  | 'related_to'

export interface EntityLink {
  id: UUID
  from: EntityRef
  to: EntityRef
  relation: EntityLinkRelation | string
  source: 'user' | 'rule' | 'import' | 'ai'
  confidence?: number
  createdBy: UUID
  createdAt: ISODateTime
}
```

AI 建立的 link 必须有 `confidence` 和可追溯 source refs；不得把低置信推断伪装成用户确认关系。

## 5. Action Contract

### 5.1 ActionRequest

```ts
export type ActionRisk = 'R0' | 'R1' | 'R2' | 'R3' | 'R4'

export interface ActionRequest<TPayload = unknown> {
  schemaVersion: '1'
  id: UUID
  actionType: string
  producer: KenosDomainId
  targetDomain: KenosDomainId
  target?: EntityRef
  actor: {
    type: 'user' | 'assistant' | 'automation' | 'connector' | 'system'
    id: UUID
  }
  deviceId: UUID
  securityDomain: SecurityDomain
  dataClassification: DataClassification
  requestedRisk?: ActionRisk
  payload: TPayload
  reason?: string
  evidenceRefs?: EntityRef[]
  idempotencyKey: string
  expectedVersion?: number
  requestedAt: ISODateTime
  expiresAt?: ISODateTime
  correlationId: UUID
  causationId?: UUID
}
```

`producer` 与结构化 `actor` 是 0.2 相对原草案的明确补强：前者记录动作入口所属域，后者同时保存 actor 类型与稳定 ID，以满足 Activity provenance 和服务端身份绑定；两者都不授予权限，Executor 仍必须把 actor ID 绑定到 auth context。

`actionType` 用意图命名，不用低级字段更新命名:

```text
plan.create_task
plan.complete_task
plan.reschedule_task
library.save_source
work.add_decision
health.log_state
training.start_workout
system.approve_action
automation.run
```

禁止 `set_row`、`update_json`、`execute_sql` 这类绕过领域语义的公共动作。

### 5.2 ActionDecision

Policy/Risk/Approval 的结果必须可解释:

```ts
export interface ActionDecision {
  requestId: UUID
  outcome: 'allow' | 'require_approval' | 'deny' | 'expired'
  evaluatedRisk: ActionRisk
  policyVersion: string
  reasons: string[]
  requiredApproval?: {
    level: 'confirm' | 'strong_confirm'
    expiresAt: ISODateTime
  }
  decidedAt: ISODateTime
}
```

### 5.3 ActionResult

```ts
export interface ActionResult<TResult = unknown> {
  requestId: UUID
  status: 'succeeded' | 'failed' | 'queued' | 'conflict' | 'cancelled'
  result?: TResult
  affectedEntities: EntityRef[]
  activityId: UUID
  undoAction?: ActionRequest
  error?: {
    code: string
    message: string
    retryable: boolean
    userAction?: string
  }
  completedAt?: ISODateTime
}
```

错误 message 面向用户必须说明影响与数据安全；内部 stack、token、SQL 不进入公共 result。

## 6. Approval Contract

```ts
export interface ApprovalRequest {
  id: UUID
  actionRequestId: UUID
  risk: ActionRisk
  summary: string
  impact: string[]
  sensitiveFieldsRedacted: boolean
  reversible: boolean
  expiresAt: ISODateTime
  createdAt: ISODateTime
}

export interface ApprovalDecision {
  approvalId: UUID
  decision: 'approved' | 'rejected' | 'expired'
  decidedBy: UUID
  authStrength: 'session' | 'reauthenticated' | 'biometric_or_device'
  constraints?: Record<string, unknown>
  decidedAt: ISODateTime
}
```

约束:

- Approval 绑定精确的 action request hash/version；修改 payload 后旧批准失效。
- R4 默认需要强确认和备份证据。
- 批量操作的摘要必须包含对象数、范围和不可逆影响。
- 审批不是执行；Executor 仍需重新验证 auth、version 和 idempotency。

## 7. Capture Contract

Capture 负责“捕获一次，后续多用”，不是立即决定所有最终归属。

```ts
export type CaptureKind =
  | 'text'
  | 'url'
  | 'image'
  | 'audio'
  | 'document'
  | 'scan'
  | 'receipt'
  | 'room_scan'
  | 'clipboard'
  | 'external_object'

export interface CaptureEnvelope<TPayload = unknown> {
  schemaVersion: '1'
  id: UUID
  kind: CaptureKind | string
  payload: TPayload
  source: {
    client: string
    deviceId: UUID
    connectorId?: UUID
    externalUrl?: string
    externalId?: string
  }
  actorId: UUID
  securityDomain: SecurityDomain
  dataClassification: DataClassification
  suggestedDomains?: KenosDomainId[]
  contextRefs?: EntityRef[]
  contentHash?: string
  capturedAt: ISODateTime
  expiresAt?: ISODateTime
  idempotencyKey: string
}
```

处理阶段:

```text
received -> safely_persisted -> classified -> routed -> materialized -> reviewed(optional)
         -> failed_retryable | failed_terminal | quarantined
```

规则:

- 客户端先安全持久化 capture，再进行 AI 分类。
- 同一内容可以 materialize 到多个领域，但每个领域只产生自己的正式对象或引用。
- 原始内容和派生结果分别保存 provenance。
- restricted/work 内容的模型路由由 policy 决定，不能由 Capture UI 猜测。
- 不确定分类可保守进入 Inbox，不要求用户立刻完成复杂归档。

## 8. Activity Contract

```ts
export interface ActivityRecord {
  schemaVersion: '1'
  id: UUID
  eventType: string
  actor: { type: 'user' | 'assistant' | 'automation' | 'connector' | 'system'; id: UUID }
  actionRequestId?: UUID
  approvalId?: UUID
  targetRefs: EntityRef[]
  securityDomain: SecurityDomain
  summary: string
  reason?: string
  result: 'succeeded' | 'failed' | 'queued' | 'undone' | 'cancelled'
  policy?: ActionDecision
  changes?: Array<{ path: string; before?: unknown; after?: unknown; redacted?: boolean }>
  redactedPayload?: Record<string, unknown>
  undo?: { supported: boolean; actionType?: string }
  undoUntil?: ISODateTime
  correlationId: UUID
  causationId?: UUID
  occurredAt: ISODateTime
}
```

Activity 是用户可理解的动作历史；Audit 可以有更严格、更详细的安全记录。两者可以共享 ID，但不能只留裸日志文件替代产品可观察性。

## 9. Mutation 与 Outbox

```ts
export interface MutationEnvelope<TPayload = unknown> {
  schemaVersion: '1'
  mutationId: UUID
  idempotencyKey: string
  entity: EntityRef
  actorId: UUID
  deviceId: UUID
  baseVersion?: number
  operation: string
  payload: TPayload
  occurredAt: ISODateTime
}

export interface OutboxRecord<TPayload = unknown> {
  id: UUID
  topic: string
  aggregate: EntityRef
  payload: TPayload
  schemaVersion: '1'
  actionRequestId?: UUID
  idempotencyKey: string
  correlationId: UUID
  causationId?: UUID
  occurredAt: ISODateTime
  availableAt: ISODateTime
  attempts: number
  maxAttempts?: number
  status: 'pending' | 'processing' | 'published' | 'retry' | 'dead_letter'
  lastErrorClass?: 'transient' | 'permanent'
  failureReason?: string
  updatedAt?: ISODateTime
}
```

要求:

- 领域状态与 Outbox 在同一事务提交。
- producer 负责稳定 idempotency key；consumer 必须去重。
- 重试不会重复产生对外副作用。
- 顺序敏感事件按 aggregate version 处理，不假设全局顺序。
- dead letter 必须进入 System issue，不得静默堆积。

## 10. Connector Contract

```ts
export type ConnectorState =
  | 'disconnected'
  | 'connecting'
  | 'healthy'
  | 'degraded'
  | 'reauth_required'
  | 'rate_limited'
  | 'schema_changed'
  | 'disabled'
  | 'retired'

export interface ConnectorDescriptor {
  id: UUID
  type: string
  displayName: string
  securityDomain: SecurityDomain
  scopes: string[]
  writeEnabled: boolean
  state: ConnectorState
  lastSuccessAt?: ISODateTime
  lastError?: { code: string; safeMessage: string; retryAt?: ISODateTime }
  syncScope: string
  retentionPolicy: string
  mirrorDeletionPolicy: 'keep' | 'delete' | 'ask'
  credentialRef: string
}
```

`credentialRef` 指向安全存储，不包含 token。插件不得持有 Supabase service role；工作数据默认不用于模型训练；DOM 自动化需用户主动启动或明确授权。

## 11. Recommendation Contract

```ts
export interface Recommendation<TAction = unknown> {
  id: UUID
  sourceDomain: KenosDomainId
  requestedAction: TAction
  urgency: number
  importance: number
  externalCommitment: boolean
  estimatedMinutes?: number
  energyType?: string
  energyCost?: number
  deferrability: number
  consequenceIfSkipped?: string
  reversibility: number
  confidence: number
  goalRefs: EntityRef[]
  evidenceRefs: EntityRef[]
  createdAt: ISODateTime
  expiresAt?: ISODateTime
}
```

分值范围需在实现 RFC 中冻结。硬约束与建议分开表达，避免 LLM 把偏好解释成安全约束或反之。

## 12. Asset Contract

```ts
export interface AssetRef {
  id: UUID
  ownerDomain: KenosDomainId
  kind: 'document' | 'image' | 'audio' | 'video' | 'scan' | 'model' | string
  storageTier: 'supabase' | 'icloud' | 'vault' | 'external' | 'device_cache'
  locator: string
  contentHash?: string
  version?: number
  available: boolean
  availabilityReason?: 'offline' | 'vault_disconnected' | 'not_downloaded' | 'permission_denied'
  securityDomain: SecurityDomain
  dataClassification: DataClassification
}
```

`locator` 是 opaque locator，不允许 iPhone 把 Mac 裸路径当作可访问 URL。界面显示“Vault 未连接”而不是“文件丢失”。

## 13. 版本与兼容策略

### 13.0 v1 freeze 证据

- 所有 runtime envelope 使用 JSON string major `'1'`；numeric `1` candidate 作为 pre-freeze 不兼容输入 fail closed。
- 同一 major 允许新增可选字段；consumer 接受并忽略未知附加字段。未知版本、枚举和必需语义拒绝。
- UUID、UTC ISO-8601 timestamp、`ownerId`、`dataClassification`、risk 和 Outbox status 在 manifest、Zod、Swift 和 SQL command boundary 中对齐。
- 破坏性变更必须新 major、migration/compatibility policy 和 Decision Register 记录；不得静默改写 v1。
- `clients/apple/Packages/KenosContracts` 是契约 package/test target，不是 Phase 4 Apple app/workspace；未来 targets 应依赖它而不复制 models。

### 13.1 规则

- 每个 runtime envelope 必须有 `schemaVersion`。
- 同一 major 内只做可选字段或新枚举值等 additive change。
- consumer 对未知可选字段忽略，对未知必需语义拒绝并进入可观察错误。
- 删除字段先停止写入，再观察旧消费者，最后删除读取兼容。
- 兼容层进入 Migration Ledger，必须有 owner 和 expiry。
- 跨设备客户端按 `minSupportedVersion`/capability negotiation 降级，不猜测。

### 13.2 事件命名

```text
<owner-domain>.<aggregate>.<past-tense-event>
plan.task.created
plan.task.completed
library.source.saved
money.transaction.corrected
system.connector.degraded
```

Action 用命令语态，event 用已发生语态，Activity 用用户可读摘要。三者不能混为一张无语义消息表。

## 14. 数据库逻辑对象（非最终 SQL）

第一阶段候选:

```text
core.entity_registry
core.entity_links
core.security_domains / classification metadata
assistant.action_requests
assistant.approvals
audit.activity
integration.outbox
integration.connector_instances
integration.connector_health
core.capture_inbox
```

在当前共享 Supabase 迁移机制下，实际 schema 名、暴露方式、grants 和 RLS 必须先按 [`../ops/supabase.md`](../ops/supabase.md) 验证。不要仅因为逻辑架构写了多 schema 就直接创建全部对象。

## 15. RLS 与授权最低要求

- 所有暴露给客户端的表启用 RLS。
- policy 明确 `TO authenticated`，并同时使用 `USING` / `WITH CHECK` 约束 owner 与安全域。
- 不用用户可修改的 `raw_user_meta_data` 作为授权来源。
- read model/view 使用 `security_invoker` 或放在未暴露 schema，并有真实双用户拒绝测试。
- service role 只存在于受控 server/worker；不得进入 Web、插件或 Apple 客户端。
- 跨域访问不能只凭 `user_id`，还要经过 capability/scope/policy。

## 16. 首个垂直切片建议

不要一次实现全部契约。首个切片建议为 `plan.create_task`:

1. Assistant 生成 `ActionRequest<PlanCreateTaskPayload>`。
2. Policy 将其评为 R1/R2（取决于是否修改现有计划）。
3. Plan Executor 以 `idempotencyKey` 创建任务。
4. 同一事务写 Outbox。
5. Activity 显示来源、原因和结果。
6. iPhone/Mac/Web 任一客户端可重试而不重复创建。
7. 断网时本地 queued，恢复后同步。
8. Work 可保存 task `EntityRef`，但不保存第二完成状态。

该切片验证 Action、Mutation、Outbox、Activity、EntityRef 和跨端同步，范围小于 Portal/命名迁移。

## 17. RFC 通过标准

- 至少两个不同消费者验证每个准备冻结的契约。
- 领域 Owner、security domain、classification 和 risk 有明确取值。
- TypeScript runtime schema、SQL 约束和 Apple Codable fixture 对同一 JSON corpus 通过。
- 网络重试不会重复副作用。
- 双用户和跨域拒绝测试通过。
- Activity 可被普通用户理解，敏感字段已遮蔽。
- 兼容读取、回滚和删除旧 envelope 的期限进入 ledger。
- `npm run check:lifeos-boundaries`、`npm run check`、`npm run build` 通过。

## 18. 参考

- [Transactional Outbox](https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos): 业务状态和事件原子写入，relay 可重试。
- [CQRS pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs): 写模型负责业务一致性，读模型服务查询；本项目只采用必要分离，不引入独立数据库。
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): `auth.uid()`、`TO authenticated`、`USING`/`WITH CHECK` 和 view 安全边界。
