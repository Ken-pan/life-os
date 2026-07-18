---
title: Kenos Phase 0 Codex Cloud 总 Prompt
owner: kenpan
last_verified: 2026-07-18
doc_role: cloud-task-prompt
status: ready-cloud-access-pending
---

# Kenos Phase 0 Codex Cloud 总 Prompt

你正在执行 `Kenos Refactor Phase 0 Preparation`。这是一个无人值守、可验证、可暂停、不可越权的单任务。持续推进到完成所有安全可执行工作或触发停止条件；普通实现选择不等待用户确认。

## 权威来源

按顺序完整读取并遵守：

1. `AGENTS.md`
2. `docs/architecture/KENOS_REFACTOR.md`
3. `docs/architecture/kenos-constitution.md`
4. `docs/architecture/kenos-decision-register.md`
5. `docs/architecture/kenos-target-architecture.md`
6. `docs/architecture/kenos-platform-contracts-rfc.md`
7. `docs/roadmap/KENOS_REFACTOR_PLAN.md`
8. `docs/roadmap/KENOS_MIGRATION_LEDGER.md`
9. `docs/ops/kenos-migration-runbook.md`
10. `docs/qa/kenos-refactor-gates.md`
11. `docs/roadmap/KENOS_REFACTOR_EXECUTION_STATE.md`

若文档冲突，`AGENTS.md` 最高；当前生产事实/排期高于目标架构。记录冲突并停止受影响 slice，不选择更方便的解释。

## 成功定义

本任务不是实施整个 Kenos，也不是 Phase 1 产品重构。成功是交付一个 owner 可审查、可签署的 Phase 0 freeze package：

- 核心对象当前 source of truth、Owner、writer、reader、offline/sync、backup 有路径证据；
- security domain、classification、模型/存储/搜索/保留的保守默认和缺口明确；
- 现有写能力有 R0–R4 风险和 approval/activity/undo 建议；
- OPEN-001–008 有 evidence-backed recommendation 和影响，但仍标为 owner pending；
- 第一条可回滚垂直迁移 slice 在 Ledger 中完整定义；
- 确定性 guard/test/verify 能验证已定义的 Phase 0 不变量；
- state 文件记录 baseline、每个 slice、blocker 和最终报告；
- 没有生产写入、部署、branch/PR、跨范围代码迁移或虚假“已实现”。

## 写入 allowlist

只可写：

```text
docs/architecture/KENOS_REFACTOR.md
docs/architecture/kenos-*.md
docs/roadmap/KENOS_REFACTOR_*.md
docs/roadmap/KENOS_MIGRATION_LEDGER.md
docs/ops/kenos-*.md
docs/qa/kenos-*.md
scripts/verify-kenos-refactor.sh
scripts/check-kenos-*.mjs
tests/kenos/**
```

仓库其他内容全部只读。特别禁止修改 `apps/**`、`packages/**`、Supabase migrations、Netlify 配置、DNS、production scripts、`docs/LIFEOS_ROADMAP.md` 和非 Kenos app roadmap。若完成工作必须越界，记录 follow-up/blocker，不实施。

## Preflight

1. 确认 checkout 来源为现有 `master`，记录 `git rev-parse HEAD`。
2. 确认没有 merge/rebase 状态；不得创建 branch/worktree/stash/ref。
3. 读取全部权威文档。
4. 运行并记录：

   ```bash
   git status --short --branch
   npm run verify:ticket-naming
   npm run check:lifeos-boundaries
   npm run check:app-manifests
   ```

5. 将原有失败与本次回归分开；不得伪装 baseline 为 green。
6. 更新 `KENOS_REFACTOR_EXECUTION_STATE.md` 的起始 revision、结果和 S0 状态。

## Slice 顺序

严格按 state 文件 S0→S6 执行。每个 slice：

1. 重读目标、allowlist 和验收条件。
2. 只读查明所有直接/间接依赖；结论引用精确路径、symbol、migration 或 test。
3. 采用最小完整、易回滚的修改；目标文档不能冒充当前事实。
4. 添加或更新非破坏性 guard/test；不得为绿色结果弱化测试。
5. 运行针对性验证和适用的共享 guard。
6. 自审 diff，找遗漏、重复真源、无证据结论、临时 hack、越界和目标/当前状态混淆。
7. 更新 execution state 的完成项、findings、decisions、blockers 和最后通过验证。
8. 继续下一 slice；不 commit、不 push、不创建 PR，不等待普通确认。

S1 只基于 repo 事实填写 ownership inventory。`UNKNOWN` 比猜测正确。

S2/S3 可以为 owner 决策准备推荐和证据，但只有 Ken 能把 `PENDING` 改成批准。不得把 TARGET_APPROVED 写成 IMPLEMENTED。

S4 只定义首条 migration slice；不 apply SQL、不改 RLS/auth、不写远程数据库、不启动双写。推荐优先选择 create-task Action/Outbox 的最小可回滚 slice，但必须先用当前仓库事实证明边界合理。

S5 只实现文档/架构一致性 guard、fixtures 和非生产测试。不得修改 app/package runtime 来“提前实现”目标架构。

## 最终验证

完成安全可执行 slices 后：

1. 运行 `npm run verify:kenos-refactor`。
2. 搜索重复 Owner、无证据 IMPLEMENTED、旧 Portal 已退役表述、未登记兼容层和 allowlist 外 diff。
3. 做一次 adversarial architecture review：尝试证明 freeze package 仍会造成双 Owner、越权、丢数据、不可回滚或虚假完成。
4. 修复 allowlist 内可安全修复的问题，再运行针对性检查。
5. 将 execution state 更新为完整交付报告。

## 禁止事项

- 不得创建 branch、worktree、stash、checkpoint ref 或 PR。
- 不得 commit、push、merge 或修改远程 Git 状态。
- 不得部署、改 DNS/域名、写生产数据库或调用有副作用的远程 API。
- 不得读取、要求、输出、轮换或提交凭证；agent 网络保持关闭。
- 不得 apply migration、修改 RLS/auth、删除表/列/用户数据或真实 app。
- 不得启动 subagent、多代理或第二个写任务。
- 不得修改 allowlist 外文件。
- 不得把 owner recommendation 伪装成 approval。
- 不得用 `any`、lint disable、空 catch、跳过断言、删除测试或伪造 mock 掩盖错误。
- 不得因为代码看似无用就删除；本任务不做 runtime dead-code cleanup。

## 停止条件

仅在以下情况停止相关 slice 或任务：

1. 所有安全可执行工作和最终报告完成；
2. 权威文档存在无法调和的冲突；
3. 下一步需要 owner 批准、生产权限、凭证、外网、allowlist 外修改或破坏性数据操作；
4. 继续可能造成数据丢失、不可逆损坏或长期双写；
5. 核心验证经过三种有实质差异的合理修复仍无法运行；
6. 同一核心 blocker 经过三轮有实质差异的尝试仍未解决。

停止时保持最后已知安全状态，不做 destructive rollback；更新 execution state，列出 blocker、证据、尝试和推荐下一步，然后返回 Cloud summary + diff 等待 Ken 审查。

现在从 preflight 开始，持续推进到完成或触发明确停止条件。
