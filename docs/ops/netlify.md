# Netlify 部署说明

**最后与代码同步：** 2026-07-17

**Planner Paper API：** 函数目录在 repo 根 `netlify.toml` → `apps/planner/netlify/functions`（非 `apps/planner/netlify.toml` 内的相对路径 alone）。生产 `GET /api/paper/today` 无 token → **401**（2026-07-10）。

## 当前模式（推荐）：`Ken-pan/life-os` Monorepo + Deploy Key

**六个 canonical web surface**（四生产 + Portal 启动器 + Home 实验）均指向同一 monorepo；另有 KnowledgeOS 实验 site 与 AIOS 只读 viewer。下表记录代码侧已知接线；DNS / 实际 deploy 状态若未在本次远程复核，不从 manifest 推断。

| Site          | Package directory | Build                         | Publish              | Production URL              | 备注     |
| ------------- | ----------------- | ----------------------------- | -------------------- | --------------------------- | -------- |
| planneros-ken | `apps/planner`    | `npm run build -w planner-os` | `apps/planner/build` | https://planner.kenos.space | 生产     |
| fitnessos-ken | `apps/fitness`    | `npm run build -w fitness-os` | `apps/fitness/build` | https://fitness.kenos.space | 生产     |
| financeos-ken | `apps/finance`    | `npm run build -w finance-os` | `apps/finance/build` | https://finance.kenos.space | 生产     |
| musicos-ken   | `apps/music`      | `npm run build -w music-os`   | `apps/music/build`   | https://music.kenos.space   | 生产     |
| portal-ken    | `apps/portal`     | `npm run build -w portal`     | `apps/portal/build`  | https://portal.kenos.space  | 启动器   |
| homeos-ken    | `apps/home`       | `npm run build -w home-os`    | `apps/home/build`    | https://home.kenos.space    | **实验** |
| knowledgeos-ken | `apps/knowledge` | `npm run build -w knowledge-os` | `apps/knowledge/build` | https://knowledge.kenos.space（DNS 待加） | **实验** |

> **AIOS 云端只读版（命名不同，但接线方式与上表一致）：** `aios-kenos.netlify.app`（site id `5bfa64b2-7108-479d-b9e2-45f9c4d9f791`），package directory `apps/aios`，`npm run build -w aios-os`（`VITE_AIOS_CLOUD=1` 由 `apps/aios/netlify.toml` 注入）。AIOS 是本地优先原生 Mac app，云端仅登录后查看已同步对话/记忆/图片的**只读查看器**，无自定义 `kenos.space` 子域（代码里 `aios.kenos.space` 的 production URL 目前无 DNS，不解析）。详见 [`../roadmap/apps/aios.md`](../roadmap/apps/aios.md)。

**Base directory 留空**（repo 根目录 `npm install`）。

各 app 的 `netlify.toml` 含 **ignore build**：仅当该 app 或 `packages/*` 变更时触发。
**watch 列表必须是依赖闭包**（含传递依赖，如 `platform-web` → `contracts`），漏一个 → 那个包的改动不会重建此站，静默落后。

Push 到 `life-os` 的 `master` 分支 → Netlify 自动构建对应 Site。

> **⚠️ 2026-07-15 修复：`homeos-ken` 与 `aios-kenos` 此前从未接 Git**，`build_settings.repo_url` 为 null、历史 deploy 的 `commit_ref` 全是 null —— push 到 master 对它们毫无作用，生产静默停在上次手动 CLI 部署的时间点（发现时 home 落后 48 个 commit / 2 天）。两站现已按上表方式接线。
>
> **接线要点：** 用 API 改接线时，`updateSite` 的 **`build_settings` key 会被静默忽略**（返回 200 但不生效），必须写在 **`repo`** key 里；且必须设 `package_path: apps/<app>`（`base` 留空），否则 `apps/<app>/netlify.toml` 根本不会被读到。
>
> **体检（新站上线后务必做一次）：**
> ```bash
> npx netlify api getSite --data '{"site_id":"<id>"}' | grep -o '"repo_url":"[^"]*"'
> # 为 null = 没接 Git = push 不会上线
> ```

### 本地验证

```bash
cd life-os && npm install && npm run build
```

### 共享包

直接在 `packages/theme`、`packages/sync` 修改；`npm run sync:packages` 仅在有本地 sibling 克隆时做一次性导入。

## GitHub Actions

