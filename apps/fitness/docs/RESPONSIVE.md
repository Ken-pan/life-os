# Life OS 响应式规范（Planner / FinanceOS / FitnessOS）

三端应用共用 canonical `../life-os-theme`（`@import '@life-os/theme/design-system.css'`）。本文档为 **走查结论 + 统一方案**，供三项目对齐实施。

---

## 1. 走查摘要

### 1.1 断点体系（改前 → 改后）

| 层级 | 宽度 | 改前问题 | 统一方案 |
|------|------|----------|----------|
| **Narrow** | ≤380px | 三端均有，仅微调 gutter | 保留，极窄屏 label 缩小 |
| **Phone** | ≤640px | 称 `--life-os-compact`，语义不清 | 新增 `--life-os-phone` 别名；compact 仍可用 |
| **Tablet** | 641–860px | **缺失** — iPad 竖屏与 phone 同待遇 | 新增 `--life-os-tablet`：加宽 gutter、More Sheet 居中留白 |
| **Mobile chrome** | ≤860px | 侧栏隐藏、底栏出现 | 保留 `--life-os-mobile` |
| **Desktop** | ≥861px | 持久侧栏 208px | 保留 `--life-os-desktop` |

> iPad 横屏 1024px 已进入 Desktop；竖屏 768px 走 Mobile chrome + Tablet 增强。

### 1.2 导航模式对比（改前）

| 应用 | Desktop | Mobile / Tablet (≤860px) | 问题 |
|------|---------|---------------------------|------|
| **Planner** | 分组侧栏（任务 / 浏览 / 清单 / 设置） | 5 等宽 Tab，无 Search / Completed / Lists | 信息架构断层；5 Tab 在 375px 拥挤 |
| **FinanceOS** | 分组侧栏（4 组 + 设置） | **4 Primary + More Sheet** | ✅ 标杆实现 |
| **FitnessOS** | 侧栏 3 项 + 设置 | 4 Tab 底栏 | 项数少，可保持；缺 More 模式文档 |

### 1.3 其他不一致项

| 维度 | Planner | FinanceOS | FitnessOS |
|------|---------|-----------|-----------|
| 底栏 class | `.nav.bottom-nav` | `.mobile-tabbar` | `.nav` |
| 高度 token | `--nav-h: 62` | `--mobile-tabbar-h: 66` | `--nav-h: 62` |
| Active 态 | 仅变色 | 圆角 pill 背景 | 顶部 accent 线 |
| 底栏 z-index | 30 | 35 | 100 |
| More Sheet | ❌ | ✅ | ❌ |
| nav 配置 | 组件内硬编码 | `useNavConfig()` | `nav.js` |
| AppBar 搜索 | mobile 有 | N/A | N/A |

---

## 2. 统一布局模型

```
┌─────────────────────────────────────────────────────────────┐
│  Desktop (≥861px)                                           │
│  ┌──────────┬────────────────────────────────────────────┐  │
│  │ Sidebar  │  AppBar (标题区，隐藏品牌)                    │  │
│  │ 208px    │  ─────────────────────────────────────────  │  │
│  │ 全 IA    │  Main content (max 820px 居中)              │  │
│  │          │  FAB (右下)                                  │  │
│  └──────────┴────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Phone / Tablet (≤860px)                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ AppBar (品牌 + 标题 + 工具)                              │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ Main content                                           │ │
│  │ FAB (底栏上方)                                          │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ TabBar: [P1][P2][P3][P4][More]                         │ │
│  └────────────────────────────────────────────────────────┘ │
│  More Sheet ↑ 覆盖 Secondary IA（Browse / Lists / Settings）│
└─────────────────────────────────────────────────────────────┘
```

### 2.1 三端 Primary Tab 定义

| 应用 | Primary (底栏 4 格) | More Sheet |
|------|---------------------|------------|
| **Planner** | 今天 · 收件箱 · 即将 · 日历 | 搜索 · 已完成 · 用户清单 · 设置 |
| **FinanceOS** | 今天 · 总览 · 流水 · 预测 | 股票 · 复盘 · 决策 · 设置 |
| **FitnessOS** | 今天 · 计划 · 发现 · 设置 | （可选）子路由进 More；当前 4 格已够 |

规则：**底栏最多 4 个 Primary + 1 个 More**；Secondary 路由必须能在 More 或 AppBar 触达。

### 2.2 AppBar 行为

| 场景 | Phone (≤640) | Tablet (641–860) | Desktop (≥861) |
|------|--------------|------------------|------------------|
| 根页面 | 品牌 + 标题 + 搜索(Planner) | 同左 + **显示副标题** | 仅标题 + 工具；隐藏品牌 |
| 子页面 | 返回 + 标题（单行 ellipsis） | 同左 | 返回 + 标题 |
| 横屏 mobile | 标题 `--text-2xl`；safe-area 加大 | — | — |

---

## 3. Design Tokens（共享）

在 `layout.css` 的 `:root` 中：

```css
--tabbar-h: 62px;
--tabbar-total-h: calc(var(--tabbar-h) + max(8px, var(--safe-bottom-effective)));
--page-gutter-tablet: 20px;   /* 各 app 可映射 --space-5 */
```

