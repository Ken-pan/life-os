# Life OS 提取审计(2026-07-12)

对六个生产 app 的 `src/lib` 做同名文件 + 内容相似度扫描,找出仍在逐 app
重复实现、值得上提到共享包的功能。规则沿用 C-P2:**3+ app 逐字节级重复才提取**。

## 已经共享、无需再动(审计确认)

| 模块 | 现状 |
| --- | --- |
| Supabase client | `createLifeOsSupabaseClient`(@life-os/sync),app 侧 8 行薄封装 |
| Toast(UI + store)| `SharedToast` + `createToastStore`(platform-web),app 侧 re-export |
| Service worker 注册 | `sw-lifecycle`(platform-web),app 侧 7–13 行策略封装 |
| Settings 原语 | `SettingsSection/Row/Segment/Toggle/Backup…`(platform-web/svelte/settings)|
| 导航模型 | contracts `NavItemModel` mirror;IA 内容正确地留在 app(`nav.js`)|
| AppShell / 品牌 / 头部 / PortraitGate / CommandPalette / localCache / backup | C-P2 各 wave + PLAT.SHELL 已覆盖 |

## 本次提取:auth store 工厂 ✅

**证据:** `auth.svelte.js` ×6 app(43–75 行),fitness↔music 仅差 1 个
`appId` 字符串;其余变体差异全部是参数化维度(登出清理回调、会话同步回调、
错误文案来源、Finance 的空会话后置钩子)。约 300 行重复 → 每 app 20–35 行配置。

**产物:** `@life-os/sync/svelte/auth-store` → `createAppAuthStore(supabase, {
appId, errorLabels, onSignedOut?, onSyncSession?, onSessionChange? })`,
带 `.d.ts`(`types` 条件导出,避免 app 严格检查穿透到 sync 内部源码)。
六个 app 均改为薄封装;`registerAuthHandlers`(Finance)等 app 特有接口保留。

**放在 sync 而非 platform-web:** 边界守卫限定 platform-web 只许依赖
contracts/theme;auth store 与 `createLifeOsAuth` 同域,归 sync。

**验证:** 7 workspace `check` 0 错误 · 9 task `build` 全过 ·
`check:lifeos-boundaries` OK · music dev 实测(auth UI 渲染、无 console 错误)·
`music-app-shell.spec.ts` 6/6(fresh build)。

## 剩余候选 backlog(按 ROI 排序)

| # | 候选 | 证据 | 方案 | 价值/风险 |
| - | --- | --- | --- | --- |
| 1 | **static/sw.js 统一生成** | 6 份手写 service worker(60–384 行)实现同一套 precache + 导航回退,各自漂移 | 共享 SW 模板 + 每 app 清单注入(构建脚本或 vite 插件);先从 portal/home/finance 三份 60–70 行的小实现合并起 | 高/中——SW 出错影响离线与更新,需逐 app PWA 验收 |
| 2 | **AppBar 骨架组件** | 5 app 手写 `AppBar.svelte`,`appbar-inner/leading/titles/trailing` + AppBrand + ReportBugButton 结构相同,插槽内容不同 | platform-web `LifeOsAppBar`(snippet 化 leading/trailing);与 AppShell `header` 配套 | 中/低——纯结构组件,逐 app 迁移即可 |
| 3 | **persisted-settings 工厂** | `state.svelte.js` ×5 的 `STORAGE_KEY + DEFAULTS 合并 + try/catch load/save` 头部逐字相同(领域状态之外的部分) | platform-web `createPersistedState({ key, defaults, migrate? })`;starter 已按此形状写好可反向对齐 | 中/低 |
| 4 | **auth 错误文案 i18n 包** | zh 文案在 home/portal 静态重复,fitness/music/planner 的 `auth.err*` key 集合相同 | 共享默认 labels(zh/en)进 `auth-store`,`errorLabels` 变为可选覆盖 | 低/低——顺手 |
| 5 | **Toast dismiss 一致性** | fitness 的 `Toast.svelte` 未接 `onDismiss/dismissLabel`(music 已接) | 对齐 music 写法 | 低/低——一致性修补 |

**不建议提取:** `nav.js` IA 内容、settings 页面编排、`ui.svelte.js` 领域
弹层状态(285 行 diff,纯 app 域)——它们的"形状"已由 contracts/设计系统约束,
内容本就该 app-owned。

**Starter 模板联动:** auth 工厂落地后,`apps/starter` 晋升清单的"接登录"
一步从「参考 fitness 抄 43 行」变为「调一次 `createAppAuthStore`」。
