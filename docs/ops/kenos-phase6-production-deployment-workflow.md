---
title: Kenos Phase 6 — Production Wave 1 deployment workflow
owner: kenpan
last_verified: 2026-07-19
status: prepared-not-executed
---

# Production Wave 1 deployment workflow

**Goal:** single auditable apply path. Ordinary local agents must **not** hold unbounded production DDL rights.

## Preferred path

GitHub Actions on `master` with:

1. Environment `production-supabase` (required reviewers)
2. Manual approval gate
3. One migration job (not mixed with Netlify deploy)
4. Preflight → backup confirm → apply → verify → Advisors → dual-user smoke → artifact retention

## Job sketch (not enabled until Owner approval + CI wiring)

```yaml
# .github/workflows/kenos-wave1-production-migrate.yml (proposed)
name: Kenos Wave 1 production migrate
on:
  workflow_dispatch:
    inputs:
      approval_phrase:
        description: Must equal APPROVE_KENOS_PRODUCTION_WAVE_1
        required: true
      authoritative_sha:
        description: Full 40-char commit SHA pinned in FINAL APPROVAL PACKET
        required: true
environment: production-supabase
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { ref: ${{ inputs.authoritative_sha }} }
      - name: Preflight migration list
        run: |
          test "$(git rev-parse HEAD)" = "${{ inputs.authoritative_sha }}"
          ./scripts/supabase-sql.sh "select version from supabase_migrations.schema_migrations order by version desc limit 5;"
      - name: Confirm backup / PITR window
        run: |
          # Operator checklist artifact uploaded; fail if missing
          test -n "${{ vars.KENOS_WAVE1_BACKUP_CONFIRMATION }}"
      - name: Apply Wave 1 migrations in order
        run: |
          for f in \
            apps/finance/supabase/migrations/20260719130100_kenos_wave1_plan_create_task_command.sql \
            apps/finance/supabase/migrations/20260719130200_kenos_wave1_plan_privilege_model.sql \
            apps/finance/supabase/migrations/20260719130300_kenos_wave1_action_approvals.sql \
            apps/finance/supabase/migrations/20260719130400_kenos_wave1_focus_context.sql \
            apps/finance/supabase/migrations/20260719130500_kenos_wave1_work_domain.sql
          do
            ./scripts/supabase-sql.sh -f "$f"
            ver=$(basename "$f" | cut -d_ -f1)
            ./scripts/supabase-sql.sh "insert into supabase_migrations.schema_migrations (version, name) values ('$ver', '$(basename "$f" .sql)') on conflict do nothing;"
          done
      - name: Post-apply verification
        run: node scripts/kenos-wave1-post-apply-verify.mjs # to be added at apply time
      - name: Retain logs (no secrets)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: kenos-wave1-migrate-logs
          path: /tmp/kenos-wave1-*.log
```

## Credentials model

| Actor | Rights |
| --- | --- |
| Local agent / laptop | Read-only inventory via Management API only |
| CI `production-supabase` env | Short-lived token / OIDC; scoped to migration job |
| Owner | Manual environment approval + phrase gate |

## Exact production apply commands (manual fallback — only after approval)

```bash
# On authoritative SHA only, after backup confirmation
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260719130100_kenos_wave1_plan_create_task_command.sql
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260719130200_kenos_wave1_plan_privilege_model.sql
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260719130300_kenos_wave1_action_approvals.sql
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260719130400_kenos_wave1_focus_context.sql
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260719130500_kenos_wave1_work_domain.sql
# Register versions if API path does not auto-write schema_migrations
```

## Rollback / disable (Wave 1 additive)

1. Clients remain on legacy Task writers (Wave 1 does not revoke).
2. Disable new RPC usage via feature flags / stop calling `kenos_create_plan_task_action`.
3. `revoke execute on function public.kenos_create_plan_task_action(jsonb) from authenticated;`
4. Leave tables in place (prefer not to DROP with user data).
5. Worker: do not grant login; no production worker process in Wave 1.

## Explicit non-goals

- No Netlify deploy in the migration job
- No Portal cutover
- No writer revoke / canary
- No Secret printing in logs
