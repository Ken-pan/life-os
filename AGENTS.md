# AGENTS.md — Life OS Monorepo

Parent workspace rules: `/Users/kenpan/「Projects」/AGENTS.md`

## Quickstart

```bash
cd "/Users/kenpan/「Projects」/life-os"
npm install
npm run build
cd apps/planner && npm run dev   # 5188 for planner e2e
```

| Script                                                            | Purpose                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `npm run build`                                                   | Turbo build all apps                                            |
| `npm run check`                                                   | Typecheck all apps                                              |
| `npm run check:lifeos-boundaries`                                 | Package/app 依赖边界守卫                                        |
| `npm run verify:ticket-naming`                                    | v2 APP3 ticket ID 漂移扫描（Hub / 链接 / legacy 泄漏）          |
| `npm run build:planner`                                           | Single-app production build                                     |
| `./scripts/verify-life-os-identity-p0.sh`                         | I-P0 身份 + Supabase migration 验收                             |
| `./scripts/test-outbox-trigger.sh [--smoke]`                      | I-P1.5 Outbox 结构检查 / 端到端 smoke                           |
| `npm run verify:outbox`                                           | 同上（`test-outbox-trigger.sh --smoke` 快捷方式）               |
| E2E 问题记录                                                      | [`docs/qa/e2e-issues.md`](docs/qa/e2e-issues.md)                |
| [`MAINTENANCE.md`](docs/MAINTENANCE.md)                           | docs 目录维护约定                                               |
| `./scripts/supabase-sql.sh "<sql>"` / `-f <file.sql>`             | 远程 Supabase SQL（Management API；直连 5432 在本网络不可用）   |
| `./scripts/deploy-all-netlify.sh`                                 | CLI prod deploy 六站（含 Portal、Home）                         |
| `node scripts/create-life-os-app.mjs <id> [--name --port]`        | 从 `apps/starter` 模板生成新 app + AppManifest(PLAT.SHELL.5/6)|
| `node scripts/promote-life-os-app.mjs <id> [--check]`             | 按 `apps/<id>/app.manifest.json` 同步全部注册表(upsert,幂等);`--check` 只验不写 |
| `npm run build:app-registry`                                      | manifest → `packages/theme/src/generated/appRegistry.js`(PLAT.GEN.4) |
| `npm run check:app-manifests`                                     | 全 manifest 校验 + 注册表 staleness 守卫(PLAT.GEN.1/4,CI 已接)|
| `python3 scripts/generate-life-os-brand-icons.py [--app X\|--bootstrap X]` | 品牌图标派生;`--bootstrap` 新 app 占位全套(PLAT.GEN.2)  |
| `node scripts/netlify-provision.mjs <id> [--apply]`               | Netlify site+env+接线供给,默认 dry-run(PLAT.GEN.2)            |
| `npm run pwa:build`                                               | 五端 production build（PWA 验收用）                             |
| `npm run pwa:preview:{planner,fitness,music,finance,portal,home}` | 标准端口 preview（见 `apps.config.mjs`）                        |
| `npm run test:pwa`                                                | 全 app Playwright PWA viewport（`PWA_APP=` 筛选）               |
| `npm run qa:pwa`                                                  | healthcheck + test:pwa + mobile-scroll                          |
| `npm run qa:mobile-scroll`                                        | 四端生产 app PWA 滚动 QA                                        |
| `npm run pwa:healthcheck`                                         | Xcode / preview / Playwright 预检（`PWA_APP=` 筛选）            |
| `npm run pwa:sim:open -- <app> [path]`                            | iOS Simulator 打开 preview                                      |
| `npm run pwa:sim:shot -- <name>`                                  | Simulator 截图 → `docs/ui-qa-screenshots/pwa/simulator/latest/` |
| `npm run test:design-catalog`                                     | Catalog smoke（172；排除 `@visual`）                            |
| `npm run test:design-catalog:snapshots`                           | Catalog pixel baseline（80；desktop）                           |
| `npm run test:design-catalog:all`                                 | smoke + snapshots（252）                                        |

