# FITNESS.OS 项目文档

## 项目概述

FITNESS.OS 是一个面向个人训练管理的 Web 应用。基于 **SvelteKit + Svelte 5** 构建，默认以浏览器 `localStorage` 为主（local-first），登录后可与 **Life OS 统一 Supabase 项目** 双向同步。

当前产品定位：**训练中 Companion** —— 为 KEN 的胸、背、手、腿四日训练循环提供 Focus 模式单手训练、每组记录、自动加重建议、训练总结与周期减载提醒。

## 核心训练流

```text
打开 App → 今日推荐
→ 进入 Focus Mode（/day/[id]/focus）
→ 大按钮「完成第 N 组」→ 内联休息计时
→ 可选记录 reps / RIR
→ 训练 Summary → 完成并轮换
```

关键原则：健身房里单手可用、低思考、不打断训练节奏。

## 当前功能（v3.0）

### 训练体验（P0）

- **Focus Mode**（`/day/[id]/focus`）：Sticky 当前动作、52px 完成组 CTA、内联休息计时、撤销/跳过
- **概览模式**（`/day/[id]`）：动作列表 + 组数芯片（兼容旧习惯）
- **每组记录**：SetLogSheet 录 reps/RIR（设置：关 / 快速 / 必录）
- **自动加重建议**：连续 2 次达标 → 建议 +重量（Focus / Summary / Stats）
- **训练 Summary**（`/day/[id]/summary`）：组数、耗时、对比上次、加重建议、完成轮换

### 训练反馈（P1）

- **PR 检测**：破纪录 toast + Summary/Stats 绿色 PR 标
- **动作趋势**：Stats 页点击动作展开重量柱状图
- **跳过/替代**：器械占用 / 身体不适 / 其他 + 可选替代动作
- **后台通知**：Service Worker + 系统 Notification（设置页开启）
- **统计面板**（`/stats`）：周频次、月历、容量、完成率、趋势

### 周期与计划（P2）

- **减载提醒**：每 12 次主训练或 4 周未 deload → 首页/Summary 提示
- **标记减载**：一键记录 `rotation.lastDeload`
- **计划可配置**（`/program/edit`）：自定义组数/休息/reps、隐藏动作、导入导出 overrides
- **Coach Lite**：本地规则引擎（周期、频率、加重、体态）→ 首页 / Focus / Summary

### 基础能力

- 四日轮换推荐、重量微调、资料库、JSON 备份、PWA 离线、亮暗主题
- **云同步（Supabase）**：登录后与 Finance OS 共享账号；设置页手动上传/拉取；练完自动上传；回到前台双向 merge

## 快速开始

```bash
cd "/Users/kenpan/「Projects」/life-os/apps/fitness"
npm install
cp .env.example .env   # 可选，覆盖 Supabase URL / publishable key
npm run dev            # http://localhost:5173
npm run build
npm run check
npm run test:sync      # 同步逻辑静态校验
npm run test:supabase  # 远程 Supabase 连通性（需网络）
```

## 技术结构

```text
src/lib/
├─ state.svelte.js      全局状态 + localStorage + schema 迁移
├─ supabase.js          Life OS Supabase 客户端（fitness schema）
├─ auth.svelte.js       登录态 + 会话恢复触发同步
├─ sync.js              本地 ⇄ 云端双向同步
├─ logs.js              日志结构 normalize / getDoneCount
├─ session.js           训练 session API（completeSet / progress）
├─ progression.js       加重建议 + PR 检测
├─ phase.js             周期 / deload 提醒
├─ programRuntime.js    默认计划 + 用户 overrides 合并
├─ coach.js             本地 Coach Lite 规则引擎
├─ timer.svelte.js      休息计时（inline + float + SW 通知）
├─ stats.js / backup.js
└─ components/
   FocusSession / SetLogSheet / SummaryView / SkipModal / TimerWidget

src/routes/
├─ +page.svelte                    今日
├─ day/[id]/focus/+page.svelte    Focus 训练
├─ day/[id]/summary/+page.svelte 训练总结
├─ day/[id]/+page.svelte          概览
├─ stats/ settings/ program/ program/edit/ library/ auth/
```

