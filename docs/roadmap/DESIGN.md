# Design System 主线（D-\*）

Hub 状态见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)。

**战略：** token-first / code-first / visual-test-first。`design-tokens` 为真源 → generated CSS → apps + design-catalog preview。

---

## 已完成：D-P0 – D-P6

| 阶段                     | 日期       | 摘要                                                                  |
| ------------------------ | ---------- | --------------------------------------------------------------------- |
| **D-P0** Catalog         | 2026-07-08 | `apps/design-catalog` 端口 5190；showcases + smoke                    |
| **D-P1** Tokens          | 2026-07-08 | `packages/design-tokens`；4 生产品牌                                  |
| **D-P2** 品牌双轨清理    | 2026-07-08 | 四生产站 `data-app`；`:root` 品牌改 generated；`tokens.css` generated |
| **D-P3** 组件 token 化   | 2026-07-08 | Card / Settings / Toast / Nav / Banner / Button / Segment / Toggle    |
| **D-P3c** Primitives     | 2026-07-08 | `.btn-*` / `.seg` / `.settings-toggle` → component tokens             |
| **D-P4** Matrix + states | 2026-07-08 | 4×2 grid；`showcaseStates`；CommandPalette showcase                   |
| **D-P5** Pixel baseline  | 2026-07-08 | 80 desktop snapshots；smoke/snapshot 分离                             |
| **D-P6** a11y gates      | 2026-07-08 | contrast / focus / touch / reduced-motion Playwright gates            |

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

## 前瞻：D-P6+

| 阶段     | 内容                  | 触发 / 范围                                                                              |
| -------- | --------------------- | ---------------------------------------------------------------------------------------- |
| **D-P6** | a11y gates            | **窄范围**：`platform-web` + design-catalog 自动化；**不做**六 app production 全量 audit |
| **D-P8** | Storybook / Chromatic | 团队协作压力（现阶段否决）                                                               |

**已砍掉：** ~~D-P7 Figma variables mirror~~ — 项目无 Figma。

**排期：** D-P6 在 hub **Week 3+**（Core 闭环 + CI 补齐之后）。
