# Design System 主线（DSGN.* · legacy `D-*`）

Hub 状态见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)。**Canonical ID：** [`TICKET_NAMING.md`](./TICKET_NAMING.md) · `DSGN.CATALOG.*`

**战略：** token-first / code-first / visual-test-first。`design-tokens` 为真源 → generated CSS → apps + design-catalog preview。

> **改了共享视觉？基线必须走 canonical（2026-07-14 踩坑实录）：** 像素基线只有用
> `npm run test:design-catalog:snapshots:canonical`（固定 Playwright docker 镜像）生成才算数 ——
> 本地 macOS `--update-snapshots` 出来的基线在 CI 会挂（字体/AA 差异）。
> **那次是怎么烂掉的：** `f0b324b5` 一次提交里同时干了两件事 —— 滚动条 `scrollbar-gutter: stable`
> 让内容宽 1440→1430（**82 张基线全过期**），以及 `.btn-danger` 改 `color-mix()` tint
> （computed 变 `color(srgb …)` 语法，a11y 助手解析不了 → 报 0.00:1 假失败）。
> **a11y 先挂 → snapshots 步骤压根没执行 → 基线过期被完全掩盖，master CI 长红 5+ 次推送没人察觉。**
> 教训：① 加/改共享原语时同批跑 canonical 基线；② CI 里 **a11y 会挡住 snapshots**，
> 看 CI 别只看最后一行结论，要看哪一步先挂。
>
> **加一个 showcase 怎么加（2026-07-14 起已收敛）：** 只改 `catalogNav.js`（CATALOG_SECTIONS
> + MATRIX_SHOWCASES）+ `showcaseStates.js`（状态 + 矩阵高度）+ `App.svelte`（pages 映射）
> + 新建 `*Showcase.svelte`。**测试侧不用动** —— `tests/visual/design-catalog.helpers.ts`
> 从 catalog 自身注册表派生列表与默认状态。

---

## 已完成：D-P0 – DSGN.CATALOG.6

| 阶段                     | 日期       | 摘要                                                                        |
| ------------------------ | ---------- | --------------------------------------------------------------------------- |
| **D-P0** Catalog         | 2026-07-08 | `apps/design-catalog` 端口 5190；showcases + smoke                          |
| **D-P1** Tokens          | 2026-07-08 | `packages/design-tokens`；4 生产品牌                                        |
| **D-P2** 品牌双轨清理    | 2026-07-08 | 四生产站 `data-app`；`:root` 品牌改 generated；`tokens.css` generated       |
| **D-P3** 组件 token 化   | 2026-07-08 | Card / Settings / Toast / Nav / Banner / Button / Segment / Toggle          |
| **D-P3c** Primitives     | 2026-07-08 | `.btn-*` / `.seg` / `.settings-toggle` → component tokens                   |
| **D-P4** Matrix + states | 2026-07-08 | 4×2 grid；`showcaseStates`；CommandPalette showcase                         |
| **D-P5** Pixel baseline  | 2026-07-08 | 80 desktop snapshots；smoke/snapshot 分离                                   |
| **DSGN.CATALOG.6** a11y gates      | 2026-07-08 | contrast / focus / touch / reduced-motion；`test:design-catalog:a11y` 47/47 |

### 验收（2026-07-08）

| 检查                                    | 结果       |
| --------------------------------------- | ---------- |
| `npm run validate:tokens`               | ✅         |
| `npm run test:design-catalog`           | ✅ 172/172 |
| `npm run test:design-catalog:a11y`      | ✅ 47/47   |
| `npm run test:design-catalog:snapshots` | ✅ 80/80   |
| GHA design-catalog job                  | ✅         |

### P3 组件覆盖（终态）

| 域                        | platform-web | tokens                | catalog | smoke |
| ------------------------- | ------------ | --------------------- | ------- | ----- |
| Card                      | ✅           | ✅ `card.*`           | ✅      | ✅    |
| Settings                  | ✅           | ✅ `control.*`        | ✅      | ✅    |
| Toast / Banner            | ✅           | ✅ `feedback.*`       | ✅      | ✅    |
| Navigation                | ✅           | ✅ `navigation.*`     | ✅      | ✅    |
| CommandPalette            | ✅           | ✅ `commandPalette.*` | ✅      | ✅    |
| PortraitGate              | ✅           | ✅ `portraitGate.*`   | ✅      | ✅    |
| Button / Segment / Toggle | theme        | ✅                    | ✅      | ✅    |

**刻意不做：** production 页面迁移；业务 card（TaskCard 等）；Storybook。

Commit 锚点 → [`SHIPPED.md`](./SHIPPED.md) §Design

---

## 前瞻：DSGN.CATALOG.7+

| 阶段     | 内容                           | 触发 / 范围                                                                     |
| -------- | ------------------------------ | ------------------------------------------------------------------------------- |
| **DSGN.CATALOG.7** | production 共享 primitive a11y | `platform-web` 组件在 **生产四站** 的 contrast/focus 抽检；**不做**全页面 audit |
| **D-P8** | Storybook / Chromatic          | 团队协作压力（现阶段否决）                                                      |

**说明：** **DSGN.CATALOG.6**（design-catalog a11y gates）已于 2026-07-08 发货 ✅。hub 不再将 DSGN.CATALOG.6 列入 §Next。

**已砍掉：** ~~DSGN.CATALOG.7 Figma variables mirror~~ — 项目无 Figma。
