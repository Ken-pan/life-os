# Netlify 部署说明

## 当前模式（推荐）：`Ken-pan/life-os` Monorepo + Deploy Key

四站均已指向 **同一 monorepo**，通过 **Deploy Key** 拉取代码（无需 GitHub App 单独授权 `life-os`）：

| Site | Package directory | Build | Publish |
|------|-------------------|-------|---------|
| planneros-ken | `apps/planner` | `npm run build -w planner-os` | `apps/planner/build` |
| kens-fitnessos | `apps/fitness` | `npm run build -w fitness-os` | `apps/fitness/build` |
| kensfinanceos | `apps/finance` | `npm run build -w finance-os` | `apps/finance/dist` |
| kens-musicos | `apps/music` | `npm run build -w music-os` | `apps/music/build` |

**Base directory 留空**（repo 根目录 `npm install`）。

各 app 的 `netlify.toml` 含 **ignore build**：仅当该 app 或 `packages/*` 变更时触发。

Push 到 `life-os` 的 `master` 分支 → Netlify 自动构建对应 Site。

### 本地验证

```bash
cd life-os && npm install && npm run build
```

### 同步 canonical 包（若仍单独维护 theme/sync 仓库）

```bash
npm run sync:packages
git add packages && git commit -m "sync shared packages"
```

## GitHub Actions

| Workflow | 作用 |
|----------|------|
| `.github/workflows/ci.yml` | PR / push 全量 `npm run build` |
| `.github/workflows/deploy-netlify.yml` | **手动** CLI 上传兜底（需 `NETLIFY_AUTH_TOKEN` secret） |

主路径是 Netlify Git 构建；GHA 部署仅在需要时使用。

## 环境变量（四站）

已在 Netlify 配置：

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- Planner AI：`KIMI_API_KEY`（仅 Functions，在 Netlify UI 设置）

## 独立仓库（legacy）

`planner-os`、`fitness-os` 等仍可单独部署（vendored `packages/life-os-*`）。**生产 Site 已切到 monorepo**；独立仓库 push 不再触发 Netlify，除非改回 Site 仓库设置。

## CLI 手动发布

```bash
cd life-os
npm run build:planner
npx netlify deploy --prod --dir=apps/planner/build --functions=apps/planner/netlify/functions --site=82a6cadc-03f9-443c-85f7-26bd4a90f83f
```

Site ID 见 [Netlify team projects](https://app.netlify.com/teams/jpan28/projects).
