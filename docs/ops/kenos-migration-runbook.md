---
title: Kenos 重构迁移操作手册
owner: kenpan
last_verified: 2026-07-18
doc_role: migration-runbook
status: ready-for-phase-0-no-production-action-authorized
---

# Kenos 重构迁移操作手册

> 本手册描述未来迁移怎么安全执行，不授权当前会话修改生产数据库、域名、部署或删除旧 App。每个具体迁移必须先进入 [`../roadmap/KENOS_MIGRATION_LEDGER.md`](../roadmap/KENOS_MIGRATION_LEDGER.md)。

## 1. 适用范围

用于以下任何变化:

- 数据 Owner 或唯一 writer 切换。
- 新旧表/schema、缓存格式或本地数据目录迁移。
- Portal/路由/域名/默认入口切换。
- Life OS → Kenos 的用户可见命名迁移。
- Tauri/Capacitor/companion → 统一 Apple 客户端迁移。
- 旧 MCP/Connector/Action 写路径切到 Policy/Executor。
- AppShell/Settings 等生产 Web 平台收敛。

单纯文案修正或无状态组件替换不需要完整数据 cutover，但仍需对应 QA gate。

## 2. 角色与授权

| 角色 | 责任 | 不能做 |
| --- | --- | --- |
| Owner（Ken） | 冻结产品语义、批准 R3/R4、确认真实使用和退役 | 把不清楚的安全/数据决定默认交给 Agent |
| Implementer | 限定 slice、写迁移/兼容/测试、记录证据 | 扩大范围、处理他人 WIP、绕过 ledger |
| Domain owner | 确认模型、校验和单一 writer | 直接写其他领域表 |
| Operator | 执行生产 migration/deploy/cutover/rollback | 在无备份/对账/批准时执行 |
| Reviewer/QA | 验证边界、RLS、回归、真实使用、恢复 | 仅以 build 成功签收 |

单人项目中同一人可承担多角色，但必须按顺序完成职责，不能用“都是我”跳过审批或证据。

## 3. 每次迁移的标准生命周期

```text
1 Define target owner
2 Freeze legacy expansion
3 Add compatibility read
4 Backfill/map historical data
5 Reconcile
6 Cut over to one new writer
7 Validate + real use
8 Make legacy read-only
9 Redirect old entry
10 Observe
11 Delete legacy implementation
12 Delete compatibility layer
```

不允许的终态:

- 新旧两端都可编辑。
- 旧 writer 只靠团队约定停用，代码仍可调用。
- migration 完成但没有 reconciliation。
- redirect 永久存在却没有删除期。
- “以后再删”作为完成标准。

## 4. 开工前 Git preflight

仓库规则以根 `AGENTS.md` 为准: `master` 唯一分支，不创建 worktree、stash、checkpoint ref。

### 4.1 只读检查

```bash
cd "/Users/kenpan/「Projects」/life-os"
git branch --show-current
git status --short --branch
git worktree list
git rev-parse HEAD
git fetch origin master
git rev-list --left-right --count master...origin/master
```

必须满足:

- branch 是 `master`。
- 无 merge/rebase/cherry-pick 进行中。
- worktree list 只有 canonical checkout。
- 明确当前本地领先/落后情况。

### 4.2 脏工作树规则

- 所有现有修改都属于用户或其他在飞工作，不得 reset/restore/clean/stash。
- 找出本 slice 独占目录；只编辑和 stage 自己的路径。
- 不运行 `git add -A`、`git add .`、`git commit -a`。
- 如果变更会触及别人已修改的同一文件，停止并协调，不能覆盖。
- 仓库干净时才执行 `git pull --rebase`；脏工作树不能为了满足规则而临时 stash。

### 4.3 Scoped commit

```bash
git diff -- <owned-path-1> <owned-path-2>
git add <owned-path-1> <owned-path-2>
git diff --cached --check
git diff --cached --stat
git commit -m "<canonical-id>: <single-slice summary>"
git push origin master
```

提交前再次确认 staged files 不含他人 WIP。迁移实现、生成物和验证文档可同 slice 提交；无关格式化不得混入。

## 5. Slice 设计模板

实施前写清以下内容:

| 问题 | 必填答案 |
| --- | --- |
| User outcome | 用户能完成什么，减少什么负担 |
| Current owner/writers | 所有当前写路径，包括脚本、RPC、客户端、本地 store |
| Target owner/writer | 切换后唯一入口 |
| Readers | 哪些页面、客户端、Connector、Agent 读取 |
| Security | domain、classification、RLS、model policy |
| Compatibility | 双读/adapter 如何工作，何时删除 |
| Backfill | 可重复、幂等、批量大小、断点 |
| Reconciliation | 计数、hash、抽样、业务不变量 |
| Cutover | 谁批准、何时、怎么关闭旧 writer |
| Rollback | 截止时间、数据反向同步/补偿、UI 恢复 |
| Failure | 离线、限流、部分成功、版本冲突 |
| Retirement | 代码、表、权限、任务、域名、文档删除 |

