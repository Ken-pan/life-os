# Roadmap 发货日志

从 hub §Shipped 链入。格式：**日期 · 摘要 · commit（可选）**

维护：每次完成 hub §Now 项后追加一行；不必复制整表。

> **PaperOS 证据链接说明（2026-07-12）：** 下方历史条目中的 `qa/paperos/*`、`archive/paperos/*` 证据文件已随 PaperOS 迁出至独立仓库（`/Users/kenpan/「Projects」/paperos`），本仓库不再保留。相关行保留为历史记录，链接已去激活。

## 2026-07-16（DS 平台化批量推进：品牌 7 站 · 行为组件三族 · 护栏/基线扩容）

| 主线       | 发货项 / 里程碑 | 证据 |
| ---------- | --------------- | ---- |
| DS/Tokens  | **AIOS + Portal 品牌收编**：`brands/aios.json`（无彩灰阶）+ `brands/portal.json`（天蓝）；BRAND_APPS 7 站，portal `<html>` 补 `data-app`；两 app 的 app.css 品牌块删除改 `@import` | `packages/design-tokens/tokens/brands/{aios,portal}.json` · validate:tokens 绿 · 浏览器实测双端 token 生效 |
| DS/Tokens  | **Chart token 层**：`semantic.json` `chart` 域 → `--chart-grid/axis/tooltip-*/line*/positive…`（var() 派生全品牌自适应）；finance 既有同名定义成为合法品牌覆盖 | `generated/tokens.css` |
| DS/Theme   | **`prefers-reduced-transparency` 降级层**（新 `reduced-transparency.css`，不进 @layer）：`--chrome-frost` 清空 + appbar/nav 转不透明 + 全局关 backdrop-filter；CDP 模拟实测生效 | `packages/theme/src/reduced-transparency.css` |
| DS/Platform | **Overlay 行为组件**：`svelte/overlay` → `LifeOsSheet` / `LifeOsDialog`（backdrop/Escape/focus trap/滚动锁/ARIA/入场过渡）；fitness `SkipModal` 迁为薄封装 | catalog Interactive 状态实测 trap+滚动锁开合链路 |
| DS/Platform | **表单原语**：`svelte/form` → `TextField/NumberField/SelectField/TextareaField/DateField/DateTriggerField`（label-for/aria-invalid/hint/error 内置）；finance 四个 field + planner DateField 迁为薄封装，`.field-affix`/`.date-field-wrap` CSS 上提 theme | forms showcase + finance/planner build 绿 |
| DS/Platform | **导航骨架**：`svelte/navigation/bottom-nav` + `side-nav`；六 app 十份 BottomNav/SideNav 全部迁为薄封装（IA/active/More sheet 留 app 侧） | fitness/home/music/starter app-shell spec 全绿（fitness 1 failure 为 master 存量，已用 stash 对照证实与迁移无关） |
| DS/Platform | **空态/错误态**：`svelte/status` → `EmptyState` / `ErrorState`（`.empty--error` + 重试位）；planner EmptyState 迁薄封装；primitives showcase 补 error 状态 | catalog 实测 |
| DS/CI      | **showcase 注册完整性护栏** `check:design-catalog-registry`（catalogNav/showcaseStates/App.svelte/文件 四处对账，负向测试验证）进 CI design-catalog job | `scripts/check-design-catalog-registry.mjs` |
| DS/QA      | **DSGN.CATALOG.7 生产四站共享 primitive a11y 抽检** `qa:prod-a11y`：标题/导航对比度 + 44px 触控 + focus-visible × light/dark；首跑 62 pass / 0 fail（planner dark 导航 3.57 记 warn） | `scripts/lifeos-prod-a11y-spotcheck.mjs` |
| DS/QA      | **像素基线 114→162 张**：overlay/forms 两个新 showcase + **32 张 393×852 mobile 基线**（navigation sheet-open / overlay sheet / settings / toast × 4 app × 2 mode）；全部 canonical docker 生成并复跑验证 | `tests/visual/design-catalog.snapshots.spec.ts` §mobile |
| DS/护栏    | **棘轮第一批清零**：portal/starter/design-catalog/platform-web 六桶 raw-hex/font-size/motion → 0（catalog 35 处裸字号全部 token 化），基线 707→664 收紧；planner/fitness/music/finance/aios 余量多为领域常量（杠铃片配色/mask 渐变/var 兜底），留档分批 | `scripts/lifeos-styles-baseline.json` |
| DS/Docs    | **组件选型决策表**（要做 X → 用 Y）进 `DESIGN_SYSTEM.md`；platform-web README 导出索引补 overlay/form/status/nav 骨架 | `packages/theme/DESIGN_SYSTEM.md` |
| DS/Theme   | **Toast 视觉重做**（用户反馈旧样式丑）：整条 tint 底 + pill → 中性浮层卡片（`--card`/`--border-l`/12px，暗色抬 `--card-h`）+ `.toast-dot` 语义色圆点；music 旧 tint 覆盖删除走默认；catalog 收容改按生产宽度展示（不再拉满 100%） | `packages/theme/src/components.css` §toast · `Toast.svelte` · 浏览器实测 4 tone × 明暗 |

