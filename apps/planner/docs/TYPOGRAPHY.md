# PLANNER.OS 字体规范

与 **FinanceOS**（`Moneymoneymoney/src/index.css`）共用同一套字号 token 与字体栈。所有字号必须通过 CSS 变量引用，禁止硬编码 `px`。

## 字体栈

| Token | 用途 |
|-------|------|
| `--font` | 正文、按钮、导航、任务列表（Geist + 系统中文字体） |
| `--font-brand` | 品牌字标（PLANNER.OS）、AppBar 品牌区（Noto Sans） |
| `--mono` | 标签、Meta、Toast、分组标题、计数（Geist Mono） |

别名：`--body` → `--font`，`--disp` → `--font-brand`（兼容旧代码）。

## 字号尺度

| Token | 尺寸 | 典型用途 |
|-------|------|----------|
| `--text-3xs` | 9px | 极小标注（Finance 图表轴、密集 badge） |
| `--text-2xs` | 10px | 次要脚注 |
| `--text-mobile-tab` | 10.5px | **移动端 BottomNav 标签** |
| `--text-xs` | 11px | **表单 label**、chip、分组标题、sec-count |
| `--text-sm` | 12px | 辅助说明、Insight 正文、Toast、次要按钮文案 |
| `--text-md` | 13px | 页面副标题、ghost 按钮、设置块描述 |
| `--text-base` | 14px | **全局正文默认**、任务标题、主按钮、侧栏链接 |
| `--text-lg` | 15px | 品牌字标、**移动端正文放大**（≤640px） |
| `--text-xl` | 16px | **Sheet / Drawer 标题** |
| `--text-title` | 17px | 强调单行标题、与旧 Fitness 正文对齐的特例 |
| `--text-2xl` | 18px | 横屏页眉缩小标题 |
| `--text-3xl` | 20px | **移动端页面主标题**（`.page-title`） |
| `--text-4xl` | 22px | **桌面端页面主标题**（≥861px） |
| `--text-5xl` | 24px | 区块 KPI |
| `--text-display-sm` | 28px | 小型展示数字 |
| `--text-display` | 32px | 展示数字 |
| `--text-display-md` | 34px | Hero 指标 |
| `--text-display-xl` | 36px | 大 Hero |
| `--text-display-lg` | 44px | 全屏 Hero |

## 语义类（app.css）

| 类名 | 字号 | 说明 |
|------|------|------|
| `.page-title` | `--text-3xl` / 桌面 `--text-4xl` | 页面 H1 |
| `.page-sub` | `--text-md` | AppBar 副标题 |
| `.wrap` | `--content-inline-pad` 居中列 | 主内容区（820px max） |
| `.sec-title` | `--text-xs` + mono | 任务分组 uppercase |
| `.task-title` | `--text-base` | 任务主文案 |
| `.chip` | `--text-xs` + mono | 日期/标签 pill |
| `.sheet-title` | `--text-xl` | 任务编辑器 Sheet |
| `.banner` | `--text-md` | 警告条（内联） |
| `.banner.critical` | `--text-md` | 同步错误 / 严重告警 |
| `.toast` | `--text-sm` + mono | 操作反馈浮层 |
| `.insight-title` | `--text-base` | Insight 卡片标题 |
| `.insight-body` | `--text-sm` | Insight 卡片正文 |
| `.nav-lbl` | `--text-mobile-tab` + mono | 底栏标签 |
| `.sidebar .brand-name` | `--text-lg` + `--font-brand` | 侧栏品牌 |
| `.sidebar .nav-item` | `--text-base` | 侧栏导航项 |
| `.nav-group-label` | `--text-xs` | 侧栏分组标题 |
| `.btn-primary` | `--text-base` | 主按钮 |
| `.btn-secondary` / `.btn-ghost` | `--text-md` | 次要 / 幽灵按钮 |

## 工具类

```html
<span class="text-xs">…</span>
<span class="text-sm">…</span>
<span class="text-md">…</span>
<span class="text-base">…</span>
```

## 响应式

Life OS 三端共用 **`Projects/life-os-theme`**（`@life-os/theme`，各 app 通过 `file:../life-os-theme` 引用），`layout.css` 由 PostCSS `postcss-custom-media` 展开 `@media (--life-os-*)`。

| Custom media | 等价 | 说明 |
|--------------|------|------|
| `--life-os-narrow` | ≤380px | 极窄屏 |
| `--life-os-compact` | ≤640px | 紧凑屏（正文字号、卡片 padding） |
| `--life-os-compact-up` | ≥640px | 紧凑屏以上 |
| `--life-os-phone` | ≤640px | 同 compact（phone tier 别名） |
| `--life-os-tablet` | 641–860px | 平板 gutter 加宽（侧栏仍隐藏） |
| `--life-os-mobile` | ≤860px | 移动布局（侧栏→底栏） |
| `--life-os-mobile-landscape` | ≤860px landscape | 横屏 AppBar |
| `--life-os-desktop` | ≥861px | 桌面布局 |

| Token | 值 | 说明 |
|-------|-----|------|
| `--content-max` | 820px / 1320px | text-heavy / data-heavy |
| `--page-gutter` | 16px → 32px | mobile-first，desktop 规则在 layout.css |
| `--content-inline-pad` | calc | 居中列 |

JS 常量：`LIFE_OS_LAYOUT`（`@life-os/theme`）。

- **默认**：`body { font-size: var(--text-base); line-height: 1.55; }`
- **`--life-os-compact`**：`body { font-size: var(--text-lg); }`
- **`--life-os-desktop`**：`.page-title` 升为 `--text-4xl`

## 新增组件 checklist

1. 优先复用 `app.css` 语义类，不要新建 ad-hoc 字号
2. 标签 / Meta → `--text-xs` 或 `--text-sm` + `--mono`
3. 正文 / 列表项 → `--text-base`
4. 页面级标题 → `.page-title` 或 `--text-3xl` / `--text-4xl`
5. 浮层标题 → `--text-xl`（Sheet）或 `--text-3xl`（全屏 Modal）
6. 大数字 / Hero → `--text-display-*` 系列

## 通知 / 反馈（与 FinanceOS 对齐）

| 组件 | 类名 | 用途 | 位置 |
|------|------|------|------|
| **Toast** | `.toast` / `.toast--error` / `.toast--warn` | 保存、同步成功 / 失败 / 警告 | 底栏上方居中（移动 + 桌面） |
| **Critical Banner** | `.banner.critical.banner--row` | 云同步失败等需关注错误 | 默认内联；加 `.banner--fixed` 固定顶栏 |
| **Warning Banner** | `.banner` | 数据过期、权限提示等 | 页面内容流内联 |

语义色 token：`--positive*` / `--warning*` / `--critical*` / `--info*`。禁止在组件内硬编码告警色。

层级：`--z-sheet`（100）< `--z-banner`（110）< `--z-toast`（120）。全局错误条在 Sheet 之上；Toast 在最顶层。

## 同步来源

维护时以 FinanceOS `src/index.css` 中 `:root` 字号块为准；变更后同步更新本文件与 `src/app.css`。
