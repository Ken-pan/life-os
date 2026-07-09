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

## Shared Platform Planning

P0 shared platform 文档位于 [docs/README.md](docs/README.md#shared-platform-p0)。当前 P0 范围只包含边界、contracts、adapter 签名、package scaffold 和 boundary guard；不迁移 app 组件、不创建 native 工程、不碰 Supabase。