验证：8 workspace check + 10 task build 全绿 · catalog smoke 276 + a11y 48 · snapshots 162/162（canonical docker 复跑）· 样式/边界/manifest 护栏绿。Home 玻璃质感 token 化清偿因与并发 home 重构会话冲突而推迟。

## 2026-07-15（DS/Theme 视觉现代化 · 圆角阶梯 · 共享状态原语 · 样式护栏）

| 主线       | 发货项 / 里程碑 | 证据 |
| ---------- | --------------- | ---- |
| DS/Theme   | **AppShell/AppBar/底栏/切换器菜单磨砂配方收敛**为 `--chrome-frost` 组件 token；按钮/FAB/Sheet/Modal/Toggle/Seg 补投影层次；移除高亮条式激活态（用户明确反馈：圆角+高亮条不好看，已入 [[no-accent-rail-on-rounded-nav]] 记忆） | `48d191f6` |
| DS/Theme   | **圆角阶梯**：`primitive.json` 收敛为 control 8 / surface 12（`--radius-sm` 并入 `--radius-lg`，消除此前 14px>12px 的倒挂）/ overlay 20（新增 `--radius-overlay`）/ pill；旧名保留别名，Sheet/Modal 硬编码 20px 全部 token 化 | `48d191f6` · `packages/design-tokens/tokens/primitive.json` |
| DS/Theme   | **共享状态原语**新增：`.skeleton`（+ text/title/circle 变体，扫光动效）、`.spinner`、`.badge`（6 语气）、`.empty-title/-desc/-actions`、`.life-os-popover` 面板基座、`.life-os-spin` 工具类；六 app 手写的骨架屏/图标自旋(portal/finance/music/planner/aios)迁移到共享原语，删除本地重复 keyframes(顺带修复 finance 一处引用已删 keyframes 的死动画) | `48d191f6` · `55be3e00` |
| DS/Platform | 新增 **Menu 组件**（`svelte/menu`，键盘导航 + 外点关闭 + Escape，外观走 `.life-os-popover`） | `48d191f6` · `packages/platform-web/src/svelte/menu/Menu.svelte` |
| DS/CI      | 新增 **`check:lifeos-styles` 护栏**（棘轮基线）：裸 hex 色 / 裸 px 字号 / transition 字面量时长 / `.svelte` 内 `@custom-media`（对应 [[svelte-style-no-custom-media]] 已知坑，现在是 CI 硬线）；接入 CI，紧邻 `check:lifeos-boundaries` | `48d191f6` · `scripts/check-lifeos-styles.mjs` |
| DS/App 采纳 | planner/fitness/finance/music/portal/aios 的 `transition` 字面量迁移到 `--dur-*`/`--ease-*` token（保留 linear/自定义 easing/功能性长时长）；删除 finance React 时代遗留 `src/index.css`（6952 行，SvelteKit 版从未引用） | `55be3e00` |
| DS/Catalog | design-catalog 新增 **Primitives** + **Menu** showcase（17 个 showcase）；Settings showcase 补组合护栏用例（ButtonGroup 直挂 Section 的对齐契约，此前曾全线错位） | `48d191f6` · `PrimitivesShowcase.svelte` · `MenuShowcase.svelte` |

验证：token 校验 + 七个 app（含 design-catalog）构建全绿；theme 单测 9/9；浏览器实测（home，深浅双主题）壳层磨砂/圆角/激活态/骨架屏均生效，控制台零报错。

## 2026-07-14（AIOS 跨 app 打通 · GYMS 自动调节 · Finance payment_day · 全线 DS/走查收敛）

