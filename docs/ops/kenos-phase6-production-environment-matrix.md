---
title: Kenos Phase 6 — Production Environment Matrix
owner: kenpan
last_verified: 2026-07-19
status: stage-a-inventory-only
---

# Production Environment Matrix

Stage A inventory. **No secrets.** Values are public refs / names only.

| Environment | Purpose | Owner | Current version / tip | Classification | Credentials location (names) | Deploy | Rollback | Last backup | Last verified | Kind | Known drift | Blast radius |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase `iueozzuctstwvzbcxcyh` | Shared Life OS / Kenos hosted DB | Ken | Remote `schema_migrations` tip `20260717220000` (2026-07-19 read) | mixed personal/work | `SUPABASE_ACCESS_TOKEN`, `PUBLIC_SUPABASE_*` / `VITE_SUPABASE_*` | Management API / review SQL apply (owner-gated) | PITR + rollback SQL + feature flags | Supabase project backups (restore drill TBD) | 2026-07-19 Stage A SQL inventory | production | **No `kenos_*` tables/functions hosted yet**; `planner_tasks_*_own` direct write still live | All apps + MCP + future Kenos RPC |
| Supabase staging note | Historical mislink risk | Ken | Fingerprint docs mention `dsilozzjnsvjnhbruibl` staging | lower | same family | N/A for Wave 1 | N/A | unknown | docs | staging | Must not confuse with prod ref | Medium if scripts point wrong |
| Netlify `planneros-ken` | Planner + MCP functions | Ken | Git master → auto | personal/work | Netlify env + `KIMI_API_KEY` name | Git push / CLI `CI=1` | Redeploy previous | N/A | ops/netlify.md | production | MCP complete_task still legacy upsert | Plan writes / MCP |
| Netlify `portal-ken` | Launcher | Ken | Git master | personal | site env | Git | Redeploy / flag Off | N/A | ops/netlify.md | production | Kenos entry flag default Off | Default entry UX |
| Netlify finance/fitness/music/home/knowledge/aios/uiux | Domain apps + viewers | Ken | per-site | varies | per-site env names | Git / CLI | Redeploy | N/A | ops/netlify.md | prod / experimental | AIOS cloud read-only; Home/Knowledge experimental | Per-app |
| Apple Kenos clients | iOS/macOS/Watch local foundation | Ken | clients/apple @ Phase 5 tip | personal/work | Keychain abstraction; mock session still default | Xcode local; distribution gated | Remove Focus/store; keep FakeExecutor | N/A | Phase 4B/5 QA | local / not App Store | No production Team/APNs/App Group | Device local only until Wave 4 |
| Local Mac AIOS / Vault / LocalAI | Assistant runtime | Ken | local services | restricted_local_only | local config (not documented as secrets here) | local | stop services | local | aios roadmap | local | Not hosted truth | Local device |
| Connectors (WST/Gmail/Calendar/Figma/Paper/Jira refs) | Capture / references | Ken | app-specific | sensitive / work_confidential | OAuth token stores per integration | per app | revoke tokens | varies | OPEN / per-app | mixed | External write **Off** for Wave 1 | External accounts |

## Hosted Kenos presence (2026-07-19 read-only)

| Check | Result |
| --- | --- |
| `kenos_%` tables | **none** |
| `kenos_%` / `create_plan_task` functions | **none** |
| `kenos_outbox_worker` role | **absent** |
| `planner_tasks` RLS | **on**; policies include `insert_own` / `update_own` / `delete_own` / `select_own` |
| Approximate counts | `planner_tasks` 1664 · `life_events` 21 · `planner_projects` 50 · `planner_user_state` 1 |

## Env var names only

`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `NETLIFY_AUTH_TOKEN`, `CI`, `KIMI_API_KEY`, `VITE_KENOS_PHASE2_ENTRY`, `VITE_KENOS_PHASE3_WORK`, `VITE_KENOS_PHASE3_WORK_TASK_CONVERSION`, `VITE_AIOS_CLOUD`.

## References

- `docs/ops/supabase.md`
- `docs/ops/netlify.md`
- `docs/ops/canonical.md`
- `docs/security/supabase-production-fingerprint.md`
