# Netlify 部署说明

## 当前模式（推荐）：`Ken-pan/life-os` Monorepo + Deploy Key

四站均已指向 **同一 monorepo**，通过 **Deploy Key** 拉取代码（无需 GitHub App 单独授权 `life-os`）：

| Site | Package directory | Build | Publish |
|------|-------------------|-------|---------|
| planneros-ken | `apps/planner` | `npm run build -w planner-os` | `apps/planner/build` |
| kens-fitnessos | `apps/fitness` | `npm run build -w fitness-os` | `apps/fitness/build` |
| kensfinanceos | `apps/finance` | `npm run build -w finance-os` | `apps/finance/dist` |
| musicos-ken | `apps/music` | `npm run build -w music-os` | `apps/music/build` |

**Base directory 留空**（repo 根目录 `npm install`）。

各 app 的 `netlify.toml` 含 **ignore build**：仅当该 app 或 `packages/*` 变更时触发。

Push 到 `life-os` 的 `master` 分支 → Netlify 自动构建对应 Site。

### 本地验证

```bash
cd life-os && npm install && npm run build
```

### 共享包

直接在 `packages/theme`、`packages/sync` 修改；`npm run sync:packages` 仅在有本地 sibling 克隆时做一次性导入。

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
- Planner AI：`KIMI_API_KEY`（Functions；四站中 Planner / Finance 已配置）

## 独立仓库（已归档）

`planner-os`、`fitness-os`、`Moneymoneymoney`、`MusicOS`、`life-os-theme`、`life-os-sync` 已在 GitHub **archive**。生产四站只构建 `Ken-pan/life-os`。

## Music 站 Git 链接

生产 URL：**https://musicos-ken.netlify.app**（Site ID `83dfdf84-095a-4b8a-955d-106d046a314b`）。

若 Build settings 仍指向已 archive 的 `MusicOS` 仓库，在 Netlify UI 将 **Repository** 改为 `Ken-pan/life-os`、分支 `master`、Package directory `apps/music`。Deploy Key 与另外三站相同。

CLI 兜底（已构建 `apps/music/build`）：

```bash
netlify deploy --prod --no-build --site=83dfdf84-095a-4b8a-955d-106d046a314b --dir=apps/music/build
```

## CLI 手动发布

```bash
cd life-os
npm run build
./scripts/deploy-all-netlify.sh   # 或单站 --no-build 上传
```

**⚠️ Monorepo 必须带 `CI=1` + `--filter <workspace>`**：新版 Netlify CLI 在检测到多个
workspace（planner-os / fitness-os / finance-os / music-os / @life-os/*）时会交互式询问
"要操作哪个项目"，脚本或 agent 场景下会**无输出永久挂起**。`deploy-all-netlify.sh` 已内置。

单站示例：

```bash
npm run build:planner
CI=1 npx netlify deploy --prod --no-build --filter planner-os --dir=apps/planner/build --functions=apps/planner/netlify/functions --site=82a6cadc-03f9-443c-85f7-26bd4a90f83f
```

Site ID 见 [Netlify team projects](https://app.netlify.com/teams/jpan28/projects).
