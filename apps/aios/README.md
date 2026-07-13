# AI.OS — Life OS app 模板（PLAT.SHELL.5)

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
| 设置持久化 + 主题应用 | `src/lib/state.svelte.js`(`localStorage` key `aiosos_v1`)|
| i18n(platform-web `createI18n`)| `src/lib/i18n/` |
| 桌面 SideNav / 移动 BottomNav | `src/lib/components/` |
| 占位品牌 token(中性灰)| `src/app.css` |
| PWA 基座(theme bootstrap、standalone 检测、manifest)| `src/app.html` · `static/manifest.webmanifest` |
| Shell 合同测试 | `tests/pwa/starter-app-shell.spec.ts`(`PWA_APP=starter npx playwright test …`)|

扩展点(persistentOverlay / transientOverlay / shellClass / shellDataset /
`scrollMode="locked"`)见 `+layout.svelte` 内注释与
[`docs/architecture/life-os-app-shell.md`](../../docs/architecture/life-os-app-shell.md)。

## 晋升(模板 → 正式 app,PLAT.SHELL.6 已自动化)

每个生成的 app 带 `app.manifest.json`(AppManifest,声明式注册信息;
本目录的同名文件是 schema 示例)。按需改好 manifest(文案/主题色/路由/
`experimental`)后一条命令接线全部注册表(幂等,可重复执行):

```bash
node scripts/promote-life-os-app.mjs <app-id>
```

自动接线:siteMeta · launcher(origins + switcher)· brand accent ·
design-tokens(brands json + `BRAND_APPS` + theme exports)· `app.css`
品牌 `@import` · PWA 矩阵 · preview case · 根 scripts · `launch.json` ·
`netlify.toml` · shell 合同 spec,并跑 `build:tokens` + `validate:tokens`。

仍属手动(脚本结尾会打印清单):品牌配色与图标、Netlify site 创建 + DNS +
`docs/ops/netlify.md` 记录、登录/云同步(`createLifeOsAuth`,参考 fitness
`src/lib/auth.svelte.js`)、上线后 `production: true`。
