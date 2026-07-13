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

## App 体检:清除各 app 自维护的无必要代码(PLAT.CORE.5,2026-07-12)✅

逐 app 扫描「与共享包重复 / 零调用 / 来源已消失」的自维护代码:

| 类别 | 清除项 |
| --- | --- |
| 孤儿组件 | music `AudioVisualizer.svelte`(全仓零引用)|
| 零调用 @deprecated 别名 | fitness `syncThemeColor` · `autoSyncOnLogin` · `requestNotificationPermission`(调用方改用 `requestNotifyPermission`)· `dayDisplaySub`;music `buildNavItems` · `getHiddenEntityKeys` · `registerAudioElement` |
| 死 CSS | theme `shell.css` / `music-shell.css` 的 `.bottom-shell .mini-player` 与 `[data-player-chrome]` 规则(PLAT.SHELL.4 后 mini-player 不再位于 bottom-shell)|
| 失源脚本 | `scripts/sync-vendored-packages.sh` + `npm run sync:packages`(源 sibling 仓库 `life-os-theme`/`life-os-sync` 已不存在)|

**体检确认为健康、保留的:** 各 app `state.svelte.js` 的持久化头部含真实
schema 迁移 / undo 栈 / normalize 逻辑(fitness `migrate()`、home 三 key、
music `normalizeSettings`)——是必要领域代码,不强改 persisted-state 工厂;
planner/finance `localCache` 已是共享封装;music `settings.crossfade` 的
deprecated 字段是数据兼容,保留。

## AppBar 骨架组件(PLAT.CORE.6,2026-07-12)✅

**产物:** `@life-os/platform-web/svelte/app-bar` → `LifeOsAppBar`,拥有
`header.appbar > .appbar-inner > .appbar-leading / .appbar-titles /
.appbar-trailing` 骨架。Props:`title / subtitle / backHref / backLabel /
onBack(history 返回按钮)/ hidden / barClass`;snippets:`leading`(无返回
态的品牌位)、`titles`(整体替换默认标题块,承载 Music `.appbar-center`、
Planner 清单菜单等 app 自有中部)、`trailing`。默认返回链接(chevron + label)
组件内置;样式仍全部归 theme `shell.css`,组件遵循 app-shell 同款
「generic、无 app ID」约束(见 `packages/platform-web/src/svelte/app-bar/README.md`)。

**迁移:** fitness / starter / music / planner / home 的 `AppBar.svelte` 与
portal 的 `PortalAppBar.svelte` 全部改为薄封装,只注入 AppBrand /
ReportBugButton / i18n / 领域动作。顺带统一:home 返回链接补上 chevron 图标
(其 iconRegistry 本已注册 `chevron-left`)。

**验证:** 7×check 0 错误 · 9×build 全过 · fitness 7/7 · starter 3/3 ·
music 6/6 · home 7/7 spec;fitness(含 `/auth` 返回态)/ music / planner /
home / portal dev 实测,appbar DOM 结构与修饰类(`appbar--back/--tools/
--list-menu`)逐一核对,无 console 错误。

## 剩余候选(未做)

| 候选 | 证据 | 备注 |
| --- | --- | --- |
| **复杂 SW 收编** | fitness(215)/ planner(230)/ music(384)各有领域缓存策略 | 评估能否「basic 模板 + 策略插槽」;需逐 app 离线 QA |
| **app 侧 persisted-state 反向对齐** | fitness/music/home 的 load/save 头部 | 顺手活,随下次触碰各 state 文件时做 |
| **全局错误捕获**(业界标配缺口)| 各 app 无 `unhandledrejection`/`window.onerror` 统一处理(仅 music player 内部有)| 可选:platform-web `bindGlobalErrorReporting`(console + toast);对单用户 QA 有用,无痛点证据前不强推 |
| 不做:analytics / feature flags | 业界多 app 平台标配,但单用户场景过度设计 | — |

**不建议提取:** `nav.js` IA 内容、settings 页面编排、`ui.svelte.js` 领域
弹层状态(285 行 diff,纯 app 域)——它们的"形状"已由 contracts/设计系统约束,
内容本就该 app-owned。

**Starter 模板联动:** auth 工厂落地后,`apps/starter` 晋升清单的"接登录"
一步从「参考 fitness 抄 43 行」变为「调一次 `createAppAuthStore`」。