| Workflow                                         | 作用                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml` → `build`             | PR / push：`validate:tokens` + Turbo `npm run build`                                               |
| `.github/workflows/ci.yml` → `design-catalog`    | 当前代码收集 smoke **922** + a11y **147** + snapshots **524**（`--list`，2026-07-17）；实际通过状态看当次 CI |
| `.github/workflows/ci.yml` → `integration-smoke` | `check:lifeos-boundaries` + outbox 结构；有 `SUPABASE_ACCESS_TOKEN` 时跑远程 identity/outbox smoke |
| `.github/workflows/deploy-netlify.yml`           | **手动** CLI 上传兜底（需 `NETLIFY_AUTH_TOKEN` secret）                                            |

主路径是 Netlify Git 构建；GHA 部署仅在需要时使用。

## 环境变量（四站）

四站 Netlify 均已配置（各 **4/4**）：

| 变量                       | 用途                               |
| -------------------------- | ---------------------------------- |
| `PUBLIC_SUPABASE_URL`      | SvelteKit / Netlify 生产           |
| `PUBLIC_SUPABASE_ANON_KEY` | 同上                               |
| `VITE_SUPABASE_URL`        | Vite / 本地 `.env` 与 Finance 构建 |
| `VITE_SUPABASE_ANON_KEY`   | 同上                               |

代码通过 `@life-os/sync` 的 `resolveSupabaseEnv()` 同时读取 `PUBLIC_*` 与 `VITE_*`（见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) INTG.IDENTITY.0）。

**本地 `.env.example` 前缀：**

| App                       | 示例前缀            |
| ------------------------- | ------------------- |
| Planner                   | `PUBLIC_SUPABASE_*` |
| Fitness / Finance / Music | `VITE_SUPABASE_*`   |

修改 `packages/sync` 或 `packages/theme` 会触发四站 rebuild（各 app `netlify.toml` 的 ignore 规则包含 `packages/*`）。

## Portal（INTG.EVENTS.1，✅ 已上线 · Growth PORT.GROWTH.1–PORT.GROWTH.5 已接）

| 项             | 状态                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| 代码           | `apps/portal`（SvelteKit + adapter-netlify）                                         |
| Netlify site   | ✅ `portal-ken`（`a5df5c3e-0e42-4f82-aca8-8d6802da357f`）                            |
| 生产 URL       | https://portal.kenos.space（CNAME → `portal-ken.netlify.app`）✅                     |
| Netlify 默认域 | https://portal-ken.netlify.app                                                       |
| Auth redirect  | 🟡 `*.netlify.app/**` 已覆盖；若收紧 allow list 需显式加 `portal-ken.netlify.app/**` |

**GoDaddy DNS：** `portal.kenos.space` → CNAME → `portal-ken.netlify.app`

上线步骤见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) §INTG.EVENTS.1。CLI 部署时需 `--filter portal`（与四站相同 `CI=1` 规则）。

```bash
npm run build:portal
CI=1 npx netlify deploy --prod --no-build --filter portal --dir=apps/portal/build --functions=.netlify/functions-internal --site=a5df5c3e-0e42-4f82-aca8-8d6802da357f
```

## Home（HOME.EXPER.0，🟡 实验 · 生产已部署）

| 项           | 状态                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| 代码         | `apps/home`（SvelteKit + adapter-static）                                                |
| Netlify site | `homeos-ken`（`69d4c072-d153-499c-90a8-57909df461a4`）                                   |
| 生产 URL     | https://home.kenos.space                                                                 |
| Portal       | ✅ Launcher 实验区（HOME.PORTAL.1 · 2026-07-09）                                                  |
| Integration  | ✅ SSO + redirect；云端已有 `home.scans` / 私有照片桶 / `home.events`；可编辑 spatial 项目仍本地真源 |

```bash
npm run build:home
CI=1 npx netlify deploy --prod --no-build --filter home-os --dir=apps/home/build --site=69d4c072-d153-499c-90a8-57909df461a4
```

`./scripts/deploy-all-netlify.sh` 已含 Home；HealthOS 当前 `production: false`，未列为 Netlify 生产 surface。

其他：

- Planner / Finance AI：`KIMI_API_KEY`（Netlify Functions）

---

## 独立仓库（已归档）

`planner-os`、`fitness-os`、`Moneymoneymoney`、`MusicOS`、`life-os-theme`、`life-os-sync` 已在 GitHub **archive**。生产四站只构建 `Ken-pan/life-os`。

## Music 站 Git 链接

生产 URL：**https://music.kenos.space**（custom domain；Netlify rollback：`https://musicos-ken.netlify.app`）

## Netlify 子域命名（统一）

六站 Netlify site name 统一为 **`{app}os-ken`** → `{app}os-ken.netlify.app`（Portal 为 `portal-ken`，Home 为 `homeos-ken`）：

| App     | Netlify site    | GoDaddy CNAME 目标          | 备注   |
| ------- | --------------- | --------------------------- | ------ |
| Portal  | `portal-ken`    | `portal-ken.netlify.app`    | 启动器 |
| Home    | `homeos-ken`    | `homeos-ken.netlify.app`    | 实验   |
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
