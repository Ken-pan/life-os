# Netlify 部署说明

**最后与代码同步：** 2026-07-08

## 当前模式（推荐）：`Ken-pan/life-os` Monorepo + Deploy Key

**生产五站**均已指向 **同一 monorepo**，通过 **Deploy Key** 拉取代码（无需 GitHub App 单独授权 `life-os`）：

| Site          | Package directory | Build                         | Publish              | Production URL              |
| ------------- | ----------------- | ----------------------------- | -------------------- | --------------------------- |
| planneros-ken | `apps/planner`    | `npm run build -w planner-os` | `apps/planner/build` | https://planner.kenos.space |
| fitnessos-ken | `apps/fitness`    | `npm run build -w fitness-os` | `apps/fitness/build` | https://fitness.kenos.space |
| financeos-ken | `apps/finance`    | `npm run build -w finance-os` | `apps/finance/dist`  | https://finance.kenos.space |
| musicos-ken   | `apps/music`      | `npm run build -w music-os`   | `apps/music/build`   | https://music.kenos.space   |
| osportal-ken  | `apps/portal`     | `npm run build -w portal`     | `apps/portal/build`  | https://osportal-ken.netlify.app |

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

| Workflow                               | 作用                                                    |
| -------------------------------------- | ------------------------------------------------------- |
| `.github/workflows/ci.yml`             | PR / push 全量 `npm run build`                          |
| `.github/workflows/deploy-netlify.yml` | **手动** CLI 上传兜底（需 `NETLIFY_AUTH_TOKEN` secret） |

主路径是 Netlify Git 构建；GHA 部署仅在需要时使用。

## 环境变量（四站）

四站 Netlify 均已配置（各 **4/4**）：

| 变量                       | 用途                               |
| -------------------------- | ---------------------------------- |
| `PUBLIC_SUPABASE_URL`      | SvelteKit / Netlify 生产           |
| `PUBLIC_SUPABASE_ANON_KEY` | 同上                               |
| `VITE_SUPABASE_URL`        | Vite / 本地 `.env` 与 Finance 构建 |
| `VITE_SUPABASE_ANON_KEY`   | 同上                               |

代码通过 `@life-os/sync` 的 `resolveSupabaseEnv()` 同时读取 `PUBLIC_*` 与 `VITE_*`（见 [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) I-P0）。

**本地 `.env.example` 前缀：**

| App                       | 示例前缀            |
| ------------------------- | ------------------- |
| Planner                   | `PUBLIC_SUPABASE_*` |
| Fitness / Finance / Music | `VITE_SUPABASE_*`   |

修改 `packages/sync` 或 `packages/theme` 会触发四站 rebuild（各 app `netlify.toml` 的 ignore 规则包含 `packages/*`）。

## Portal（I-P1，🟡 Netlify 已建，DNS 待配）

| 项            | 状态                                                                                |
| ------------- | ----------------------------------------------------------------------------------- |
| 代码          | `apps/portal`（SvelteKit + adapter-netlify）                                        |
| Netlify site  | ✅ `osportal-ken`（`a5df5c3e-0e42-4f82-aca8-8d6802da357f`）                           |
| 生产 URL      | https://osportal-ken.netlify.app                                                      |
| 自定义域（可选） | 计划 `https://home.kenos.space`（GoDaddy CNAME 待配）                                 |
| Auth redirect | 🟡 `*.netlify.app/**` 已覆盖；若收紧 allow list 需显式加 `osportal-ken.netlify.app/**` |

**GoDaddy DNS（可选）：** `home.kenos.space` → CNAME → `osportal-ken.netlify.app`

上线步骤见 [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §I-P1。CLI 部署时需 `--filter portal`（与四站相同 `CI=1` 规则）。

```bash
npm run build:portal
CI=1 npx netlify deploy --prod --no-build --filter portal --dir=apps/portal/build --functions=.netlify/functions-internal --site=a5df5c3e-0e42-4f82-aca8-8d6802da357f
```

其他：

- Planner / Finance AI：`KIMI_API_KEY`（Netlify Functions）

## 独立仓库（已归档）

`planner-os`、`fitness-os`、`Moneymoneymoney`、`MusicOS`、`life-os-theme`、`life-os-sync` 已在 GitHub **archive**。生产四站只构建 `Ken-pan/life-os`。

## Music 站 Git 链接

生产 URL：**https://music.kenos.space**（custom domain；Netlify rollback：`https://musicos-ken.netlify.app`）

## Netlify 子域命名（统一）

五站 Netlify site name 统一为 **`{app}os-ken`** → `{app}os-ken.netlify.app`（Portal 为 `osportal-ken`）：

| App     | Netlify site    | GoDaddy CNAME 目标            |
| ------- | --------------- | ----------------------------- |
| Portal  | `osportal-ken`  | `osportal-ken.netlify.app`    |
| Finance | `financeos-ken` | `financeos-ken.netlify.app` |
| Music   | `musicos-ken`   | `musicos-ken.netlify.app`   |
| Planner | `planneros-ken` | `planneros-ken.netlify.app` |
| Fitness | `fitnessos-ken` | `fitnessos-ken.netlify.app` |

若 Build settings 仍指向已 archive 的 `MusicOS` 仓库，在 Netlify UI 将 **Repository** 改为 `Ken-pan/life-os`、分支 `master`、Package directory `apps/music`。Deploy Key 与另外三站相同。

CLI 兜底（已构建 `apps/music/build`）：

```bash
# --filter 会把 cwd 切到 apps/music，functions 用 netlify/functions（勿写 apps/music/... 否则会路径翻倍）
CI=1 npx netlify deploy --prod --no-build --filter music-os --dir=apps/music/build --functions=netlify/functions --site=83dfdf84-095a-4b8a-955d-106d046a314b
```

Git 自动构建走 `apps/music/netlify.toml` 里的 `[functions] directory = "apps/music/netlify/functions"`（相对 repo 根）。

## CLI 手动发布

```bash
cd life-os
npm run build
./scripts/deploy-all-netlify.sh   # 或单站 --no-build 上传
```

**⚠️ Monorepo 必须带 `CI=1` + `--filter <workspace>`**：新版 Netlify CLI 在检测到多个
workspace（planner-os / fitness-os / finance-os / music-os / @life-os/\*）时会交互式询问
"要操作哪个项目"，脚本或 agent 场景下会**无输出永久挂起**。`deploy-all-netlify.sh` 已内置。

单站示例：

```bash
npm run build:planner
CI=1 npx netlify deploy --prod --no-build --filter planner-os --dir=apps/planner/build --functions=netlify/functions --site=82a6cadc-03f9-443c-85f7-26bd4a90f83f
```

Site ID 见 [Netlify team projects](https://app.netlify.com/teams/jpan28/projects).
