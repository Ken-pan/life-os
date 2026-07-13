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
| `node scripts/create-life-os-app.mjs <id> [--name --port]`        | 从 `apps/starter` 模板生成新 app(PLAT.SHELL.5)                |
| `npm run sync:packages`                                           | Copy sibling theme/sync into `packages/*` (legacy)              |
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

PaperOS was extracted to `/Users/kenpan/「Projects」/paperos` (own repo, full
history). The Planner-side provider API (`apps/planner/netlify/functions/paper-*`,
`paperService.mjs`, Supabase paper migrations) stays here.