- **local-first SPA**，localStorage key: `fitos_v2`（schema 由 `SCHEMA_VERSION` 驱动，当前为 **6**）
- 旧备份导入后自动 migrate
- 云表：`fitness_user_state` / `fitness_exercise_weights` / `fitness_workout_sessions` / `fitness_exercise_logs`（`fitness` schema，RLS 按 `auth.uid()`）

## 云同步（Supabase）

- 项目：**Life OS**（与 Finance OS 共用 `auth.users` 与 `life_os_auth` 存储键）
- 环境变量（可选，见 `.env.example`）：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
- 共享包：`packages/sync`、`packages/theme`（`@life-os/sync`、`@life-os/theme`，npm workspace）
- LifeOS shared-platform P1 pilot:
  - `DocumentHead.svelte` uses `@life-os/platform-web/applyDocumentMetaWeb` for one metadata adapter path.
  - contracts are consumed only through JSDoc type mirrors from `@life-os/contracts`.
  - `syncErrorPresentation.js` maps the existing sync error reason to `SyncErrorPresentation`.
  - `SyncErrorBanner`, settings UI, storage keys, and app state remain Fitness-owned.
- Monorepo 文档入口：[`../../docs/README.md`](../../docs/README.md)

## Life OS 集成

| 主线                    | 状态 | 说明                                                         |
| ----------------------- | ---- | ------------------------------------------------------------ |
| **INTG.IDENTITY.0** 身份           | ✅   | `@life-os/sync` + `fitness` schema RLS                       |
| **PLAT.CONTRACTS.1** contracts 试点 | ✅   | 同 Planner：`applyDocumentMetaWeb` + `SyncErrorPresentation` |
| **PLAT.CONTRACTS.1+**               | 🟡   | Music/Finance 模式未扩到 Fitness nav/feedback 契约           |

路线图：[`../../docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md)

```json
{
  "schemaVersion": 3,
  "data": {
    "settings": {
      "unit": "lbs",
      "logDetail": "quick",
      "notifyRest": true,
      "theme": "dark"
    },
    "logs": {
      "2026-06-28|chest": {
        "c_bench": {
          "done": 2,
          "sets": [{ "reps": 8, "rir": 2, "weight": 80, "ts": "..." }, null]
        }
      }
    },
    "rotation": { "next": 0, "history": [], "lastDeload": null },
    "sessionMeta": {
      "2026-06-28|chest": { "startedAt": "...", "endedAt": "..." }
    }
  }
}
```

## 后续方向（P2 剩余）

| 项                       | 状态                                                |
| ------------------------ | --------------------------------------------------- |
| 减载 / 周期提醒          | ✅ 基础版                                           |
| 训练计划可配置           | ✅ `/program/edit`（组数/休息/隐藏/导入导出）       |
| Coach Lite               | ✅ 首页 / Focus / Summary                           |
| 多设备云同步（Supabase） | ✅ 登录双向 merge + 设置页手动同步                  |
| 多模板 / 完整周期化 UI   | 待做                                                |
| 动作参考图 / 视频        | 待做（`static/assets/images/exercises/{exId}.jpg`） |

## 部署

构建产物在 `build/`。Netlify 已配置 `netlify.toml`（build 命令 + publish 目录 + SPA 重定向）。

也可部署到 GitHub Pages / Cloudflare Pages 等；纯 SPA 需将未知路径回退到 `index.html`。PWA 支持添加到主屏幕离线使用。

## 维护原则

- 训练流程优先：Focus 模式下不超过 1 次额外点击
- 数据安全：结构变更走 migrate + JSON 备份
- 移动端优先，local-first；联网时自动与云端收敛
