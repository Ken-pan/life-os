# STARTER.OS — Life OS app 模板（PLAT.SHELL.5)

新 Life OS app 的活模板:`LifeOsAppShell` v1.1 + theme + i18n(zh/en)+
主题偏好持久化 + PWA 基座。作为 workspace 成员随 `npm run check` /
`npm run build` 常绿,防模板腐化。

## 生成新 app

```bash
node scripts/create-life-os-app.mjs reading --name "READING.OS" --port 5876
npm install
npm run check --workspace=reading-os
npm exec --workspace reading-os -- vite dev
```

## 模板包含

| 部分 | 位置 |
| --- | --- |
| AppShell 组合(导航/头部/主区/焦点/skip link)| `src/routes/+layout.svelte` |
| 设置持久化 + 主题应用 | `src/lib/state.svelte.js`(`localStorage` key `starteros_v1`)|
| i18n(platform-web `createI18n`)| `src/lib/i18n/` |
| 桌面 SideNav / 移动 BottomNav | `src/lib/components/` |
| 占位品牌 token(中性灰)| `src/app.css` |
| PWA 基座(theme bootstrap、standalone 检测、manifest)| `src/app.html` · `static/manifest.webmanifest` |
| Shell 合同测试 | `tests/pwa/starter-app-shell.spec.ts`(`PWA_APP=starter npx playwright test …`)|

扩展点(persistentOverlay / transientOverlay / shellClass / shellDataset /
`scrollMode="locked"`)见 `+layout.svelte` 内注释与
[`docs/architecture/life-os-app-shell.md`](../../docs/architecture/life-os-app-shell.md)。

## 晋升清单(模板 → 正式 app)

目前手动,`PLAT.SHELL.6` generator 的自动化目标:

1. **品牌**:token 迁 `packages/design-tokens/tokens/brands/<app>.json`,
   `app.css` 改 `@import '@life-os/theme/brands/<app>.css'`;
   `packages/theme/src/brand.js` + `documentMeta.js` 注册(之后可换用
   `DocumentHead` / `AppBrand` / `AppBrandSwitcher`)。
2. **登录/云同步**:接 `@life-os/platform-web` `createLifeOsAuth` +
   Supabase(参考 fitness `src/lib/auth.svelte.js`)。
3. **Portal**:`LIFE_OS_SWITCHER_APPS` 与 Portal 摘要。
4. **PWA 矩阵**:`scripts/pwa/apps.config.mjs` 补 routes/clipPaths,
   `pwaTestEnabled: true`;图标 `scripts/generate-life-os-brand-icons.py`。
5. **部署**:根 `netlify.toml` · `.claude/launch.json` · `docs/ops/netlify.md`。
