# UI/UX 审核截图（uiux-review）

一个版本做完后，把该 app 的 6~8 个核心页面各截一屏，加标题标注，**合成为单张 PNG**，
用于 UI/UX 走查（一眼扫全局一致性：留白、层级、空态、导航激活态、深浅色）。

不引入新依赖：逐页视口截图 → 渲染一张 HTML 联系表（标题条 + 网格缩略图）→ 整页截图。

## 用法

```sh
# 默认集合（planner / finance / fitness / music），app 各出一张
npm run qa:uiux-review

# 指定 app
npm run qa:uiux-review -- --app planner
npm run qa:uiux-review -- --app music,home
npm run qa:uiux-review -- --app all         # 全部已登记 app

# 仅本次改动触及的 app（版本收口自动更新，见下）
npm run qa:uiux-review:changed

# 深色 / 移动视口
npm run qa:uiux-review -- --app fitness --theme dark
npm run qa:uiux-review -- --app music --mobile
```

脚本会自起该 app 的 `npm run preview`，跑完自动关掉。

## 产物

```
docs/ui-qa-screenshots/{app}/uiux-review/latest/
  {app}-uiux-review-{theme}-{desktop|mobile}.png   ← 合成审核图（唯一交付物）
  manifest.json                                    ← app / 主题 / git sha+subject / 每屏是否成功 / seed 状态
```

目录整体 gitignore（`docs/ui-qa-screenshots`），属临时证据，不入库。标题条自带
git 短 SHA + 提交标题 + 时间戳，所以每张图自证「是哪个版本」。

## 加/改核心页面

只改 [`uiux-review.config.mjs`](./uiux-review.config.mjs)：每个 app 一份 `pages`
清单（`{ path, title }`，可选 `settle` / `waitSelector`）。端口、`waitSelector`、
workspace、品牌名、主色都从既有 app 注册表（`scripts/pwa/apps.config.mjs` →
`appRegistry`、site meta、wordmark accent）派生，不重复维护。

需要预置数据的 app（`seedKind`）：

- `finance` → `demo`：置 `localStorage.fos_demo=1`，触发 FinanceOS **本地演示模式**——
  跳过登录/Supabase，直接注入一整套模拟财务数据（账户/持仓/收支/目标/方案/流水）。
  只在 localhost 生效，生产域名永不激活。详见 `apps/finance/src/lib/demoMode.ts` /
  `demoData.ts`。手动开：本地访问 `?demo=1`（`?demo=0` 关）。
- `music` → `indexeddb`：写入一小批曲目种子。
- 其余：默认渲染（多为空态，正是审核要看的）。

## 视觉设计（为「AI 识别 + 人工评审」优化）

合成图的排版是刻意为视觉模型评审调过的。**真正的硬约束是 AI 视觉的 ~1.15 MP 面积上限**
（图会被重采样到约 110 万像素总量，无论文件多大）。于是格数固定时，单格「内容像素」近似守恒——
列数、文件分辨率都改变不了它。唯一能撬动的是**内容密度**：让每格里 UI 占比更高、空白更少。

密度优化（本工具的关键动作）：

- **尾部空白裁切**：抓完在主滚动区内量「真实内容高度」（排除全高侧栏/底栏），把内容下方的
  大片空白裁掉——空态/短页面不再浪费半格。测不到就回退整屏（安全）。见 `contentClip()`。
- **JS 贪心 masonry**：按每张截图真实尺寸（读 PNG 头）把卡片依序分到最矮的列，两列高度真正均衡、
  无空档。**不用 CSS `column-fill:balance`**——它配 `break-inside:avoid` 会严重失衡（一列见底、
  另一列超长）。见 `distributeColumns()`。

清晰度与可引用性：

- **2× 采集**：截图按 devicePixelRatio=2 抓，文字/描边更锐，重采样后仍立得住。
- **桌面 2 列宽面板**：契合宽屏 UI 的长宽比，人看清晰、AI 相邻干扰小。
- **标注在画布层**：截图上方一行纯文本「序号 · 标题 · 路由」，截图只包一条细边框（无圆角/阴影/
  假窗框）。标注明显是标注，审核者/AI 不会误当成 app 界面的一部分。
- **中性画布 + 克制品牌色**：让 app UI 当主角；品牌色只用于序号和顶部细线。
- **两位序号**：masonry 后阅读顺序是列内自上而下，序号保证「第 3 屏 /calendar」式精确引用。
- **所见即所截**：渲染视口宽度 = 联系表宽度，避免多余下采样吃掉排版。

改这些常量看 `sheetLayout()` / `buildContactSheetHtml()` / `contentClip()` / `distributeColumns()`。

## 端口鲁棒性

首选端口被其他会话的 dev server 占用时（并发共享工作树很常见），`vite preview` 会自动
跳到下一个空闲端口；脚本从 vite stdout 解析**实际**端口再导航，不会打到别人的服务器或
拿到 connection-refused。

## 「每次一个版本做完自动更新」

`--changed` 会 `git diff --name-only HEAD~1 HEAD`（+ 未提交改动）推断触及了哪些
`apps/<id>/`，只重出这些 app 的审核图；改动 `packages/` 视为影响默认集合。

因为一次要起浏览器 + preview，较重，且工作树可能被多会话共享，**默认不装全局
git hook**。想真正做到「提交即更新」，可自行装一个 opt-in 的 post-commit hook：

```sh
cat > .git/hooks/post-commit <<'SH'
#!/bin/sh
# 版本收口后台刷新 UI/UX 审核图（仅本次改动触及的 app）
npm run qa:uiux-review:changed >/dev/null 2>&1 &
SH
chmod +x .git/hooks/post-commit
```

后台运行、失败静默，不阻塞提交。多会话共享工作树时若担心并发起服务，改为手动跑
`npm run qa:uiux-review:changed` 即可。
