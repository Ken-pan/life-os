---
title: Kenos Codex Cloud 无人值守任务配置
owner: kenpan
last_verified: 2026-07-18
doc_role: cloud-environment-runbook
status: cloud-environment-ready-task-not-started
---

# Kenos Codex Cloud 无人值守任务配置

## 1. 本次实际范围

Cloud 任务只准备 **Kenos Phase 0**：仓库盘点、数据 Owner、安全域/分类、动作风险、首个迁移 slice、守卫和最终审计。它不实施 Phase 1–5，不迁生产数据，不退役 Portal，不部署，也不替 owner 批准 OPEN-001–008。

这样设置是因为当前权威 Hub 明确为 `target-approved-activation-pending`，Phase 0 仍有 owner 决策与迁移台账出口条件。附件中“直接执行 Phase 1、创建 feature branch 和 draft PR”的建议已按根 `AGENTS.md` 改为 `master` 来源 + Cloud diff。

## 2. Cloud 环境值

当前环境 `life-os — Kenos Phase 0` 已于 2026-07-18 创建并核验；以下表格同时作为其可复核配置基线。

在 [Codex Cloud Environments](https://chatgpt.com/codex/settings/environments) 创建环境：

| 设置 | 值 |
| --- | --- |
| GitHub repository | `Ken-pan/life-os`（只授权这一个仓库） |
| Environment name | `life-os — Kenos Phase 0` |
| Description | `Offline, no-secrets environment for evidence-led Kenos Phase 0 preparation.` |
| Base image | `universal` |
| Runtime | Node.js 22；npm 10（仓库要求 Node >=20，packageManager 为 npm） |
| Workspace | `/workspace/life-os` |
| Container cache | on |
| Setup mode | manual |
| Setup script | `bash .codex/cloud/setup.sh` |
| Maintenance script | `bash .codex/cloud/maintenance.sh` |
| Environment variables | none |
| Secrets | none |
| Agent internet access | off |

Setup 阶段可以联网执行锁文件依赖安装；agent 阶段保持断网。不要为 Supabase、Netlify、GitHub CLI、Figma、Keychain 或生产 API 添加 secret。

## 3. 为什么不用 branch / PR

本仓库的当前硬规则是 `master` 唯一分支，禁止 branch、worktree、stash 和 checkpoint ref。因此 Cloud 环境从已推送的 `origin/master` 启动，只生成可审查 diff，不自动 commit/push/PR。回来后按以下流程处理：

1. 阅读 Cloud summary 和 `KENOS_REFACTOR_EXECUTION_STATE.md`。
2. 检查 Cloud diff 是否只包含 prompt allowlist。
3. 在本地处理与现有 WIP 的冲突；不得整包覆盖。
4. 运行 `npm run verify:kenos-refactor`。
5. 只 stage 已审核的 Kenos 文件，commit 到 `master`，再 push。

## 4. 启动前检查

Cloud 只能看到远程已提交内容，看不到本地未提交 WIP。启动前确认：

```bash
git branch --show-current
git status --short --branch
git rev-list --left-right --count master...origin/master
git log -1 --oneline origin/master
```

必须满足：来源为 `master`；Cloud 执行包已经推送；没有第二个 write-capable Cloud task；本地正在修改的非 Kenos 文件不在 Cloud allowlist。

## 5. 创建任务

1. 打开 Codex Cloud，新建 task。
2. Environment 选择 `life-os — Kenos Phase 0`。
3. Starting branch 选择现有 `master`。
4. Model 使用账户当前的 Sol；选择高推理档即可，不在 prompt 中硬编码私有/可能变化的 model slug。
5. 粘贴 [`kenos-codex-cloud-prompt.md`](./kenos-codex-cloud-prompt.md) 全文。
6. 只启动一个任务；不启用 multi-agent、automation、自动 PR 或自动部署。

## 6. 允许写入的路径

Cloud task 只可修改：

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

`apps/**`、`packages/**`、Supabase migrations、Netlify、DNS、production scripts，以及当前 Roadmap/各 app 分卷全部只读。

## 7. 观察和停止

正常情况下无需盯电脑。回来时只检查：

- state 文件是否每个 slice 更新；
- baseline 与最终验证是否区分原有失败和本次回归；
- UNKNOWN 是否被诚实保留；
- owner 决策是否只是 recommendation，而非伪造 approval；
- 是否触碰 allowlist 外路径；
- 是否出现生产权限、不可逆迁移、数据丢失或文档冲突 blocker。

任何越界 diff 不应用。若任务需要生产凭证、写数据库、redirect Portal、修改 auth/RLS、删除旧 app 或跨仓库操作，必须停止并另开经 owner 明确授权的人工执行 slice。

## 8. 官方行为依据

Codex Cloud 会在选定 branch/commit 的隔离容器中运行 setup，然后让 agent 修改和验证并返回 summary + diff；`AGENTS.md` 会被用于项目命令。Setup 可联网，agent 网络默认关闭；secret 只在 setup 可见。当前配置入口见 [Codex Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environment)。
