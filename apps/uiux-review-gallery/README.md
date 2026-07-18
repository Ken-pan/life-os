# uiux-review-gallery

发布在 Netlify 上的**静态**画廊：列出 LifeOS 各 app 的 UI/UX 审核合成图，可查看大图 / 下载，
带生成时间标注，随每次发布更新。

**线上：** https://kenos-uiux-review.netlify.app （Netlify site `kenos-uiux-review`，
id `cadccd64-e40a-439d-865d-5be5b3741ff3`）。

一键刷新并发布：`npm run qa:uiux-gallery:publish`（仓库根，重生成**全部 4 变体** + prod 部署）。
页面顶部可切换 **主题（浅/深）× 视图（桌面/移动）**，共 8 app × 4 变体 = 32 张。

## 内容怎么来的

`public/index.html` 是纯静态页，运行时 fetch `public/manifest.json` 渲染卡片。
图片和 manifest 由仓库根的审核脚本生成（提交进仓库、tracked）：

```sh
npm run qa:uiux-gallery            # 全部 app（浅色桌面）→ public/shots/*.jpg + public/manifest.json
npm run qa:uiux-gallery:all        # 4 变体：浅/深 × 桌面/移动（32 张，发布用这个）
npm run qa:uiux-gallery:changed    # 只刷新本次改动触及的 app（增量合并 manifest）
```

产物文件名 `{app}-{theme}-{viewport}.jpg`；`manifest.json` 为**嵌套自解释**结构（每 app 一个对象：
`description` + `pages[]` + `variants{theme-viewport → {file}}`），并生成 `llms.txt`（AI 使用指南）。

## AI / 机器可读入口

- `manifest.json` — AI 优先读。含 `imageUrlPattern`、`themes`、`viewports`，及每个 app 的
  `description`（选哪个 app）、`pages[]`（每屏是什么）、`variants`（4 个变体的图片 URL）。
- `llms.txt` — 纯文本指南 + 当前内容清单 + AI 审核工作流（读 manifest → 选 app/变体 → GET JPEG → 逐屏分析）。
- 图片直链规则 `shots/{app}-{theme}-{viewport}.jpg`，稳定可预测。
- 页脚有可见的 manifest.json / llms.txt 链接；`<head>` 有 `rel=alternate` 指向二者。

产物：

- `public/shots/{app}-{theme}-{viewport}.jpg` — 压缩 JPEG（q90），复用审核合成图。
- `public/manifest.json` — 每个 app 的 `{ name, file, generatedAt, screens, git, ... }` + 顶层 `generatedAt`。

## 发布 / 自动更新

行业惯例（如 Chromatic/Percy）是**在 CI 里重生成截图并发布**。本站用 GitHub Actions：
- `.github/workflows/uiux-gallery.yml` —— 触发：push 到 master 且触及 `apps/**`、`packages/**`、
  `scripts/qa/uiux-review*` 时 · **每晚定时** · 手动 `workflow_dispatch`。用官方 Playwright 镜像
  跑 `npm run build` + `npm run qa:uiux-gallery:all`，再 `netlify deploy --prod`。
  **需要仓库 Secret `NETLIFY_AUTH_TOKEN`**（Netlify → User settings → Applications → Personal access token）；
  没配则只生成不发布（workflow 里有 warning 兜底）。CI 直接部署新图，不提交，避免图片churn。
- 手动一键：`npm run qa:uiux-gallery:publish`（仓库根，重生成 4 变体 + prod 部署）。
- 也已加进 `scripts/deploy-all-netlify.sh`（发版随其它站一起 CLI 部署已提交内容）。

## Design Governance Dashboard（行业成熟度惯例：单一健康信号 + 轨迹 + 可路由整改）

顶部**组合视图（cockpit）**（`manifest.json` 的 `portfolio` / `findings`）：

- **组合健康分 + 等级**（A–F）——四维加权（无障碍 .35 · Token 卫生 .30 · 共享采用 .20 · 覆盖 .15），
  每 app 也有独立健康分徽章。见 `uiux-metrics.mjs` 的 `computeHealth`。
- **预算/门禁**（对齐目标）：无障碍 100% 通过 · 捕获覆盖全截到 · 样式债务不新增 → pass/fail chip。
- **最需关注**：健康分最低的 3 个 app。
- **整改路由（systemic vs local）**：跨全部 app 分析样式债务基线 → 系统性规则（多 app）建议动 **Token**，
  局部规则建议 **shared/local**。直接回答「改 Token / 共享组件 / 局部页面」。见 `systemicFindings`。
- **趋势**：每代生成写一份快照到 `history.json`（按 git.sha 去重），卡片上 `▲/▼` 显示健康分/债务/a11y 相对上一代的变化
  （回归=红）。首次无基线时诚实显示「无基线」。
- **排序**：默认 / 健康分 / 样式债务 / 无障碍 —— 让最差的浮到前面。

### 每 app 卡片的治理指标（全真实数据）

每张卡片除截图外展示 5 类可回答治理问题的指标（`manifest.json` 的 `apps[].metrics` / `variants[].capture`）：

- **捕获覆盖** — 桌面/移动各 ok/total（哪些页面没截到）。来源：审核管线。
- **无障碍** — pass/checked（图无 alt / 控件无可访问名 / 输入无标注），带失败明细。来源：截图时页内审计（浅色桌面跑一次）。
- **共享 UI 采用** — `@life-os/*` 共享 UI import 占「共享+本地组件 import」比例（import 占比代理）。来源：`uiux-metrics.mjs` 静态分析。
- **样式债务** — 棘轮基线 `lifeos-styles-baseline.json` 求和 + `byRule` 拆分 + **整改方向**（raw-* → Design Token；reserved-ds-class → 命名冲突）。
- **代码变更影响** — 自上一代生成 sha 到 HEAD，本 app `src` 变更文件数 + 影响区域（路由/组件）。顶层 `sharedImpact` 标共享包变更（影响多 app）。来源：git diff（CI 需 `fetch-depth: 0`）。

指标只在有真实数据时显示，缺失就不显示——**绝不臆造数字**。计算见 `scripts/qa/uiux-metrics.mjs` 与 `uiux-review.mjs`。

## AI / 机器可读入口（面向 agent 优化）

- **manifest.json** — AI 优先读。嵌套自解释：`schemaVersion`、`imageUrlPattern`、`themes`、`viewports`，
  及每个 app 的 `description`（选哪个 app）、`pages[]`（每屏是什么）、`variants`（4 变体图片 URL + 每变体 screens）。
- **llms.txt** — 遵循 llmstxt.org 规范（H1 + blockquote 摘要 + `## 小节`带 markdown 链接）+ AI 审核工作流 + 内容清单。
- **robots.txt** — 显式欢迎 GPTBot/ClaudeBot/PerplexityBot 等，指向 sitemap。
- **sitemap.xml** — 页面 + 全部截图 URL。
- **`_headers`**（+ netlify.toml）— 全站 `Access-Control-Allow-Origin: *`（浏览器内 agent 可跨源 fetch）；
  HTTP `Link` 头广播 manifest/llms/sitemap（agent 不解析 HTML 也能发现）；正确 Content-Type。
- **index.html** — 语义 `figure`/`figcaption`/`h2`（走无障碍树的 Computer-Use/Operator 类 agent 可读）、
  富 `alt`（含页面清单）、JSON-LD `Dataset`、页脚可见入口链接。

生成器与视觉设计说明见 [`scripts/qa/README.uiux-review.md`](../../scripts/qa/README.uiux-review.md)。
