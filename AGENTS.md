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

## Layout

- `apps/{planner,fitness,finance,music}` — SvelteKit apps
- `packages/{theme,sync}` — `@life-os/theme`, `@life-os/sync`
- `docs/CANONICAL.md` — source of truth vs archived repos
- `docs/NETLIFY.md` — four-site deploy matrix

## Git / Netlify

- **Only** push to `Ken-pan/life-os` for production.
- Legacy app repos on GitHub are **archived**; do not commit there.