## 6. 数据迁移 preflight

### 6.1 仓库事实确认

```bash
find apps -path '*/supabase/migrations/*.sql' -type f | sort
rg -n '<table-or-rpc-name>' apps packages docs
sed -n '1,240p' docs/ops/supabase.md
```

当前共享 Supabase 项目有多 app migration 历史分叉，网络环境直连 5432 不可用。远程 SQL 使用:

```bash
./scripts/supabase-sql.sh "<read-only SQL>"
./scripts/supabase-sql.sh -f <migration.sql>   # 有副作用，仅在批准的 apply 步骤
```

不要直接假设 `supabase db push` 安全，也不要用 `migration repair --reverted` 删除真实历史。

### 6.2 生产指纹与备份

应用 migration 前必须记录:

- 目标 project/ref 和执行身份。
- 相关表、view、function、trigger、RLS policy 的定义/计数。
- 迁移历史表状态。
- 最近成功备份和恢复方式。
- 关键业务计数、NULL/重复/孤儿数。
- 预估锁和执行时间。

读查询示例（替换占位符）:

```sql
select count(*) from <schema>.<table>;
select count(*) from <schema>.<table> where <required_column> is null;
select <natural_key>, count(*)
from <schema>.<table>
group by <natural_key>
having count(*) > 1;
```

敏感数据不导出到 git、日志或聊天。证据记录计数、hash 和脱敏样本，不记录 token/正文。

## 7. Expand / Migrate / Contract 数据流程

### 7.1 Expand

先做向后兼容结构:

- 新 nullable column/table/index。
- 新 read adapter 或 view。
- 新 envelope parser 支持旧版本。
- RLS/permissions 先拒绝未授权访问。
- 不在同一次 migration 删除旧列或改不可逆类型。

对大表使用分步 index/constraint 策略；在 migration 开头设置合理 lock timeout，避免无限等待。

### 7.2 Backfill

要求:

- 脚本/SQL 幂等，可重复运行。
- 按主键或时间窗口分批，记录 checkpoint 在正式 migration state，不建 Git checkpoint branch。
- 每批记录 scanned/changed/skipped/conflict/failed。
- 不覆盖用户在迁移期间产生的新版本。
- AI 生成映射必须保留 confidence/provenance，低置信进入 review queue。

### 7.3 Reconcile

至少检查:

- source/target 总数和按 owner/security/classification 分组数。
- 自然键重复、孤儿 EntityRef、缺失版本。
- 写前/写后业务不变量。
- 抽样读取和真实用户路径。
- RLS 双用户/跨域拒绝。
- Outbox pending/failed/dead-letter。

对账不等于 count 一样；例如任务还要核对完成状态、tombstone、due date/timezone 和引用。

### 7.4 Cutover

切换顺序:

1. 进入短维护窗口或启用写入 gate。
2. 停止旧 writer 接受新请求。
3. 清空/固定旧队列，记录最后 mutation/version。
4. 跑最终增量 backfill。
5. 对账。
6. 启用新 writer。
7. 做一个可撤销 smoke write/read/undo。
8. 检查错误率、队列、Activity 和核心 UI。
9. 将旧端明确设置 read-only；不是只隐藏按钮。

任何步骤失败即停止，不自动继续删除旧实现。

### 7.5 Contract

观察窗口通过后:

- 删除旧写入 API、RPC、触发器、客户端逻辑和权限。
- 删除旧 UI/route/deploy/background job。
- 删除兼容 read/adapter 和 feature toggle。
- 最后才删除旧列/表/文件，且需单独 R4 批准和备份。
- 更新 docs/ops、architecture、Roadmap/SHIPPED 和 Ledger。

## 8. RLS 与权限操作清单

对每个新客户端可访问对象:

1. `enable row level security`。
2. policy 明确 `TO authenticated`。
3. `SELECT` 使用 owner + security domain 条件。
4. `INSERT` 使用 `WITH CHECK` 防止伪造 owner/domain/classification。
5. `UPDATE` 同时有 `USING` 和 `WITH CHECK`。
6. `DELETE` 默认不开放或转 soft delete。
7. view 使用 `security_invoker` 或不暴露给 anon/authenticated。
8. 用两个真实 JWT 证明跨用户拒绝。
9. 用同一用户不同 capability 证明跨域拒绝。
10. service role 路径只在受控 worker/server，所有调用写 Audit。