各 app 别名（过渡期允许）：

```css
--nav-h: var(--tabbar-h);
--mobile-tabbar-h: var(--tabbar-h);
--mobile-tabbar-total-h: var(--tabbar-total-h);
```

### Gutter 阶梯

| 断点 | `--page-gutter` |
|------|-----------------|
| Phone | 16px (`--space-4`) |
| Tablet | 20px (`--space-5`) |
| Desktop | 32px (`--space-8`) |
| Narrow | 14px (`--space-3-5`) |

### Z-index 栈（建议）

| Token | 值 | 用途 |
|-------|-----|------|
| `--z-nav` | 30 | 底栏 |
| `--z-fab` | 40 | FAB |
| `--z-more-sheet` | 45 | More 背板 + Sheet |
| `--z-sheet` | 100 | 任务/表单 Sheet |
| `--z-toast` | 120 | Toast |

---

## 4. 底栏视觉规范（统一后）

- **布局**：`flex` + `flex: 1 1 0`，非 `grid repeat(5)`，避免英文 label 溢出
- **触控**：`min-height: var(--tabbar-h)`，`min-width: 0`，label `ellipsis`
- **Active**：`color: accent` + `background: accent 12% + card`（Finance 风格）
- **More 打开**：底栏 `.is-backgrounded { opacity: .35; pointer-events: none }`
- **标签**：`--text-mobile-tab` + `--mono` + uppercase（与 TYPOGRAPHY.md 一致）
- **Safe area**：padding 含 `env(safe-area-inset-*)`

### More Sheet

- 贴底 sheet，圆角 20px，max-height `min(72dvh, 560px)`
- 分组标题 + 行列表；当前路由 `active` + 左侧 accent 条 + ✓
- Tablet：左右 gutter inset，非全宽贴边
- 路由变化自动关闭 Sheet

---

## 5. 各 App 实施状态

| 项目 | layout.css | Primary+More | nav 模块 | More Sheet CSS |
|------|------------|--------------|----------|----------------|
| **Planner** | ✅ | ✅ 4+More | `src/lib/nav.js` | ✅ |
| **FinanceOS** | ✅ | ✅ 4+More | `useNavConfig()` | ✅ |
| **FitnessOS** | ✅ | ✅ 4 Tab | ✅ `nav.js` | N/A（4 项已够） |

### 5.1 维护清单

1. 修改断点 / tabbar token 时，同步 canonical `../life-os-theme/src/layout.css` 与 `layout.js`
2. 底栏视觉以 **flex + pill active + safe-area padding** 为准（Planner / Fitness `.nav`，Finance `.mobile-tabbar`）
3. 导航 IA：底栏 ≤4 Primary + More；Secondary 进 More Sheet 或侧栏

---

## 6. 内容区 Responsive

| 组件 | Phone | Tablet | Desktop |
|------|-------|--------|---------|
| `.wrap` | `--content-inline-pad` | 同左，gutter 更大 | 同左，gutter 32px |
| `.page-title` | `--text-3xl` | `--text-3xl` | `--text-4xl` |
| 卡片 padding | `--card-padding-mobile` | `--card-padding-compact` | `--card-padding` |
| Settings 行 | 纵向 stack | 可保持 stack | 横向 |
| FAB | 底栏上方 `--tabbar-total-h + offset` | 同左 | 右下角固定 |

---

## 7. 测试矩阵

| 设备 / 视口 | 预期 |
|-------------|------|
| iPhone SE 375×667 | 4+More；label 不截断严重；FAB 不挡 Tab |
| iPhone 15 Pro Max 430 | 同左 |
| iPad Mini 768×1024 portrait | Tablet gutter；More sheet 有 inset；副标题可见 |
| iPad 1024×768 landscape | Desktop 侧栏；无底栏 |
| Desktop 1280+ | 侧栏 + 820px 内容列 |

Playwright viewports 建议：`375`, `768`, `1024`, `1280`。

---

## 8. Planner 本次变更文件

- `../life-os-theme/src/layout.css` — tablet 断点 + tabbar tokens
- `src/lib/nav.js` — 统一 IA 配置
- `src/lib/components/BottomNav.svelte` — 4 Primary + More
- `src/lib/components/MobileMoreSheet.svelte` — More Sheet
- `src/lib/components/ListSidebar.svelte` — 复用 nav.js
- `src/app.css` — tabbar / more-sheet / tablet 规则
- `src/lib/i18n/messages/*.js` — `common.more`, `nav.groupAccount`, `nav.mainAria`

---

## 9. Custom Media 速查

```css
@media (--life-os-narrow)       { /* ≤380px */ }
@media (--life-os-phone)       { /* ≤640px */ }
@media (--life-os-compact)     { /* ≤640px 别名 */ }
@media (--life-os-tablet)      { /* 641–860px */ }
@media (--life-os-mobile)      { /* ≤860px — chrome 切换 */ }
@media (--life-os-mobile-landscape) { /* ≤860px 横屏 */ }
@media (--life-os-desktop)     { /* ≥861px */ }
```

PostCSS 通过 `postcss-custom-media` 展开；JS 侧用 `LIFE_OS_LAYOUT` from `@life-os/theme`.
