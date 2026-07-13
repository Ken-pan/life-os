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

## 第二批落地(PLAT.CORE.4,2026-07-12)✅

| # | 候选 | 结果 |
| - | --- | --- |
| 1 | **static/sw.js 统一生成(简单三站)** | ✅ `@life-os/platform-web/pwa/basic-sw`:`renderBasicSw` 模板 + `lifeOsBasicSwPlugin` vite 插件。portal / home / finance 删除手写 `static/sw.js`,vite 配置声明 `cachePrefix + precache + navigationFallback`。**顺带修复 home 无 build-id 版本化的陈旧缓存隐患**。fitness / planner / music 的领域缓存 SW(215–384 行)不在模板范围,后续单独评估 |
| 4 | **auth 缺省错误文案** | ✅ `DEFAULT_AUTH_ERROR_LABELS`(zh)进 auth-store,`errorLabels` 变可选覆盖;home / portal 薄封装缩至 7 行 |
| 3 | **persisted-settings 工厂** | ✅ `@life-os/platform-web/persisted-state` `createSettingsPersistence({ key, defaults, merge?, serialize? })`;starter 已采用。fitness/music/home 的 `state.svelte.js` 头部可逐步反向对齐(非阻塞) |
| 5 | **Toast dismiss 一致性** | ✅ fitness `Toast.svelte` 对齐 music(`onDismiss` + `dismissLabel`)|

验证:7×check 0 错误 · 9×build 全过 · boundaries OK · starter 3/3 ·
home 7/7 · fitness 7/7 spec;三站构建产物 `build/sw.js` 均由模板生成、
cache 名带 build id。

## 剩余候选(未做)

| 候选 | 证据 | 备注 |
| --- | --- | --- |
| **AppBar 骨架组件** | 5 app 手写 `AppBar.svelte`,`appbar-inner/leading/titles/trailing` + AppBrand + ReportBugButton 结构相同 | platform-web `LifeOsAppBar`(snippet 化);逐 app 迁移,适合单独 session |
| **复杂 SW 收编** | fitness(215)/ planner(230)/ music(384)各有领域缓存策略 | 评估能否「basic 模板 + 策略插槽」;需逐 app 离线 QA |
| **app 侧 persisted-state 反向对齐** | fitness/music/home 的 load/save 头部 | 顺手活,随下次触碰各 state 文件时做 |
| **全局错误捕获**(业界标配缺口)| 各 app 无 `unhandledrejection`/`window.onerror` 统一处理(仅 music player 内部有)| 可选:platform-web `bindGlobalErrorReporting`(console + toast);对单用户 QA 有用,无痛点证据前不强推 |
| 不做:analytics / feature flags | 业界多 app 平台标配,但单用户场景过度设计 | — |

**不建议提取:** `nav.js` IA 内容、settings 页面编排、`ui.svelte.js` 领域
弹层状态(285 行 diff,纯 app 域)——它们的"形状"已由 contracts/设计系统约束,
内容本就该 app-owned。

**Starter 模板联动:** auth 工厂落地后,`apps/starter` 晋升清单的"接登录"
一步从「参考 fitness 抄 43 行」变为「调一次 `createAppAuthStore`」。
