# AGENTS.md — Life OS Monorepo

Parent workspace rules: `/Users/kenpan/「Projects」/AGENTS.md`

## Quickstart

```bash
cd "/Users/kenpan/「Projects」/life-os"
npm install
npm run build
cd apps/planner && npm run dev   # 5188 for planner e2e
```

| Script | Purpose |
|--------|---------|
| `npm run build` | Turbo build all apps |
| `npm run check` | Typecheck all apps |
| `npm run build:planner` | Single-app production build |
| `npm run sync:packages` | Copy sibling theme/sync into `packages/*` (legacy; prefer editing `packages/` directly) |
| `./scripts/deploy-all-netlify.sh` | CLI prod deploy all four sites |
| `./scripts/supabase-sql.sh "<sql>"` / `-f <file.sql>` | Run SQL on the Life OS Supabase project via Management API (direct 5432 connect fails on this network; `supabase migration list/up --linked` will error — use this instead, and record applied migrations in `supabase_migrations.schema_migrations`) |

## Netlify CLI（monorepo 陷阱）

Any manual `netlify deploy` **must** include `CI=1` and `--filter <workspace>`
(`planner-os` / `fitness-os` / `finance-os` / `music-os`), otherwise the CLI detects
multiple workspaces and hangs forever waiting for interactive project selection.

## Layout

- `apps/{planner,fitness,finance,music}` — SvelteKit apps
- `packages/{theme,sync}` — `@life-os/theme`, `@life-os/sync`
- `docs/CANONICAL.md` — source of truth vs archived repos
- `docs/NETLIFY.md` — four-site deploy matrix

## Git / Netlify

- **Only** push to `Ken-pan/life-os` for production.
- Legacy app repos on GitHub are **archived**; do not commit there.
