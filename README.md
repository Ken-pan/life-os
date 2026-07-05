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

## Netlify 部署

四站生产环境由 **`Ken-pan/life-os` monorepo** 驱动（Deploy Key + 各 app 的 `netlify.toml`）。详见 [docs/NETLIFY.md](docs/NETLIFY.md) 与 [docs/CANONICAL.md](docs/CANONICAL.md)（以哪个仓库为准、该清理什么）。

Push 到 `master` 后 Netlify 自动构建；PR 触发 GitHub Actions `ci.yml`。

### 环境变量

- 各 Site：`PUBLIC_SUPABASE_URL`、`PUBLIC_SUPABASE_ANON_KEY`
- Planner AI：`KIMI_API_KEY`（Functions，勿暴露到客户端）

## 与独立仓库的关系

历史上各 app 为独立 Git 仓库；**生产 Netlify Site 已指向本 monorepo**。独立仓库仍可用于开发，或通过 `scripts/sync-vendored-packages.sh all-repos` vendoring 共享包。