PWA iOS debug：[`docs/qa/pwa-ios.md`](docs/qa/pwa-ios.md)、[`docs/qa/pwa-viewport-checklist.md`](docs/qa/pwa-viewport-checklist.md)、SSOT [`scripts/pwa/apps.config.mjs`](scripts/pwa/apps.config.mjs)、规则 [`.cursor/rules/pwa-ios-debug.mdc`](.cursor/rules/pwa-ios-debug.mdc)。

Any manual `netlify deploy` **must** include `CI=1` and `--filter <workspace>`
(`planner-os` / `fitness-os` / `finance-os` / `music-os` / `portal` / `home-os`)，否则 CLI 会交互式询问项目并挂起。

## Layout

- `apps/{planner,fitness,finance,music}` — 生产四站
- `apps/portal` — 启动器（`portal.kenos.space`）
- `apps/home` — 第六 app · 实验（`home.kenos.space`；spatial 浏览/编辑 + Life OS SSO）
- `apps/finance/extension` — Finance OS Sync Chrome 扩展（生产向插件，非 app）
- `packages/{theme,sync,contracts,platform-web}` — 共享包
- `docs/README.md` — 文档导航 hub
- `docs/LIFEOS_ROADMAP.md` — 状态 hub（Now / Next / Shipped）
- `docs/roadmap/COMPOUND.md` — 复利判据（使用 × 开发 × 决策）
- `docs/roadmap/USAGE_AUDIT.md` — 用量 / 功能利用率审计（`PLAT.USAGE.0`）
- `docs/roadmap/POTENTIAL.md` — 当前 ROI 研判
- `docs/ops/supabase.md` — 共享 DB 迁移与 `supabase-sql.sh` 运维
- `docs/ops/canonical.md` — source of truth vs archived repos
- `docs/ops/netlify.md` — 六站 deploy（含 Portal、Home 实验）

## Git / Netlify

- **Only** push to `Ken-pan/life-os` for production.
- Legacy app repos on GitHub are **archived**; do not commit there.

## Git policy — single branch, no worktrees (2026-07-12)

**`master` is the only branch. Never create branches, worktrees, stashes, or
checkpoint refs — not even for WIP.** This repo has one user; dirty/unfinished
commits directly on `master` are acceptable and preferred over branch sprawl.
(On 2026-07-12 all 26 in-flight branches were merged into `master` and deleted,
local and remote.)

Rules for every agent session:

1. Work directly on `master` in this checkout. `git pull --rebase` before
   starting, commit early and often, `git push origin master` when done.
2. **Never** run `git checkout -b`, `git switch -c`, `git worktree add`,
   `git stash`. If you are asked to "preserve" something, commit it to
   `master` instead.
3. **Parallel agents:** prefer one repo = one agent. Truly independent
   projects live in sibling repos (e.g. PaperOS at `../paperos`) — run a
   second agent there, not on a branch here.
4. If two agents must run in life-os at the same time, each owns exactly one
   `apps/<app>` directory:
   - Stage only your own paths: `git add apps/<your-app> docs/<your-files>`.
     Never `git add -A`, `git add .`, or `git commit -a`.
   - Never run repo-wide destructive commands: `git reset --hard`,
     `git checkout -- .`, `git clean`, `git restore .` — they destroy the
     other agent's uncommitted work.
   - Shared `packages/*` changes: only one agent touches `packages/*` in a
     session; coordinate via commit messages.
5. When an app outgrows the monorepo (its own device stack, runtime, or agent
   lane — like PaperOS did), extract it into a sibling standalone repo with
   `git filter-repo` instead of giving it branches here.

### Codex Cloud unattended tasks

Cloud execution uses `origin/master` as the only input baseline and final formal
source of truth, but the platform may materialize the run on one automatically
created temporary work branch. That temporary branch is review infrastructure,
not a new source of truth. The following rules override the normal local
commit/push instruction for an unattended Cloud task:

1. Start from the selected `origin/master` baseline or commit derived from it. Do
   not create extra branches, worktrees, stashes, checkpoint refs, or parallel
   write tasks yourself.
2. A Cloud task may create small, scoped checkpoint commits on the single
   platform-provided temporary branch and may produce a reviewable diff or PR
   metadata. It must not push, merge, deploy, change DNS, or write to a remote
   database.