| 主线    | 发货项 / 里程碑 | 证据 |
| ------- | --------------- | ---- |
| AIOS    | **AIOS.20–25** 第七 app 接入 Life OS：读 `core_*` 今日快照/财务/待办注入系统提示 · 经 `life_events` 收件箱写 Planner · 早晨简报原生通知 · MCP 客户端(HTTP) · 可编辑 Canvas · 对话后自动记忆萃取 | `25d619b4` · `075789f1` · `da16e23b` · `0f050cc9` · `c304af0d` · `bdfa7fcd` · [`apps/aios.md`](./apps/aios.md) |
| Fitness | **GYMS.VOL.6 + GYMS.BW.7** 每周肌群容量仪表盘 + 体重趋势 · **GYMS.VOL.6a** 分数容量科学性修正 · **GYMS.READY.8 + GYMS.WARMUP.9** Readiness 自动调节建议 + 热身坡道 · **GYMS.FIX** 今日推荐轮换 + 日历移动端溢出 | `fb988ca4` · `79be79b0` · `fd447af1` · `8bd5f106` |
| Finance | **payment_day** 信用卡实际扣款日 / 提前还款建模 · 页头迁共享 `LifeOsAppBar` · UI/UX 走查修复 · 全页面终检修复 | `5e2d8b9f` · `c60e96bd` · `85156a2b` · `8db05048` |
| Music   | 推荐行为闭环通电（`recommendation_events` 在线学习回读）· 沉浸播放改覆盖式 overlay · 歌词补全全自动化 · mini player 移动端吸底 dock · 品牌色收敛 Tier 2–4 · UIUX 走查 | `02938780` · `c422c686` · `b9304113` · `1455b11f` · `34cc0c61` · `9f3b08f7` |
| Planner | 快速添加自然语言解析 + 快速处理收窄 + 浅色侧栏 · UIUX 走查修复 | `aadc5fb2` · `3ce2ceab` |
| DS/Theme | 中性激活态上升共享原语 `.seg-tone-calm` / `.nav-tone-calm`（opt-in）· 浮层边缘定位 + 内联展开共享原语 · 滚动条基线上升共享层 · settings 内容全局左对齐 | `ce7d6e19` · `fd342cef` · `7e9a2628` · `f0b324b5` · `24ffdf2e` |
| CI 🔴→🟢 | **修复 master CI 长红（design-catalog job）** —— 根因两层：① `f0b324b5`「危险按钮重做」把 `.btn-danger` 底色改为 `color-mix()` tint，浏览器 computed 值变成 `color(srgb … / 0.08)` 语法，而 a11y 助手 `parseRgb` 只认 `rgb()` → 返回 null → `contrastRatio` 返回 **0.00:1 假失败**（btn-danger 真实对比度 **5.04:1，本就达标**）；② a11y 先挂导致 **snapshots 步骤从未执行**，掩盖了 `f0b324b5` 滚动条 `scrollbar-gutter: stable` 造成的 82 张基线过期（1440→1430px）。修：a11y 助手补 `color(srgb)` 解析 + **沿祖先链合成半透明背景**（对比度本就该这么量）；全部 98 张基线在 canonical docker 重生成 | `tests/visual/design-catalog.a11y.helpers.ts` · 数学对已知真值自检（黑白 21:1 · 50% 黑合成白=127）· **CI 容器内实测 smoke 213 / a11y 48 / snapshots 98 全绿** |
| DS/Catalog | **补覆盖：Modal + ExplainPanel 两个 showcase**（`modal.css` 是核心原语却 0 覆盖；`explain-panel` 是 07-14 刚上升的共享原语，上线即裸奔）· 新增 16 张像素基线 | `ModalShowcase.svelte` · `ExplainPanelShowcase.svelte` · `.catalog-doc-preview--modal` 收容 fixed 覆盖层 · 浏览器实测 ExplainPanel 展开/aria-expanded 契约 |
| DS/Catalog | **showcase 列表收敛为单一真源** —— `MATRIX_SHOWCASES`/`APPS`/`MODES` 原硬编码在 `catalogNav.js` + `helpers.ts` + `spec.ts` **三处**（加一个 showcase 要改 5~6 处，漏改不报错只静默少跑）；现 helpers 从 catalog 自身注册表派生、spec 从 helpers 导入。`SNAPSHOT_DEFAULT_STATE` 手维护表**整个删除**改为派生（核对 9/9 与原值吻合 → 既有基线 **0 churn**） | `tests/visual/design-catalog.helpers.ts` · 验证：只改 `catalogNav.js` → 测试自动从 182 收集到 214 |
| DS/Theme | **`music-shell.css` 迁回 apps/music**（5601 行 · 占共享 theme 59% · 消费者仅 music 一个 · 属初始 commit 的遗留摆放）—— theme 9442→3841 行（−59%）；正文与移动前**逐字节 0 差异**；`design-system.css` 文件头修正（自称「三端」实为 10 个消费者）+ 补边界规则 | `packages/theme/package.json` 去 `./music-shell.css` 导出 · music build/check 0 error · design-catalog **181 passed** · 浏览器实测 241 条 shell 规则生效、自定义媒体查询 `(--life-os-desktop)` 正常 |

## 2026-07-13（GYMS.SUB.5 收割 · PLNR.SCHED.0 E2E 复绿）