## 9. Action/Outbox cutover

将旧直接写工具迁到 Action Executor:

1. 清点现有 Web button、MCP tool、RPC、automation、native intent。
2. 给动作定义稳定 `actionType`、payload schema、risk 和 owner。
3. 实现 Policy/Approval 但先 shadow evaluate，不阻塞旧流。
4. 比较 shadow decision 与现有行为，修复误判。
5. 新入口开始调用 Action Request；旧入口只保留 adapter。
6. 领域写入和 Outbox 同事务；Activity 返回给入口。
7. 验证 timeout/retry/idempotency/version conflict。
8. 关闭旧直接写方法并撤销其 DB grants。
9. 删除 adapter。

不得为了兼容让旧工具和 Executor 同时写两次。

## 10. Portal 退役操作指南

### 10.1 前置验收

在 Portal freeze 前确认:

- Assistant Today 能显示并操作当前 Portal 的重要摘要。
- Inbox/Approval/Activity/System issues 可用。
- 所有现役 Space 有全局导航和 deep link。
- 登录、SSO、default entry、badge、PWA/安装策略已映射。
- Portal 独有 preference 和 localStorage key 已盘点。

### 10.2 Freeze

- 在 Roadmap/Portal 分卷标“migration frozen”。
- 代码只接受安全/数据正确性/迁移修复。
- 添加可观测的旧写入计数和入口流量。
- 不先删除 UI。

### 10.3 Redirect rollout

1. 内部导航默认改 Assistant/Today。
2. 通知、AppBrandSwitcher、登录回调先改新入口。
3. Portal 首页显示 read-only migration notice。
4. `portal.kenos.space` 路由逐路径映射，不用一条 wildcard 吞掉语义 deep link。
5. 保留明确 rollback 开关/配置，设 expiry。
6. 观察 auth errors、404、loop、old writes 和 bounce。

### 10.4 Delete

观察期通过后删除:

- Portal 写入、RPC/read model 的 Portal 专属部分。
- Portal settings/preferences 和重复 UI。
- Netlify site/deploy script/manifest/registry/PWA/CI 接线。
- 旧域名 DNS 仅在保留期结束后处理；先保留 redirect。
- 最后删除 redirect compatibility 和 Portal app 目录。

每次删除独立提交、独立回滚点，不把域名、数据库和整个 app 删除放在同一个不可恢复步骤。

## 11. 命名迁移操作指南

分层处理，不做超级 rename:

### Layer 1 - 用户可见文案

- Life OS → Kenos；Planner → Plan 等。
- i18n key 可先保持内部名称，避免无价值 mass diff。
- 视觉和产品文案通过截图/行为验证。

### Layer 2 - 路由与 deep links

- 新路由先加，旧路由 301/应用内 redirect。
- 测试登录回调、通知、PWA、custom scheme、Knowledge/Paper links。
- 观察旧路由调用后再删。

### Layer 3 - 稳定内部 ID

- 冻结 `assistant/work/plan/library/health/training/money/home/music/system`。
- 新 contract 使用稳定 ID；legacy adapter 做映射。
- ID 不跟随未来品牌文案变化。

### Layer 4 - package/schema/repo path

- 只有当名称持续造成真实维护问题时才改。
- 单独切片，使用机械 rename + imports/CI/Netlify/Supabase 校验。
- 不与用户文案、数据库迁移和产品 redesign 同批。

## 12. Apple 旧壳迁移操作指南

每个 capability 独立执行:

1. 记录旧 target 的 bundle ID、entitlements、Keychain group、URL schemes、通知、后台模式、数据目录和写 API。
2. 确认领域真源；设备 SQLite/UserDefaults 只作为缓存还是含唯一数据。
3. 导出/转换 fixture，验证 Codable 与 Web contract parity。
4. 新 Kenos target 先 read-only 读取正式 API。
5. 添加离线 Outbox，验证同一 mutation 不重复。
6. 在真机验证权限、后台、离线、恢复、升级安装。
7. 切换 system entry（Share/Widget/Watch/notification/deep link）。
8. 旧壳只读，观察旧写入。
9. 提供数据导出和恢复证明后才删除旧 target。
10. 撤销旧 bundle 权限、后台 job、token 和部署。

不能只验证 Simulator；HealthKit、WatchConnectivity、后台和通知必须有真机 gate。

## 13. Web AppShell/Settings 迁移

遵循现有 [`../architecture/life-os-app-shell-migration-guide.md`](../architecture/life-os-app-shell-migration-guide.md):

