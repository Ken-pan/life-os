# Supabase Staging Security Gate Report

## 1. Final verdict
**PASS WITH WARNINGS**

## 2. Staging environment
- **Type**: Independent Supabase Project
- **Region**: us-east-2
- **Data**: Empty project, no production user data.
- **Config**: Isolated environment with `enable_confirmations` temporarily modified for testing direct signup.

## 3. Migration result
Baseline migration applied successfully to staging.
- `20260710160000_life_os_baseline.sql`
- `20260710161000_fitness_signup_membership.sql`

## 4. Hosted signup trigger result
**PASS**. Admin-created users without roles automatically received only the `fitness` member role with active status.

## 5. Direct signup / malicious metadata result
**PASS**. Raw direct signups bypassing UI controllers successfully granted only `fitness` membership. Malicious metadata injection (e.g., requesting `planner` owner role) was safely ignored by the backend trigger.

## 6. Membership escalation result
**PASS**. 
- Read own fitness membership: Allow
- Read owner (Ken) membership: Denied (0 rows)
- Insert/Update/Delete cross-app memberships or role escalations: Denied

## 7. Cross-app DB isolation result
**PASS**. 
Friend user with only Fitness membership cannot access any rows in:
- `planner_tasks`
- `finance_data`
- `music_user_state`
- `core_user_app_settings` (Home)
- App Registry restricted views

## 8. Fitness two-user isolation result
**PASS**. 
- Read/Create/Update own Fitness data: Allow
- Read Ken Fitness data: Denied (0 rows)
- Update/Delete Ken Fitness data: Denied
- Insert row with `user_id = Ken`: Denied

## 9. Storage isolation result
**PASS**. 
- `bug-attachments`: Enforces MIME type allowlist, rejects unexpected types.
- `finance-purchase-images`: Cross-app upload denied for Fitness user.
- `music`: Cross-app upload denied for Fitness user.
- `music-covers`: Remained public.

## 10. Frontend entitlement result
**NOT AUTOMATED**. No staging frontend preview is actively deployed. Bypassed frontend routing checks, relying on the verified backend RLS and row-level app isolation.

## 11. Public storage policy decision
- `finance_purchase_images_public_select`: **RESTRICT** (Policy dropped and replaced with `select_own` checking `has_app_access('finance')`)
- `music_covers_public_select`: **KEEP** (Policy explicitly recreated as public select)

## 12. Commands run
```bash
supabase projects create "Life OS Staging" --org-id fqmkzhfqpkcvcxbmdrnc --db-password "***" --region us-east-2
supabase link --project-ref <redacted>
supabase db push --linked --workdir apps/finance
LIFEOS_SECURITY_TARGET=staging node scripts/security/local-supabase-final-gate.mjs
```

## 13. Files changed
- `scripts/security/local-supabase-final-gate.mjs` (Added staging target support and modified domains to `example.com`)
- `apps/finance/supabase/config.toml` (Temporarily set `enable_confirmations = false` locally to run gate tests on staging)

## 14. Blockers / warnings
**WARNING**: `enable_confirmations` in Auth must be explicitly handled if testing raw email signups via client APIs without configured SMTP in new staging projects.
**WARNING**: Local config diffs include test modifications to `config.toml`. Ensure these are reverted or not pushed to production.

## 15. Can Ken deploy to production?
**YES**

## 16. Can Ken invite the real friend?
**NOT YET** (Ensure production rollout is fully completed and staging config reverts are applied before inviting).