3. Never describe the Cloud temporary branch as the formal source of truth.
   Only reviewed changes merged by the owner into `origin/master` become
   official.
4. Run at most one write-capable Cloud task for this repository at a time. Do
   not spawn subagents or parallel tasks that modify `life-os`.
5. Agent-phase internet access stays off. Do not configure secrets or depend on
   production credentials. Setup may install only lockfile-pinned dependencies.
6. Uncommitted local work is not present in Cloud. Touch only the path allowlist
   in the task prompt; treat all other paths as read-only unless the prompt
   explicitly expands scope.
7. An unattended task may prepare docs, guards, fixtures, and non-destructive
   tests. It may not approve owner decisions, apply migrations, retire an app,
   delete user data, or weaken tests to obtain a passing result.
8. Update the task execution-state file before stopping. If facts conflict,
   production access is needed, or a destructive/irreversible step is next,
   record the blocker and stop that slice.
9. Each phase must stop for human review/sign-off. Do not automatically proceed
   from Phase 0 readiness into Phase 1 runtime implementation.

The canonical environment settings and prompt are documented in
`docs/ops/kenos-codex-cloud.md` and
`docs/ops/kenos-codex-cloud-prompt.md`.

PaperOS was extracted to `/Users/kenpan/「Projects」/paperos` (own repo, full
history). The Planner-side provider API (`apps/planner/netlify/functions/paper-*`,
`paperService.mjs`, Supabase paper migrations) stays here.

## Cursor Cloud specific instructions

Environment: Node 22 + npm workspaces. `npm install` at the repo root installs all
`apps/*` and `packages/*` (it is the startup update script). Standard commands live
in `README.md` / this file's Quickstart table / root `package.json` — reference those
rather than duplicating.

Non-obvious caveats:

- **Running an app in dev:** `cd apps/<app> && npm run dev` serves on Vite's default
  `5173`. The `5188` port in Quickstart is the PWA **preview** (production build) port
  from `scripts/pwa/apps.config.mjs`, not the `vite dev` port.
- **Apps are local-first.** They run without any Supabase credentials; `.env` is
  optional. Each production app ships public defaults in `apps/<app>/.env.example`.
  **Do NOT copy `.env` for e2e:** the planner desktop e2e suite (and CI) assume
  local-first — a live Supabase `.env` puts Planner into cloud-sync mode and breaks
  the localStorage/task-lifecycle specs. Core flows (task create/complete/persist)
  work purely against local storage.
- **Playwright browsers are not installed by the update script.** Run
  `npx playwright install` (all browsers) before the e2e / PWA / design-catalog
  suites — **WebKit is required**, not just Chromium: `catalog-mobile` and the PWA
  `tests/pwa/*` suites emulate `iPhone 13` (WebKit). CI uses `--with-deps` (needs
  root for OS libs). Suites: `npm run test:pwa`, `npm run test:design-catalog`,
  `apps/planner npm run test:e2e -- --project=desktop`.
- **`npm run test:pwa` known gaps (not env issues, not in CI):** `aios` cannot start
  its preview because `scripts/pwa/preview-app.sh` has no `aios` case; the `knowledge`
  `library` route fails one standalone shell-guard assertion (`mainOverflowY hidden`
  vs `auto`). The six production/near-production apps (planner, fitness, finance,
  music, portal, health) pass. Filter with `PWA_APP=<id>`.
- **`packages/contracts` `npm test` is broken standalone** — its script runs `node`
  directly on a `.ts` file (`ERR_UNKNOWN_FILE_EXTENSION`) and is not wired into CI.
  Validate contracts via `npm run check` / `npm run check:lifeos-boundaries` instead.
- **Fast dependency-free checks** (all green, mirror CI `build` + `integration-smoke`):
  `npm run build`, `npm run check`, `npm run validate:tokens`,
  `npm run check:lifeos-boundaries`, `npm run check:lifeos-styles`,
  `npm run check:app-manifests`. Per-workspace unit tests: `npm run test -w <workspace>`
  (e.g. `planner-os`, `finance-os`, `@life-os/platform-web`).