- 先做 scroll/safe-area/nav/overlay/focus concern map。
- 选择 `content`/`locked`/`document`，不为保留旧 CSS 选错模式。
- 同一提交删除双 scroll root 和重复 shell DOM。
- app 保留业务 nav、routes、domain overlays 和视觉 composition。
- 禁止深层覆盖 AppShell 内部 class。
- 建 app validation doc 和 PWA spec。

Settings 迁移规则:

- 相同行为和视觉 → shared pattern。
- 相同行为、品牌视觉不同 → theme。
- 相同行为、布局模式不同 → documented variant。
- 内容不同 → slot/composition。
- 数据接口不同 → adapter。
- 真正领域交互 → app-local。

Music 的 Now Playing、lyrics、mini player、visualization 保留；普通 toggle/segment/account/backup 不 fork。

## 14. 部署操作

### 14.1 Web

任何手动 Netlify deploy 必须带 `CI=1` 和 workspace filter:

```bash
CI=1 npx netlify deploy --prod --filter <workspace>
```

有效 workspace 见 `AGENTS.md` 和 `docs/ops/netlify.md`。部署前后记录 commit、site、URL、时间、smoke 和 rollback commit。不要在交互式 CLI 提示中猜选项目。

### 14.2 Database

- migration 文件先提交/审查，再通过 Management API 脚本 apply。
- apply 后查询远程对象和 migration registry，记录生产证据。
- 远程领先 git 是 P0 drift，立即恢复仓库真源。
- schema destructive step 与应用 cutover 分开。

### 14.3 Native

- Foundation 阶段先 internal/debug distribution。
- 每个 entitlement 和 privacy purpose string 有真实功能来源。
- 不在未完成 migration ledger 时切换 bundle/deep links。
- 版本兼容和最低 server contract 先于删除旧客户端支持。

## 15. 回滚决策树

### 可以立即回滚入口/UI

适用: 新入口 404、auth loop、导航阻塞、无数据写入变化。

操作: 恢复旧 route/default entry/deploy；保留新数据只读调查。

### 需要停止写入再回滚

适用: 新 writer 产生可识别错误数据或版本冲突。

操作:

1. 关闭新 writer。
2. 保留所有日志/Activity/Outbox，不清理。
3. 对账受影响 mutation。
4. 执行补偿或反向映射。
5. 只在旧 writer 能理解最新状态时恢复。

### 不可直接回滚 schema

适用: destructive DDL 已执行、旧格式无法表示新数据。

操作: 不盲目 down migration；从备份恢复到隔离环境，制定 forward repair 或受控 restore。任何生产 restore 为 R4，需影响预览和强确认。

## 16. 事故处理

当出现数据不一致、越权、重复副作用、静默丢失或错误退役:

1. **Contain:** 停相关 writer/automation/connector，不删除证据。
2. **Classify:** 安全域、数据分类、对象范围、时间窗、设备、版本。
3. **Protect:** 撤销 token/scope，保留备份和 audit。
4. **Reconcile:** 用 mutation/idempotency/correlation 定位影响。
5. **Recover:** retry、compensation、restore 或人工修正。
6. **Communicate:** System 显示发生了什么、数据是否安全、需要做什么。
7. **Prevent:** 加测试、guard、policy、监控和文档。
8. **Retire temporary mitigation:** 设删除日期，避免事故补丁永久化。

## 17. 每次 cutover 的证据包

```markdown
- Migration ledger link
- Approved scope and owner
- Preflight git HEAD/status
- Production fingerprint and backup time
- Migration files and checksums
- Dry-run/backfill counts
- Reconciliation queries and results
- RLS two-user/cross-domain results
- Idempotency/retry/conflict results
- Deploy URL/version/commit
- Desktop/mobile/native screenshots where relevant
- Real-use scenario and outcome
- Rollback test/result
- Old writer disabled evidence
- Observation window metrics
- Retirement and compatibility-removal evidence
```

## 18. 标准验证命令

按 scope 选择，最终 phase gate 见 QA 文档:

```bash
npm run check:lifeos-boundaries
npm run check:app-manifests
npm run validate:tokens
npm run check
npm run build
npm run verify:identity-p0
npm run verify:outbox
npm run test:design-catalog
npm run test:design-catalog:a11y
```

改变共享视觉时使用 canonical snapshot 流程；改变 AppShell 时运行对应 app PWA shell spec；改变生产 schema 时追加远程 SQL/RLS/rollback 证据。

## 19. 完成定义

迁移完成不是“新路径可用”，而是:

- 新 writer 唯一且稳定。
- 历史数据已对账。
- 旧 writer、UI、route、deploy、permission、job 已删除。
- 兼容层已删除。
- 故障与恢复已演练。
- 文档和生产事实一致。
- 真实使用减少了负担。
