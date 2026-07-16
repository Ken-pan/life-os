---
title: Life OS 体系架构总览
owner: kenpan
last_verified: 2026-07-16
doc_role: architecture-snapshot
---

# Life OS 体系架构总览

> 本文档由对话生成，作为体系规划图的文字版补充。长期真源仍是 [`docs/architecture/README.md`](./README.md)、[`docs/LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) 与各 `packages/*/README.md`；本文若与它们冲突，以那些为准。

## 一句话

Life OS 是个人生活平台：**Planner / Fitness / Finance / Music** 四生产站 + **Portal** 启动器 + **Home** 实验站，共享 `@life-os/theme`、`@life-os/sync`、`@life-os/contracts`；另有 **AIOS**（本地优先 AI，Mac 原生 Tauri 壳）与 `design-catalog` / `starter` 脚手架。六个 web 站部署在 Netlify，AIOS 是原生 app（云端仅只读查看器）。PaperOS（设备 Shell）已于 2026-07-12 迁出为独立仓库，本仓库只保留 Planner 侧 `/api/paper/*` provider。

## 1. App 清单（`apps/`）

| App | 定位 | 状态/亮点 |
|---|---|---|
| **portal** | 统一启动器与导航，聚合各站今日摘要 | `portal_today_summary` RPC 与 Planner Today 计数口径已对齐 |
| **aios** | 本地优先 AI 助手，Mac 原生壳（Tauri v2） | 自有 Dock 图标、本地 TTS（Qwen3 九音色）、本地生图（mflux）、Obsidian 双库日报、已接入 Life OS 统一 Supabase 云同步 |
| **planner** | 任务/日程/项目管理 | 趋势 BarChart + 项目鸟瞰 MindMap；日程视图可用性闭环基本收尾，剩真机 iPhone Home Screen 独立验收 |
| **fitness** | 训练计划与记录 | 动作示范生成管线（Qwen-Edit 姿势迁移 + 公有领域参考图）；替换动作 UI 已发货 |
| **finance** | 记账/消费决策 | 浏览器扩展抓单（Robinhood/RocketMoney）+ 购买标注闭环 + 支出审核决策引擎（乐观版本+幂等+Undo） |
| **music** | 播放与同步 | Capacitor iOS 壳接入 |
| **home** | 户型/家具实验站 | RoomPlan 扫描→home schema、家具/储物实体化、贴图地板+阳光模拟、权威副本版本工作流 |
| **knowledge** | 知识管理 | 独立站 |
| **design-catalog** | 设计系统展示台 | 组件/主题/图标/状态矩阵展示 |
| **starter** | 新 app 脚手架 | 一键复制启动新站 |

## 2. 共享包（`packages/`）

| 包 | 职责 | 备注 |
|---|---|---|
| `theme` | 设计令牌、主题变量 | 各 app `<style>` 中禁用 `@custom-media`（组件级不展开，需字面量断点） |
| `sync` | 统一登录态、跨 app 同步 | AIOS 云同步复用同一套（`@life-os/sync` 共享登录） |
| `contracts` | 跨 app 白名单契约、`life_events` envelope | 架构不变量之一：受控互通 |
| `platform-web` | 通用 UI/图表组件族 | `svelte/charts`：单系列走 accent 色、多系列走 `--chart-series-1..8` 固定槽位（已做 CVD 色觉验证，禁止循环取色） |
| `design-tokens` | 跨端令牌导出 | 供原生端（iOS）消费 |
| `finance-core` | 财务领域逻辑 | Finance 站复用 |
| `finance-enrichment-contract` | 消费数据富化契约 | Finance 扩展 ↔ 主站数据契约 |
| `mcp-server` | MCP 服务端 | — |
| `capacitor-nowplaying` | iOS 播放状态插件 | Music iOS 壳 |

## 3. 架构不变量（Present）

来自 [`docs/architecture/README.md`](./README.md) 与 roadmap：

1. **严格边界**：app 间不直接耦合，只通过共享包/契约交互。
2. **统一身份**：`@life-os/sync` 提供跨 app 共享登录态（含 AIOS）。
3. **事件驱动**：`life_events` envelope（如 `finance.bill_due`）承载跨 app 通知。
4. **受控互通**：`@life-os/contracts` 维护导出白名单，防止跨包私有实现泄漏。

## 4. 基础设施

- **Supabase**：多 app 共用同一项目，各 app 独立 `migrations` 目录（历史上曾因跨 app 迁移互相卡住 `db push`；`repair --reverted` 会删真实历史，已禁用，改走安全推送步骤，见记忆 `supabase-shared-project-migration-divergence`）。
- **Netlify**：Git CD，push `master` 后自动构建（四生产站 + portal + home 等）；`deploy-all-netlify.sh` 会打包脏工作树，共享 git 树上慎用。
- **GitHub Actions**：PR 触发 `ci.yml`。
- **环境变量**：各 Site 用 `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`；Planner AI 用 `KIMI_API_KEY`（仅 Functions 侧，不可暴露到客户端）。

## 5. 已知历史分叉/坑（与架构相关，不含具体 bug 修复记录）

- **PaperOS** 设备 Shell 已迁出独立仓库（`/Users/kenpan/「Projects」/paperos`），本仓库仅保留 Planner 侧 `/api/paper/*` provider API 状态追踪。
- **local-ai gateway**：llama-swap 托管 `web-state-bridge` 按需拉起，网关是 nohup 进程，CORS 由上游服务自行处理（不属于 monorepo Netlify 部署范畴，独立于本图）。
- **共享 worktree 并发风险**：多会话共享同一工作树时，并发 `git stash/reset`、`git add -A` 可能互相冲刷改动，需要外科式提交手法（见记忆 `shared-worktree-concurrent-sessions`）。

## 6. 延伸阅读

- 状态与优先级：[`docs/LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)
- 契约白名单细节：[`docs/architecture/contracts.md`](./contracts.md)
- 响应式壳层契约（六端）：[`docs/architecture/responsive-chrome.md`](./responsive-chrome.md)
- 事件总线 RFC：[`docs/architecture/events-rfc.md`](./events-rfc.md)
- 部署：[`docs/ops/netlify.md`](../ops/netlify.md)
- 仓库准绳：[`docs/ops/canonical.md`](../ops/canonical.md)
