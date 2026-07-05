# Netlify 部署说明

## 当前模式（独立仓库 + CLI / 手动 Git 重连）

各 app 的 Netlify Site 已配置为独立 GitHub 仓库（`planner-os`、`fitness-os` 等），**vendored** `packages/life-os-*` 后可在 Netlify 上 `npm install && npm run build`。

若 Git 连续部署因 API 改仓库设置而断开，在 Netlify UI 中：

**Project configuration → Build & deploy → Continuous deployment → Link repository**

重新选择对应 GitHub 仓库即可。

## Monorepo 模式（`Ken-pan/life-os`）

迁移前必须：

1. GitHub → **Settings → Applications → Netlify** → Configure → 勾选 **`Ken-pan/life-os`**
2. 各 Site：**Base directory 留空**，**Package directory** 设为 `apps/planner` 等
3. Build / Publish 见各 app 内 `netlify.toml`

本地验证：

```bash
cd life-os && npm install && npm run build:planner
```

## 环境变量（四站共用 Supabase）

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- Planner AI：`KIMI_API_KEY`（仅 Functions）

已通过 CLI 写入各 Site（production context）。

## CLI 手动发布（Git CD 恢复前可用）

```bash
cd Planner && npm run build && npx netlify deploy --prod --dir=build --site=82a6cadc-03f9-443c-85f7-26bd4a90f83f
```

Site ID 见 [Netlify app](https://app.netlify.com/teams/jpan28/projects).
