---
title: Life OS 体系架构总览
owner: kenpan
last_verified: 2026-07-20-kenos-implementation-audit
doc_role: architecture-snapshot
---

# Life OS 体系架构总览

> 本文档由对话生成，作为体系规划图的文字版补充。长期真源仍是 [`docs/architecture/README.md`](./README.md)、[`docs/LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) 与各 `packages/*/README.md`；本文若与它们冲突，以那些为准。愿景见 [`NORTH_STAR.md`](./NORTH_STAR.md)。

## 一句话

Life OS 正在渐进收敛为 Kenos：现有生产站和领域 Owner 继续承载真实数据，AIOS 承担 Assistant/Today/Spaces 控制面，统一 Contracts/Action/Activity/Approval/Outbox 形成系统主干，Apple iOS/macOS/watchOS 客户端提供新的原生日常入口。该迁移仍处于受控生产 canary；Portal 与 legacy writer 尚未退役，不能把“新入口存在”写成“旧系统已删除”。PaperOS 设备 Shell 已迁出独立仓库，本仓库只保留 Planner 侧 `/api/paper/*` provider。

## 0. Kenos 迁移快照（2026-07-20）

| 层 | 当前事实 | 尚未完成 |
| --- | --- | --- |
| 数据/动作 | 生产 migration 到 `20260720230000`；Plan、Approval、Outbox、Focus、Work、Capture、Assistant proposal 已有 Kenos schema/RPC | 全量 writer cutover、legacy revoke、outbox delivery worker、ProductionExecutor |
| Web | AIOS 已有 Today/Assistant/Spaces/Inbox/Approvals/Activity/Focus/Work；Portal `/today` 有 Owner-limited redirect | Portal 默认入口全量切换与 app/build/registry/compat retirement |
| Domain Spaces | Plan 写 canary；Work/Training/Money/Music/Home 有不同程度 foundation | 每域唯一 writer、完整错误/离线/恢复与旧 surface retirement |
| Apple | Kenos iOS/macOS/watchOS 工程、共享包、Simulator/Mac build、iPhone install/open 有证据 | App Group/APNs/entitlement、分发、完整真机矩阵、旧 shells retirement |
| Context | Focus/interruption/建议合同与本地跨端行为通过 guard | 生产通知、跨端 Focus state、Executor/Approval 主动闭环 |
| UIUX | 六轮本地优化 `91/100`，preview/simulator ready | 该轮没有生产部署 |

完整证据与下一步见 [`kenos-implementation-status.md`](./kenos-implementation-status.md)。

## 1. App 清单（`apps/`）

| App | 定位 | 状态/亮点 |
|---|---|---|
| **portal** | 统一启动器与导航，聚合各站今日摘要 | `portal_today_summary` RPC 与 Planner Today 计数口径已对齐 |
| **aios** | 本地优先 AI 助手，Mac 原生壳（Tauri v2） | 自有 Dock 图标、本地 TTS（Qwen3 九音色）、本地生图（mflux）、Obsidian 双库日报、已接入 Life OS 统一 Supabase 云同步 |
| **planner** | 任务/日程/项目管理 | 趋势 BarChart + 项目鸟瞰 MindMap；日程视图可用性闭环基本收尾，剩真机 iPhone Home Screen 独立验收 |
| **fitness** | 训练计划与记录 | 动作示范生成管线（Qwen-Edit 姿势迁移 + 公有领域参考图）；替换动作 UI 已发货 |
| **finance** | 记账/消费决策 | 浏览器扩展抓单（Robinhood/RocketMoney）+ 购买标注闭环 + 支出审核决策引擎（乐观版本+幂等+Undo） |
| **music** | 播放与同步 | Capacitor iOS 壳接入 |
| **home** | 户型/家具实验站 | 可编辑项目仍本地真源；扫描/照片/事件 + 认亲生产闭环；安静扫描/matcher/证据 UI//plan 横幅/Mac auto-refine 已验 |
| **knowledge** | 长期记忆层，Mac 原生壳（Tauri v2），取代 Obsidian | Vault `.md` 即数据库；块编辑器（含 GFM 表格/高亮）；语义 RAG、项目感知、Planner 双向检索；Vault 正文未上云 |
| **health** | Status（Health + Focus），Mac 原生壳 + companion | HLT-0–4：Focus agent、六维纯信号状态引擎、自适应专注、健康趋势；iOS/watchOS companion 源码已交付并验证模拟器工程，真机签名/持续交付仍是 gate |
| **design-catalog** | 设计系统展示台 | 组件/主题/图标/状态矩阵展示 |
| **starter** | 新 app 脚手架 | 一键复制启动新站 |

## 2. 共享包（`packages/`）

| 包 | 职责 | 备注 |
|---|---|---|
| `theme` | 设计令牌、主题变量 | 各 app `<style>` 中禁用 `@custom-media`（组件级不展开，需字面量断点） |
| `sync` | 统一登录态、跨 app 同步 | AIOS 云同步复用同一套（`@life-os/sync` 共享登录） |
| `contracts` | 跨 app 白名单契约、`life_events` envelope | 架构不变量之一：受控互通 |
| `platform-web` | 通用 UI/图表组件族 | `svelte/charts`：各品牌由 accent 经 OKLCH 演算 categorical 色板；树状图按块亮度自动选墨色，图表行为统一走共享组件 |
| `design-tokens` | 跨端令牌导出 | 供原生端（iOS）消费 |
| `finance-core` | 财务领域逻辑 | Finance 站复用 |
| `finance-enrichment-contract` | 消费数据富化契约 | Finance 扩展 ↔ 主站数据契约 |
| `mcp-server` | MCP 服务端 | — |
| `capacitor-nowplaying` | iOS 播放状态插件 | Music iOS 壳 |

## 3. 架构不变量（Present）

来自 [`docs/architecture/README.md`](./README.md) 与 roadmap：

1. **严格边界**：app 间不直接耦合，只通过共享包/契约交互。
2. **统一身份**：`@life-os/sync` 提供跨 app 共享登录态；HealthOS 原始健康数据当前刻意不入云。
3. **事件驱动**：`life_events` envelope（如 `finance.bill_due`）承载跨 app 通知。
4. **受控互通**：`@life-os/contracts` 维护导出白名单，防止跨包私有实现泄漏。

## 4. 基础设施

- **Supabase**：多 app 共用同一项目，各 app 独立 `migrations` 目录（历史上曾因跨 app 迁移互相卡住 `db push`；`repair --reverted` 会删真实历史，已禁用，改走安全推送步骤，见记忆 `supabase-shared-project-migration-divergence`）。
- **Netlify**：六个 canonical web surface 走 Git CD；KnowledgeOS 有实验 site（custom DNS 状态以 `ops/netlify.md` 为准），AIOS 有只读 viewer；HealthOS 尚未供给 Netlify。
- **GitHub Actions**：PR 触发 `ci.yml`。
- **环境变量**：各 Site 用 `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`；Planner AI 用 `KIMI_API_KEY`（仅 Functions 侧，不可暴露到客户端）。

## 5. 已知历史分叉/坑（与架构相关，不含具体 bug 修复记录）

- **PaperOS** 设备 Shell 已迁出独立仓库（`/Users/kenpan/「Projects」/paperos`），本仓库仅保留 Planner 侧 `/api/paper/*` provider API 状态追踪。
- **local-ai gateway**：llama-swap 托管 `web-state-bridge` 按需拉起，网关是 nohup 进程，CORS 由上游服务自行处理（不属于 monorepo Netlify 部署范畴，独立于本图）。
- **Home 数据双层**：云端已确认扫描事实、照片、追加事件与 object recognition；当前可编辑 spatial 项目仍是本地真源。不要写成“完全无云”，也不要反向宣称“全量项目云同步完成”。
- **Health 隐私边界**：HealthKit 只在 iOS/watchOS；Mac 通过 companion 或 XML 导入接收，原始健康数据留在本机。
- **共享 worktree 并发风险**：多会话共享同一工作树时，并发 `git stash/reset`、`git add -A` 可能互相冲刷改动，需要外科式提交手法（见记忆 `shared-worktree-concurrent-sessions`）。
- **复利取舍**：底座（SSO / events / contracts / AppManifest / CI）已过临界点；优先跨 OS 消费与日用真源，而非新 app — [`../roadmap/COMPOUND.md`](../roadmap/COMPOUND.md)。

## 6. 延伸阅读

- **北极星愿景（终极形态 + 和现在的距离）：** [`architecture/NORTH_STAR.md`](./NORTH_STAR.md)
- **复利判据：** [`../roadmap/COMPOUND.md`](../roadmap/COMPOUND.md)
- 状态与优先级：[`docs/LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)
- 契约白名单细节：[`docs/architecture/contracts.md`](./contracts.md)
- 响应式壳层契约（六端）：[`docs/architecture/responsive-chrome.md`](./responsive-chrome.md)
- 事件总线 RFC：[`docs/architecture/events-rfc.md`](./events-rfc.md)
- 部署：[`docs/ops/netlify.md`](../ops/netlify.md)
- 仓库准绳：[`docs/ops/canonical.md`](../ops/canonical.md)
