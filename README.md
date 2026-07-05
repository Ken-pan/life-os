# Life OS Monorepo

Planner、Fitness、Finance、Music 四端 + 共享 `@life-os/theme` / `@life-os/sync`。

## 本地开发

```bash
npm install
npm run build:planner   # 或 build:fitness / build:finance / build:music
npm run build           # turbo 并行构建全部 app
```

在单个 app 目录开发（与原先相同）：

```bash
cd apps/planner && npm run dev
```

## 同步 canonical 包

若仍单独维护 `../life-os-theme` 与 `../life-os-sync` 仓库，运行：

```bash
npm run sync:packages
```

## Netlify 部署（推荐）

**一个 Git 仓库 → 四个 Netlify Site**。每个 Site：

| 设置 | 值 |
|------|-----|
| Base directory | *留空*（repo 根） |
| Package directory | `apps/planner` / `apps/fitness` / `apps/finance` / `apps/music` |
| Build command | 见各 app 的 `netlify.toml`（如 `npm run build -w planner-os`） |
| Publish directory | 见 `netlify.toml`（如 `apps/planner/build`） |

各 app 的 `netlify.toml` 已含 **ignore build**：仅当该 app 或 `packages/*` 变更时才触发构建。

### 环境变量

- 各 Site：`PUBLIC_SUPABASE_URL`、`PUBLIC_SUPABASE_ANON_KEY`
- Planner AI：`KIMI_API_KEY`（Functions，勿暴露到客户端）

## 与独立仓库的关系

历史上各 app 为独立 Git 仓库；本 monorepo 为 **Netlify 与跨端协作的推荐部署源**。独立仓库仍可通过 `scripts/sync-vendored-packages.sh all-repos`  vendoring 共享包以单独部署。