| 主线    | 发货项 / 里程碑 | 证据 |
| ------- | --------------- | ---- |
| Fitness | **GYMS.SUB.5** 替代动作完整训练流 — 工程 gate + 产品 UI/copy closure 全绿，正式收割 | closure #19 `67e72b81`（选中态 `aria-pressed`+checkmark · `done`-分支文案 · Summary `Replaced` · Focus `Switched from`）· `session-queue`+`substitution` specs **9/9** · [`FT-P5-substitution.md`](../../apps/fitness/docs/FT-P5-substitution.md) |
| Planner | **PLNR.SCHED.0** desktop+mobile E2E 复跑修复 — 2 处 stale selector（`保存`→`创建任务`；schedule preset `下午` exact 匹配）修正后全绿 | `e2e.spec.js` · `screenshot-achievement-schedule.spec.js` · `schedule-usability` standalone guard 4/4 · **剩真机 iPhone 签收** |
| Finance | **FINC.SYNC.1b** 扩展 popup last sync + 重试 — timestamp + 脱敏失败原因 + retry 按钮 | `popup/popup.js` `renderSyncHealth` · `syncStateLogic.js` · `extensionSyncHealth.test.js` **18/18** |
| Planner/Portal | **PLNR.CORE.4** Today ↔ Portal 今日计数口径对齐（tz + tombstone + `dueDate==today`） | migration `ce475c75`（`20260712200000`）· `selectors.test.js` 跨应用 parity 契约 **9/9** |

| 主线    | 发货项 / 里程碑 | 证据 |
| ------- | --------------- | ---- |
| PaperOS | **PAPR.DATA.verify** 设备生产 sync E2E **PASS** | `qa/paperos/data-plane-2026-07-11.md`（→ paperos 仓库） |
| PaperOS | **PAPR.SYS.0** conditional pass accepted | `qa/paperos/lifecycle.md`（→ paperos 仓库） |
| PaperOS | **PAPR.SYS.1 launch discovery complete** — PAPR.SYS.1a/1b.fs closed · PAPR.SYS.1b.jrn conditional pass · implementation later resumed as primary lane | `qa/paperos/README.md`（→ paperos 仓库） |

## 2026-07-10（深度复核 · GYMS.PORTAL.2 · PaperOS 1.1 · PLNR.SCHED.0 根因）

> **2026-07-12 correction:** 下列 Slice 1.1 行只记录 checkpoint-era 代码与
> 当时的视觉 review，不代表 clean replacement PR 已通过 release gate。
> PR #27 / #28 当前均为 draft + device BLOCKED；最新真机 verdict 见
> `qa/paperos/ui-spec.md` §4.8 / §5.9（→ paperos 仓库）。

| 主线    | 发货项 / 里程碑 | 证据 |
| ------- | --------------- | ---- |
| Growth  | **GYMS.PORTAL.2** Portal Fitness `workedOutToday` — migration **远程已应用** | migration `20260710203000` · `todaySummaryFormat.js` · Supabase list_migrations ✅ |
| PaperOS | **Slice 1.1** native toolbar + QML visual | `52ae55e0` · `d7c52858` · `archive/paperos/milestones-2026-07.md`（→ paperos 仓库） |
| Planner | **PLNR.SCHED.0** Antigravity baseline + **PLNR.SCHED.0.migrate 根因** `migrateTask` 缺 `tags` | [`qa/planner-schedule-antigravity-baseline.md`](../qa/planner-schedule-antigravity-baseline.md) |
| Infra   | **PAPR.DATA.verify** — 生产 Paper API 路由复核（401 非 404） | `curl https://planner.kenos.space/api/paper/today` · `apps/planner/static/_redirects` · **2026-07-11 设备 E2E 见上节** |

## 2026-07-10（Planner 日程 baseline · PaperOS Slice 1 · 文档复核）

