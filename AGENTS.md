# AGENTS.md — Life OS Monorepo

Parent workspace rules: `/Users/kenpan/「Projects」/AGENTS.md`

## Quickstart

```bash
cd "/Users/kenpan/「Projects」/life-os"
npm install
npm run build
cd apps/planner && npm run dev   # 5188 for planner e2e
```

| Script                                                | Purpose                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `npm run build`                                       | Turbo build all apps                                          |
| `npm run check`                                       | Typecheck all apps                                            |
| `npm run check:lifeos-boundaries`                     | Package/app 依赖边界守卫                                      |
| `npm run build:planner`                               | Single-app production build                                   |
| `./scripts/verify-life-os-identity-p0.sh`             | I-P0 身份 + Supabase migration 验收                           |
| `./scripts/test-outbox-trigger.sh [--smoke]`          | I-P1.5 Outbox 结构检查 / 端到端 smoke                         |
| `npm run verify:outbox`                               | 同上（`test-outbox-trigger.sh --smoke` 快捷方式）             |
| `./scripts/supabase-sql.sh "<sql>"` / `-f <file.sql>` | 远程 Supabase SQL（Management API；直连 5432 在本网络不可用） |
| `./scripts/deploy-all-netlify.sh`                     | CLI prod deploy 四站（Portal 未上线）                         |
| `npm run sync:packages`                               | Copy sibling theme/sync into `packages/*` (legacy)            |

## Netlify CLI（monorepo 陷阱）

Any manual `netlify deploy` **must** include `CI=1` and `--filter <workspace>`
(`planner-os` / `fitness-os` / `finance-os` / `music-os` / `portal`)，否则 CLI 会交互式询问项目并挂起。

## Layout

- `apps/{planner,fitness,finance,music}` — 生产四站 SvelteKit apps
- `apps/portal` — I-P1 WIP（未部署 `home.kenos.space`）
- `packages/{theme,sync,contracts,platform-web}` — 共享包
- `docs/LIFEOS_ROADMAP.md` — Integration + Platform 路线图与完成度
- `docs/SUPABASE.md` — 共享 DB 迁移与 `supabase-sql.sh` 运维
- `docs/CANONICAL.md` — source of truth vs archived repos
- `docs/NETLIFY.md` — 四站 deploy + Portal 计划

## Git / Netlify

- **Only** push to `Ken-pan/life-os` for production.
- Legacy app repos on GitHub are **archived**; do not commit there.
