# Life OS Monorepo

**九 app 个人生活平台** —— Planner / Fitness / Finance / Music 四生产站 + Portal 启动器 + Home 实验站 + 本地优先的 AIOS / KnowledgeOS / HealthOS，共享 `@life-os/theme` / `@life-os/sync` / `@life-os/contracts`。`design-catalog` / `starter` 是平台工具；PaperOS 设备 Shell 已迁出独立仓库。

> 文档入口一律走 [docs/README.md](docs/README.md)；状态与优先级只看 [docs/LIFEOS_ROADMAP.md](docs/LIFEOS_ROADMAP.md)。

## 本地开发

```bash
npm install
npm run build:planner   # 亦有 build:fitness / finance / music / portal / home / aios / knowledge / health
npm run build           # turbo 并行构建全部 app
npm run app:aios        # 打包 AIOS 原生 Mac app（Tauri 壳）
npm run app:knowledge   # 打包 KnowledgeOS 原生 Mac app
npm run app:health      # 打包 HealthOS 原生 Mac app
```

在单个 app 目录开发（与原先相同）：

```bash
cd apps/planner && npm run dev
```

## 共享包

在 **`packages/theme`**、**`packages/sync`** 直接修改并 commit。独立 GitHub 仓 `life-os-theme` / `life-os-sync` 已归档；`npm run sync:packages` 仅在你仍保留本地 sibling 副本需要一次性导入时使用。

## Netlify 部署

四站生产环境由 **`Ken-pan/life-os` monorepo** 驱动（Deploy Key + 各 app 的 `netlify.toml`）。文档入口见 [docs/README.md](docs/README.md)，部署见 [docs/ops/netlify.md](docs/ops/netlify.md)，仓库准绳见 [docs/ops/canonical.md](docs/ops/canonical.md)。

Push 到 `master` 后 Netlify 自动构建；PR 触发 GitHub Actions `ci.yml`。

### 环境变量

- 各 Site：`PUBLIC_SUPABASE_URL`、`PUBLIC_SUPABASE_ANON_KEY`
- Planner AI：`KIMI_API_KEY`（Functions，勿暴露到客户端）

## 与独立仓库的关系

历史上各 app 为独立 Git 仓库；**生产 Netlify Site 已指向本 monorepo**。独立仓库已归档，仅作历史参考；开发、构建、部署都在本仓库进行。

## 共享平台与架构

架构不变量（严格边界 · 统一身份 · 事件驱动 · 受控互通）、contracts 白名单与提取决策见 [docs/architecture/](docs/architecture/README.md) 与 [docs/LIFEOS_ROADMAP.md](docs/LIFEOS_ROADMAP.md#架构不变量present)。共享包 README 位于 `packages/{contracts,sync,theme,platform-web,design-tokens}/`。