| 主线    | 发货项 / 里程碑 | 证据 |
| ------- | --------------- | ---- |
| Planner | **P-SCHED-0** Antigravity baseline 完成（Scenario A 通过；legacy `tags` + mobile scroll 待修） | [`qa/planner-schedule-antigravity-baseline.md`](../qa/planner-schedule-antigravity-baseline.md) · `docs/qa/evidence/planner-schedule/2026-07-10/` |
| PaperOS | **Core Slice 1** System drawer · Gallery · native ink chrome · recovery gate | `qa/paperos-core-slice-1-integration-gate.md`（→ paperos 仓库） |
| PaperOS | **Slice 1.1** QML 视觉 delta（Gallery / Drawer / `+`）Antigravity PASS | `qa/paperos-core-slice-1-1-visual-delta-gate.md`（→ paperos 仓库） |
| PaperOS | **PAPR.DATA.verify** 当时登记 404 — **2026-07-10 复核改为路由 401 正常** | 见 hub §深度复核 · [`apps/paperos.md`](./apps/paperos.md) |
| Docs    | Hub 优先级复核 → **PLNR.SCHED.0** · PAPR.DATA.verify · GYMS.SUB.5 · FINC.PURCHASE.6 · PAPR.UI | [`LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) · [`AGENT_WORKSTREAMS.md`](./AGENT_WORKSTREAMS.md) · [`apps/paperos.md`](./apps/paperos.md) |

## 2026-07-10（Planner Projects · Home 墙图）

| 主线 | 发货项 | 证据 |
| ---- | ------ | ---- |
| Planner | **P-PROJ-0–2** 项目实体 + structured sync、Projects 列表/详情、任务 `@项目` 与 project chip | `935a5b78` · `7bacded2` · `planner_projects` 远程表 |
| Planner | **P-PROJ-3** 项目详情只读 Roadmap / repo refs；危险 URL 不渲染为链接；mobile + desktop E2E | `routes/projects/[id]/+page.svelte` · `project-references.spec.js` |
| Home | **H-W3–W5** 手绘分区、家具/储藏指派、迁移/文档；H-W0–W5 全线完成 | `b06217fe` · `test:plan-edit` 13 checks |
| PaperOS | **PAPR.DEV.1–4** launcher、离线读、CJK/分页、退出/恢复/systemd launcher | `51791a93` · `ea92f6dd` · `b662285a` |

---

## 2026-07-09（Portal UI 修复 · P-5b/P-12 · 第五轮）

| 主线   | 摘要                                                                 | 证据                                      |
| ------ | -------------------------------------------------------------------- | ----------------------------------------- |
| Design | **P-5b** compact 顶栏 **More sheet**（主题 / 账号 / 退出）+ `lockScroll` | `PortalAppBarMoreSheet.svelte` · `PortalAppBar.svelte` |
| Design | **P-12** Launcher HOME.OS 实验卡左边框改 **虚线**，与摘要实验卡一致   | `PortalLauncherCard.svelte` · `app.css`   |
| QA     | 走查 **P-1–P-12 全部关闭**；`qa:smoke` 五卡 ✅                        | [`docs/qa/portal-screenshot-audit.md`](../qa/portal-screenshot-audit.md) 第五轮 |

## 2026-07-09（Portal UI 修复 · P-4/P-5/P-7/P-9/P-11）

| 主线   | 摘要                                                                 | 证据                                      |
| ------ | -------------------------------------------------------------------- | ----------------------------------------- |
| Design | **P-4** BrandMark 40px · **P-11** 五卡 2×2+通栏 · **P-9** 状态 pill 对比度 | `PortalTodaySummary.svelte` · `app.css`   |
| Design | **P-7** 铃铛 inbox 角标 · 隐藏 appbar OS accent · **P-5** compact 44px 触控 | `PortalAppBar.svelte`                     |
| QA     | **P-8** mobile 视口截图 + `mobile-launcher.png`；`qa:smoke` 五卡 ✅ | `qa-screenshot.mjs` · 走查第四轮          |

## 2026-07-09（Phase 6 · HOME.PROJ.6a + PORT.GROWTH.4b-H）

| 主线   | 摘要                                                                 | 证据                                      |
| ------ | -------------------------------------------------------------------- | ----------------------------------------- |
| Home   | **HOME.PROJ.6a** `syncHomePortalSummary` — 储藏区数 → `core_user_app_settings.settings.portal_summary` | `packages/sync/src/homePortalMetadata.js` · `apps/home/src/lib/homePortalMetadata.js` |
| Growth | **PORT.GROWTH.4b-H** `portal_today_summary` 扩 `home` + Portal 第五卡「储藏审计」深链 `/storage` | migration `20260709021500` · `PortalTodaySummary.svelte` |
| QA     | `qa:smoke` 五卡 ✅ · RPC 验收 `storageZoneCount: 8`                  | `qa-smoke.mjs` · `desktop-summary.png`    |

## 2026-07-09（Portal UI 截图走查 · 第二轮）

| 主线   | 摘要                                                                 | 证据                                      |
| ------ | -------------------------------------------------------------------- | ----------------------------------------- |
| QA     | 12 张截图 + `manifest.json`；PORT.GROWTH.8 inbox 深链 desktop/mobile ✅；`qa:smoke` ✅ | [`docs/qa/portal-screenshot-audit.md`](../qa/portal-screenshot-audit.md) · `docs/ui-qa-screenshots/portal/` |
| 后续   | P-4/P-5/P-7/P-8/P-9 已于第四轮修复；P-5b/P-12 于第五轮关闭              | 走查报告 §问题清单                        |

## 2026-07-09（MUSC.PIPE.5 行为分验收）

| 主线  | 摘要                                                                 | 证据                                           |
| ----- | -------------------------------------------------------------------- | ---------------------------------------------- |
| Music | **MUSC.PIPE.5** `qa:rec-behavior` **6/6** — complete 事件 → `recently completed` reason + Δscore 0.04 | `seed-m5-qa-library.mjs` · `qa-recommendation-behavior.mjs` |
| Infra | CI 增 `portal-qa-smoke` · `music-qa-rec-behavior`（secrets 缺则 skip） | `.github/workflows/ci.yml`                     |

## 2026-07-09（Phase 5 · Portal PORT.GROWTH.8/PORT.GROWTH.9 + P-1）

| 主线   | 摘要                                                                 | 证据                                      |
| ------ | -------------------------------------------------------------------- | ----------------------------------------- |
| Growth | **PORT.GROWTH.8** pending 角标 + 状态文案 → `planner…/inbox` 深链             | `PortalAppBar.svelte` · `+page.svelte`    |
| Infra  | **PORT.GROWTH.9** `qa:smoke.mjs` — **五卡** · inbox 深链 · ⌘K · Esc 关闭 ✅       | `apps/portal/scripts/qa-smoke.mjs`        |
| Design | **P-1** `--overlay-backdrop` 55% + CommandPalette blur 8px           | `design-tokens` · `CommandPalette.svelte` |

## 2026-07-09（四轮计划 · Phase 0–4 批次）

| 主线        | 摘要                                                                                              | 证据                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Finance     | **FINC.CORE.3** `buildAugmentedDailyOutlook()` — Today 与 Spend 抽屉 STS 口径统一；`outlook.test.ts` 40 pass | `apps/finance/src/engine/outlook.ts`                                 |
| Growth      | **PORT.GROWTH.4b-M** `portal_today_summary` 扩 Music 第四卡；骨架四卡                                      | migration `20260708191000` · `PortalTodaySummary.svelte`             |
| Growth      | **PORT.GROWTH.6** Portal ⌘K 14 条跨站深链 + `portal_cp_recent_v1` 最近搜索；`test:cp` ✅                   | `commandPaletteActions.js` · `CommandPalette.svelte`                 |
| Planner     | **PLNR.CORE.2** Insight 批量排期 E2E — `localDateKey()` 修复 UTC/本地日；desktop **22/22**             | `scheduling.js` · `e2e.spec.js`                                      |
| Fitness     | **GYMS.CORE.0** E2E **20/20**；**GYMS.EVENTS.1** `fitness.workout_logged` 触发器远程 ✅                       | `apps/fitness/tests/` · migration `20260708200000`                   |
| Integration | **INTG.EVENTS.1b** / **PLNR.CORE.5** Planner `lifeEventsInbox` 消费完练事件 → habit 打卡；inbox 测试 7/7      | `packages/contracts/src/events.ts` · `lifeEventsInbox.js`            |
| Music       | **MUSC.PIPE.5** `qa:rec-behavior` 脚本就绪（QA 账号无曲库时 SKIP）                                       | `apps/music/scripts/qa-recommendation-behavior.mjs`                    |
| Infra       | CI 增 `planner-e2e-desktop` · `finance-ia-routes`（secrets 缺则 skip）                            | `.github/workflows/ci.yml`                                           |
| Portal      | UI 截图走查 + **P-2** ICON_REGISTRY 修复；`svelte-check` **0 errors**                             | [`docs/qa/portal-screenshot-audit.md`](../qa/portal-screenshot-audit.md) |

## 2026-07-08（Home Life OS 接入 + HOME.PROJ.5 平面 UX）

| 主线        | 摘要                                                                                      | 证据                                                 |
| ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Integration | Home SSO 生产化：`touchAppLastOpened` + `lifeOsPresence`；migration `home` app_id 远程 ✅ | `apps/home/src/lib/lifeOsPresence.js` · Supabase MCP |
| Integration | Home PWA：`static/sw.js` + `SKIP_WAITING` 热更新；manifest shortcuts                      | `apps/home/static/` · `serviceWorker.js`             |
| Home        | HOME.PROJ.5：浏览/编辑双模式；`plan-viewport` CTM；`test:viewport` 67/67 ✅                      | `apps/home/scripts/plan-viewport-stress.mjs`         |
| Platform    | PWA SSOT 增 `home`；`npm run pwa:preview:home`                                            | `scripts/pwa/apps.config.mjs`                        |

## 2026-07-09（HOME.PORTAL.1 Portal Home 实验卡）

| 主线   | 摘要                                                                                          | 证据                          |
| ------ | --------------------------------------------------------------------------------------------- | ----------------------------- |
| Growth | HOME.PORTAL.1：`PORTAL_APPS` 加 `home`；独立「实验」区 + inline「实验」badge；default_app 仍仅四生产站 | `apps/portal/src/lib/apps.js` |

## 2026-07-09（FINC.GROWTH.1 + PORT.GROWTH.2 生产验收）

| 主线   | 摘要                                                                                                       | 证据                                                |
| ------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Growth | PORT.GROWTH.2：Portal AppBar 角标 ✅ — pending `life_events` 显示「1 条待处理事件」                                 | `portal.kenos.space` + 测试行后清理                 |
| Growth | FINC.GROWTH.1：ExtensionSyncBridge 生产 toast ✅ — 模拟 `FOS_BRIDGE_CAPTURES` 后显示「Rocket Money 已同步」+ 时间戳 | `finance.kenos.space` CDP 注入（空 recurring rows） |
| Infra  | INTG.EVENTS.1.5 outbox `--smoke` 远程 ✅ — `finance.bill_due` pending + cleanup                                     | `./scripts/test-outbox-trigger.sh --smoke`          |

## 2026-07-09（MUSC.UI.2 Music UI E2E）

| 主线  | 摘要                                                                                          | 证据                               |
| ----- | --------------------------------------------------------------------------------------------- | ---------------------------------- |
| Infra | MUSC.UI.2：`qa-ui-flow.mjs` — 8 路由 smoke · IDB seed · playTracks · queue=2 · **15/15 pass**    | `apps/music/scripts/qa-ui-flow.mjs` |

## 2026-07-09（FINC.CORE.0 Finance route smoke）

| 主线  | 摘要                                                                               | 证据                                  |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------------- |
| Infra | FINC.CORE.0：`ia-qa-auth.mjs` 共享登录；`ia-route-smoke.mjs` **22/22** authenticated pass | `apps/finance/scripts/ia-qa-auth.mjs` |

## 2026-07-09（PLNR.CORE.2 Planner desktop E2E）

| 主线  | 摘要                                                                               | 证据                                |
| ----- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| Infra | PLNR.CORE.2：`e2e.helpers.js` 桌面 QuickAdd + 收件箱「添加灵感」；desktop **21/22** pass | `apps/planner/tests/e2e.helpers.js` |
| Infra | 遗留 P-1：Insight 批量排期（mobile + desktop）仍失败                               | `docs/qa/e2e-issues.md`             |

## 2026-07-09（PORT.GROWTH.4 Portal 今日摘要）

| 主线   | 摘要                                                                                     | 证据                               |
| ------ | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| Growth | PORT.GROWTH.4：`portal_today_summary()` RPC — Planner 今日/逾期、Finance 月结余、Fitness 最近完练 | `portal.kenos.space`「今日摘要」区 |

## 2026-07-09（HOME.PORTAL.1 生产 + HOME.SSO.2/HOME.SSO.3 Home SSO）

| 主线        | 摘要                                                                            | 证据                                             |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| Growth      | HOME.PORTAL.1：Portal「实验」区 + HOME.OS 卡 ✅ — `4 个生产应用 · 1 个实验`              | `portal.kenos.space` 生产 deploy                 |
| Integration | HOME.SSO.2：`createLifeOsAuth('home')` + `setupCrossDomainSSO`；设置页账号区 ✅       | `home.kenos.space/settings` 跨域 Cookie 自动登录 |
| Integration | HOME.SSO.3：`20260708180000` 扩 `app_id` 含 `home`；redirect `home.kenos.space/**` ✅ | `./scripts/verify-life-os-identity-p0.sh`        |
| Growth      | PORT.GROWTH.2：Portal `life_events` pending 角标生产验收 ✅                              | 测试 pending 行 + Portal 角标                    |

## 2026-07-09（INTG.IDENTITY.0 生产 E2E + 关联验收）

| 主线        | 摘要                                                                                            | 证据                                                     |
| ----------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Integration | INTG.IDENTITY.0：五站生产跨域 SSO ✅ — 同 `auth.uid()`（`c2831538…`）；`lifeos_shared_session` Cookie 生效 | Portal / Planner / Finance / Fitness / Music 浏览器验收  |
| Growth      | PORT.GROWTH.1：Portal「继续」读 DB `last_opened_at` → Planner ✅                                         | `portal.kenos.space`「继续」区                           |
| Growth      | MUSC.CORE.1：`music.play_events` 生产已有 **167** 行 ✅                                                | `./scripts/supabase-sql.sh`                              |
| Platform    | AppBrandSwitcher 生产 ✅ — Finance 侧栏菜单含 5 站 + Home「实验」                               | `finance.kenos.space` 走查                               |
| Integration | INTG.IDENTITY.0 冷启动：Playwright 新 context 无 Cookie 时需重新登录（符合预期）                           | 严格无痕「先登 Finance 再开 Planner」仍建议人工复验 1 次 |

## 2026-07-08（Roadmap 4 周计划执行）

| 主线        | 摘要                                                                                       | 证据                                                    |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Integration | INTG.EVENTS.1：`portal.kenos.space/**` 远程 auth redirect；`20260708120000` 扩 `app_id` 含 `portal` | `./scripts/verify-life-os-identity-p0.sh` ✅            |
| Integration | P2 债：`schema.sql` 合并 `core_profiles` + `core_user_app_settings`                        | `apps/finance/supabase/schema.sql`                      |
| Infra       | CI-补：`integration-smoke` job（boundaries + outbox 结构 + 可选远程 smoke）                | `.github/workflows/ci.yml`                              |
| Infra       | QA-F0：Fitness dev 端口 5190 + Playwright `reuseExistingServer: !CI`                       | `apps/fitness/vite.config.js`                           |
| Growth      | PORT.GROWTH.1：Portal「继续」读 `core_user_app_settings.last_opened_at`                             | `apps/portal/src/lib/coreProfile.js`                    |
| Growth      | PORT.GROWTH.3：`default_app` 设置 + 登录自动跳转                                                    | `PortalSettings.svelte` + `portalPreferences.svelte.js` |
| Growth      | PORT.GROWTH.2：Portal `life_events` pending 角标                                                    | `PortalAppBar.svelte`                                   |
| Growth      | PORT.GROWTH.5：Portal 六站 PWA 安装引导                                                             | `PortalPwaGuide.svelte`                                 |
| Growth      | MUSC.CORE.1：`play_events` 写入前 ensure `music_track_meta`；Queue 展示推荐 reasons               | `apps/music/src/lib/playEvents.js`                      |
| Growth      | FINC.GROWTH.1：扩展 popup 失败重试 + 主站 sync toast 时间戳                                         | `popup.js` + `ExtensionSyncBridge.tsx`                  |
| Platform    | AppBrandSwitcher：六站侧栏跨 app 切换（`LIFE_OS_SWITCHER_APPS`；Home 标实验）              | `packages/platform-web` · `packages/theme/launcher.js`  |

## 2026-07-08

| 主线        | 摘要                                                                              | Commit     |
| ----------- | --------------------------------------------------------------------------------- | ---------- |
| Design      | D-P4 state matrix + CommandPalette showcase + P5 pixel baselines                  | `2a7ad397` |
| Design      | D-P4a matrix grid；smoke 扩至 152                                                 | `02c3733a` |
| Design      | D-P3 catalog UX + toast spacing + visual audit                                    | `ff37d401` |
| Design      | D-P3 banner tokens + P3c button/segment/toggle                                    | `7491989f` |
| Design      | D-P3b settings/toast/navigation deep tokens                                       | `bbdb27cd` |
| Design      | D-P3a card primitive + component tokens                                           | `f397abb6` |
| Design      | design-tokens 包 + 四站品牌迁移 D-P1/P2                                           | `13d78f67` |
| Design      | design-catalog thin preview D-P0                                                  | `e47992fa` |
| Integration | Portal DNS `portal.kenos.space` 上线验证                                          | —          |
| Docs        | Roadmap hub + `docs/roadmap/` 分卷；全局 docs 重组（ops/architecture/qa/tooling） | —          |

## 2026-07-07

| 主线        | 摘要                                             | Commit            |
| ----------- | ------------------------------------------------ | ----------------- |
| Platform    | C-P2 Wave 1 / 1.5 / 2 / 2.5 运行时与组件收编     | 见 git log `C-P2` |
| Integration | INTG.IDENTITY.0 migration `20260707230000` 远程 apply       | —                 |
| Integration | INTG.EVENTS.1.5 migration `20260708000000` + outbox smoke | —                 |

---

## Platform Wave 明细（归档）

### Wave 1 运行时

| 提取项          | 落点                                          |
| --------------- | --------------------------------------------- |
| Supabase client | `@life-os/sync` `createLifeOsSupabaseClient`  |
| Auth 生命周期   | `createLifeOsAuth`                            |
| i18n            | `platform-web` `createI18n`                   |
| CommandPalette  | `@life-os/platform-web/CommandPalette.svelte` |

### Wave 1.5

Finance AuthGate、`platform-web` Toast、events RFC、`themePreference`、backup 骨架。

### Wave 2 组件

`head` / `icon` / `sync-error` / `navigation` / `settings/*` / `toast` / `backup`。

### Wave 2.5 品牌

`@life-os/theme/brand`；`AppBrand`；Finance `AppBrand.tsx`。

### Wave 3 P0 / P1+

PortraitGate、localCache、Portal AppBrand、MobileMoreSheet、Portal auth、Music contracts、Finance events smoke、Planner `lifeEventsInbox`。
