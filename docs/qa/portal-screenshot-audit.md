# Portal UI 截图验收（第五轮 · 遗留 UI 清零）

**日期：** 2026-07-09（第五轮）
**环境：** `127.0.0.1:5198` preview · disposable QA account（由环境变量提供）
**脚本：** `apps/portal/scripts/qa-screenshot.mjs` · `qa-smoke.mjs`（**五卡**）
**证据目录：** [`ui-qa-screenshots/portal/main/latest/`](../ui-qa-screenshots/portal/main/latest/)（含 `manifest.json` · `mobile-launcher.png`）

## 验收范围

| 场景                  | 截图                                         | 结果                     |
| --------------------- | -------------------------------------------- | ------------------------ |
| Desktop 首页          | `desktop-home.png`                           | ✅ 五卡 2×2 + Home 通栏  |
| Mobile 首页（视口）   | `mobile-home.png`                            | ✅ 无全页拼接线          |
| Mobile Launcher 裁切  | `mobile-launcher.png`                        | ✅ P-8 取证              |
| Desktop / Mobile 摘要 | `desktop-summary.png` · `mobile-summary.png` | ✅ BrandMark 40px        |
| Desktop / Mobile 顶栏 | `desktop-appbar.png` · `mobile-appbar.png`   | ✅ 铃铛角标 · 无 OS 叠影 |
| Desktop 状态区        | `desktop-status.png`                         | ✅ P-9 对比度加强        |
| ⌘K / 过滤「曲库」     | `*-command-palette*.png`                     | ✅                       |

**自动化：** `qa:smoke` ✅（五卡 + `.portal-inbox-btn` inbox 深链）· `manifest.json` `inboxPathOk: true`

## 本轮 UI 修复（2026-07-09 · 第五轮）

| ID       | 修复                                                                       | 文件                                                                     |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **P-5b** | compact 顶栏 **More sheet**（主题 / 账号 / 退出）；`⋯` 按钮 + `lockScroll` | `PortalAppBar.svelte` · `PortalAppBarMoreSheet.svelte` · `app.css`       |
| **P-12** | Launcher **HOME.OS** 实验卡左边框改 **虚线**，与摘要实验卡一致             | `PortalLauncherCard.svelte` · `app.css` `.portal-app-card--experimental` |

**参考：** [MenuButton → Drawer 降级](https://uianatomy.dev/components/menu-button) · [WCAG 2.5.5 触控 44px](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

## 上轮 UI 修复（2026-07-09 · 第四轮）

| ID       | 修复                                                                        | 文件                                    |
| -------- | --------------------------------------------------------------------------- | --------------------------------------- |
| **P-4**  | `BrandMark` 32→**40px**；`.portal-summary-mark` 40×40                       | `PortalTodaySummary.svelte` · `app.css` |
| **P-5**  | compact 触控 **44px**（2.75rem）· 退出改图标 · trailing `nowrap` + `gap`    | `PortalAppBar.svelte` · `app.css`       |
| **P-7**  | 角标改为 **铃铛 + absolute 数字**；隐藏 appbar **「OS」accent**（根因叠影） | `PortalAppBar.svelte` · `app.css`       |
| **P-9**  | 状态 pill 字色/边框加深（≈4.5:1 方向）                                      | `app.css` `.portal-status-chip--ok`     |
| **P-11** | 桌面 **2×2 + 实验卡 `grid-column: 1 / -1`**                                 | `app.css`                               |
| **P-8**  | mobile `fullPage: false` + `mobile-launcher.png` 元素裁切                   | `qa-screenshot.mjs`                     |

**参考：** [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) · [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [cssShowcase 铃铛角标](https://www.cssshowcase.com/snippets/ui/button-with-badge) · [CSS Grid 通栏第五项](https://css-tricks.com/full-width-elements-by-using-edge-to-edge-grid/)

## 问题清单

### P-1 · CommandPalette 遮罩对比度不足（中 → 已修 2026-07-09）

| 项       | 内容                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------- |
| **现象** | 打开 ⌘K 后，背后 Launcher 干扰深链列表扫读。                                                        |
| **修复** | `--overlay-backdrop` 40%→**55%**；`blur(4px)`→**8px**；`.cp-container` 加深阴影。                   |
| **参考** | [MDN `::backdrop`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::backdrop) |
| **验收** | 第二轮 `desktop-command-palette.png`：背景明显压暗 + 模糊，列表可读。                               |

### P-2 · Portal 未注册 ICON_REGISTRY（高 → 已修）

| 项       | 内容                                                     |
| -------- | -------------------------------------------------------- |
| **现象** | ⌘K 深链行左侧 Lucide 图标空白。                          |
| **修复** | `iconRegistry.js` + layout `setContext`（2026-07-09）。  |
| **验收** | 深链行显示 calendar / wallet / dumbbell / music 等图标。 |

### P-3 · Music 摘要空状态（低 → 已修 2026-07-09）

| 项               | 内容                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| **现象（首轮）** | 第四卡「尚未记录播放 · 打开 Music 开始听」。                                                                   |
| **根因**         | QA 账号无 `music.play_events`；与 M-P5 曲库 seed 未接入 Portal 读模型前一致。                                  |
| **现状**         | M-P5 seed 后有播放记录；无 seed 时空态使用 `--empty` 字重 + 副文案「在 Music 播放后会显示最近曲目」。          |
| **建议**         | 新环境跑截图前执行 `cd apps/music && npm run qa:rec-behavior`（含自动 seed）；无 seed 时文档标注为预期空状态。 |

### P-4 · 摘要卡品牌标视觉偏小（低 → 已修 2026-07-09）

| 项       | 内容                                                      |
| -------- | --------------------------------------------------------- |
| **修复** | `BrandMark` **40px**；容器 `.portal-summary-mark` 40×40。 |
| **验收** | `desktop-summary.png` 图标与文案比例改善。                |

### P-5 · Mobile 顶栏操作密度（低 → 已修 2026-07-09）

| 项               | 内容                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **修复**         | compact 下按钮 **min 2.75rem** · trailing `nowrap` + `gap`；退出仅 **LogOut 图标**（文案 `portal-signout-label` 隐藏）。                                   |
| **续修（P-5b）** | compact 隐藏主题/用户/退出，收进 **底部 More sheet**（对齐 `mobile-more-*` 壳）。                                                                          |
| **参考**         | [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) · [UI Anatomy MenuButton](https://uianatomy.dev/components/menu-button) |

### P-6 · `svelte-check` 类型（中 → 已修）

| 项       | 内容                                                     |
| -------- | -------------------------------------------------------- |
| **修复** | JSDoc · `PortalTodaySummary` `lang="ts"`（2026-07-09）。 |
| **验收** | `npm run check` → **0 errors**                           |

### P-7 · Mobile 角标邻域视觉叠影（低 → 已修 2026-07-09）

| 项       | 内容                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| **根因** | 独立数字角标与 AppBrand **「OS」accent** 邻接，「O」被误读为叠影「0」。                |
| **修复** | **铃铛 inbox 按钮** + `position:absolute` 数字角标；appbar 隐藏 `.brand-name-accent`。 |
| **验收** | `mobile-appbar.png`：铃铛 + 「1」，无叠影。                                            |

### P-8 · Mobile 全页截图 Launcher 裁切线（低 → 已修 2026-07-09）

| 项       | 内容                                                            |
| -------- | --------------------------------------------------------------- |
| **修复** | mobile `fullPage: false`；新增 `mobile-launcher.png` 元素裁切。 |
| **验收** | `mobile-home.png` 无 PLANNER 卡白线伪影。                       |

### P-9 · 状态 pill「账号已连接」对比度（低 → 已修 2026-07-09）

| 项       | 内容                                                                            |
| -------- | ------------------------------------------------------------------------------- |
| **修复** | 字色 `color-mix(accent 78%, text)` · 边框 42% · `font-weight: 600`。            |
| **参考** | [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) |

### P-10 · Home 第五卡 G-P4b-H（低 → 已发货 2026-07-09）

| 项       | 内容                                          |
| -------- | --------------------------------------------- |
| **验收** | **8 个储藏区** · 实验虚线 · `qa:smoke` 五卡。 |

### P-11 · 五卡网格右下空位（低 → 已修 2026-07-09）

| 项       | 内容                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------ |
| **现象** | 桌面 2×2 后第五卡留空右下角。                                                                          |
| **修复** | `≥36rem` 时 `grid-template-columns: repeat(2,1fr)`；实验卡 `grid-column: 1 / -1`。                     |
| **参考** | [CSS-Tricks edge-to-edge grid](https://css-tricks.com/full-width-elements-by-using-edge-to-edge-grid/) |

### P-5b · Mobile 顶栏 More sheet（低 → 已修 2026-07-09）

| 项       | 内容                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **现象** | compact 顶栏仍偏满（铃铛 + 搜索 + 主题 + 用户 + 退出）。                                                                                       |
| **修复** | `portal-appbar-overflow` compact 隐藏；`⋯` 打开 `PortalAppBarMoreSheet`（账号行 + 主题切换 button + 退出 button）；`lockScroll` + focus trap。 |
| **验收** | `mobile-appbar.png` 仅铃铛/搜索/⋯；sheet 触控行 `min-height: var(--tap-min)`。                                                                 |

### P-12 · Launcher 实验卡边框不一致（低 → 已修 2026-07-09）

| 项       | 内容                                                                       |
| -------- | -------------------------------------------------------------------------- |
| **现象** | HOME.OS Launcher 卡 **实线** 左边框，摘要 Home 卡为 **虚线**。             |
| **修复** | `portal-app-card--experimental { border-left-style: dashed }`。            |
| **验收** | `mobile-launcher.png` / `desktop-home.png` Launcher 区 Home 卡虚线左边框。 |

## 已通过项（与发货对齐）

| Hub ID          | 验收要点                                          | 截图 / 脚本证据                      |
| --------------- | ------------------------------------------------- | ------------------------------------ |
| **G-P4b-M**     | RPC 四卡；桌面 2×2 / 移动单列；Music 有 seed 数据 | `*-summary.png`                      |
| **G-P6**        | 14 深链 + 过滤「曲库」；图标可见                  | `*-command-palette*.png` · `test:cp` |
| **G-P8**        | 铃铛 `.portal-inbox-btn` + 状态深链               | `*-appbar.png` · `manifest.json`     |
| **G-P9**        | 登录 · **五卡** · inbox href · ⌘K · Esc           | `qa:smoke` ✅                        |
| **G-P4b-H**     | RPC `home` + 第五卡储藏审计                       | `desktop-summary.png`                |
| **H-P6a**       | 元数据 `storageZoneCount: 8`                      | RPC 验收 · Home 打开即上报           |
| **P-1/P-2/P-6** | 遮罩 · 图标 · 类型                                | 见上                                 |
| **P-5b/P-12**   | More sheet · 实验卡虚线                           | `mobile-appbar.png` · launcher 截图  |

### 复现

```bash
cd apps/portal
npm run build
npm run preview -- --host 127.0.0.1 --port 5195
# 另开终端
PORTAL_QA_URL=http://127.0.0.1:5195 npm run qa:screenshot
PORTAL_QA_URL=http://127.0.0.1:5195 npm run qa:smoke
# 可选：确保 Music 摘要有数据
cd ../music && npm run qa:rec-behavior
```

必须设置已轮换的 `UI_QA_EMAIL` / `UI_QA_PASSWORD`；仓库不提供默认凭证。

## 相关文档

- [`roadmap/apps/portal.md`](../roadmap/apps/portal.md)
- [`roadmap/SHIPPED.md`](../roadmap/SHIPPED.md) — Phase 5 G-P8/G-P9
- [`e2e-issues.md`](./e2e-issues.md) — Portal §
- [`../ui-qa-screenshots/portal/main/latest/manifest.json`](../ui-qa-screenshots/portal/main/latest/manifest.json)

_本文件随 Portal UI 走查更新；修 issue 后在对应条目标 ✅ 并注明日期。_
