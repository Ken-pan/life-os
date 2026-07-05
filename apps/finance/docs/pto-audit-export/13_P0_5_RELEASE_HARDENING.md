# P0.5 Release Hardening

## Executive result

`P0.5 PASS`

- All four release-hardening gates are closed:
  - `protected_account` no longer silently covers shortfall
  - atomic restore RPC is live, permission-scoped, and UI-verified end-to-end
  - live RLS isolation checks passed for all existing exposed financial tables
  - desktop/mobile visual QA completed with real app state and screenshots
- Non-blocking follow-up only:
  - Supabase Security Advisor warning for leaked-password protection (auth config)

## Files changed

- `src/engine/monthly.ts`
- `src/components/TodayView.tsx`
- `src/components/SettingsView.tsx`
- `src/lib/repo.ts`
- `src/lib/repo.backup.test.ts`
- `src/engine/dashboard.test.ts`
- `supabase/migration_atomic_restore.sql`
- `docs/pto-audit-export/13_P0_5_RELEASE_HARDENING.md`

## Formula behavior changes

- `protected_account` default behavior changed:
  - excluded from operating cash upstream
  - **not** auto-used in monthly shortfall coverage
  - normal baseline and normal purchase simulation do not consume protected reserve
- explicit fallback only:
  - new `allowProtectedReserveFallback` simulation flag in monthly engine (default `false`)
  - Today page adds explicit `Simulate using reserve` action with runway-impact disclosure
- shortfall visibility:
  - shortfall warning remains visible even when protected reserve exists

## Database migration results

Applied to project `iueozzuctstwvzbcxcyh`:

1. `migration_goal_reserve_policy`
2. `migration_atomic_restore`

Validation:

| Check | Result | Evidence |
| ----- | ------ | -------- |
| `goals.reserve_policy` exists | PASS | `list_tables(verbose)` shows column present |
| legacy reserve backfill | PASS | `reserve_policy_populated=1`, `reserve_true_backfilled=1`, `total_goals=1` |
| `monthly_allocation_day` nullable | PASS | `information_schema.columns.is_nullable=YES` |
| `user_settings.data_version` default `6` | PASS | `column_default=6` |
| existing settings rows healthy | PASS | `users_with_settings=1`, `assumptions_null=0`, `data_version_null=0` |
| backward compatibility fallback | PASS | existing frontend normalize fallback retained (`store/persistence.ts`) |

## Atomic restore design

- Implemented versioned RPC:
  - `public.restore_finance_backup_v1(payload jsonb)`
- Atomicity:
  - runs all delete+insert steps in one DB transaction scope
  - any error aborts and rolls back all changes
- Security model:
  - `SECURITY INVOKER`
  - owner derived from `auth.uid()` only
  - ignores any client-supplied owner id
  - `EXECUTE` revoked from `public` and `anon`, granted only to `authenticated`
- Companion delete RPC:
  - `public.delete_all_financial_data_v1()`
  - same permission scoping and owner binding
- Frontend:
  - local schema validation before RPC
  - summary + typed confirmation (`RESTORE`)
  - no fallback to client-side partial restore
  - failure message explicitly states no partial apply

## Rollback test results

Automated test suite:

- new/updated tests passed in `src/lib/repo.backup.test.ts` and `src/engine/dashboard.test.ts`

| Test | Result |
| ---- | ------ |
| invalid schema restore rejected | PASS |
| malformed row restore rollback | PASS |
| successful restore replaces caller dataset | PASS |
| restore cannot affect other user | PASS |
| anonymous restore call denied | PASS |
| delete-all scoped to caller only | PASS |
| protected reserve not auto-used baseline | PASS |
| protected reserve not auto-used ordinary purchase sim | PASS |
| explicit fallback can use reserve and reduces runway | PASS |

## Restore UI E2E verification

Executed on live authenticated session at `http://localhost:5174/`:

| Step | Result | Evidence |
| ---- | ------ | -------- |
| Export JSON backup | PASS | Captured schema v1 payload (`accounts=16`, `transactions=5258`) |
| Upload backup file | PASS | File input accepted; summary shown |
| Local schema validation | PASS | UI message: “恢复文件已通过校验，请确认摘要后执行覆盖。” |
| Typed confirmation `RESTORE` | PASS | Confirm button enabled only after input |
| Atomic RPC restore + reload | PASS | Page reloaded to Today; app usable |
| Post-restore row counts | PASS | DB counts unchanged: `accounts=16`, `cash_flows=8`, `scenario_events=5`, `goals=1`, `transactions=5258`, `user_settings=1` |

Screenshots:

- Restore confirmation UI: `qa_restore_confirmation.png`
- Post-restore app state: `qa_restore_e2e_success_today.png`

## RLS live verification matrix

Test users:

- User A: existing primary user
- User B: temporary RLS test user (created for isolation checks)

Execution approach:

- ran SQL as `role authenticated` with `request.jwt.claim.sub` set to A or B
- verified select/update/delete and wrong-owner insert behavior
- used transaction rollback for destructive probes

### Existing exposed financial tables

| Table or RPC | Own read | Cross-user read blocked | Cross-user write blocked | Wrong-owner insert blocked | Notes |
| ------------ | -------- | ----------------------- | ------------------------ | -------------------------- | ----- |
| `accounts` | PASS | PASS | PASS (`upd=0`, `del=0`) | PASS (RLS error 42501) | live verified |
| `cash_flows` | PASS | PASS | PASS (`upd=0`, `del=0`) | PASS (RLS error 42501) | live verified |
| `scenario_events` | PASS | PASS | PASS (`upd=0`, `del=0`) | PASS (RLS error 42501) | live verified |
| `goals` | PASS | PASS | PASS (`upd=0`, `del=0`) | PASS (RLS error 42501) | live verified |
| `user_settings` | PASS | PASS | PASS (`upd=0`, `del=0`) | PASS (RLS error 42501) | live verified |
| `transactions` | PASS | PASS | PASS (`upd=0`, `del=0`) | PASS (RLS error 42501) | live verified |
| `restore_finance_backup_v1` | PASS | PASS | PASS | N/A | payload owner spoof ignored; other user unchanged in transactional probe |
| `delete_all_financial_data_v1` | PASS | N/A | PASS | N/A | caller rows removed, other user rows untouched in transactional probe |
| anon `restore_finance_backup_v1` | N/A | N/A | PASS | N/A | permission denied |
| anon `delete_all_financial_data_v1` | N/A | N/A | PASS | N/A | permission denied |

### Requested but missing tables in current schema

| Table | Status | Notes |
| ----- | ------ | ----- |
| `scenarios` | BLOCKED | table does not exist in current project |
| `recurring_items` | BLOCKED | table does not exist in current project |
| `merchant_rules` | BLOCKED | table does not exist in current project |
| `review_items` | BLOCKED | table does not exist in current project |

## Security Advisor results

- `security` advisors:
  - WARN: `auth_leaked_password_protection` (Leaked Password Protection disabled)
  - remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- `performance` advisors:
  - no findings

## Visual QA results

Environment:

- Real app tab: `http://localhost:5174/`
- QA completed on live interactive UI state

Screenshots captured:

- Today 1440: `qa_today_1440.png`
- Today 1024: `qa_today_1024.png`
- Today 390 mobile: `qa_today_390.png`
- Safe-to-spend explanation expanded: `qa_safe_to_spend_explained.png`
- Spend Impact $0: `qa_spend_impact_zero.png`
- Spend Impact one-time purchase: `qa_spend_impact_onetime.png`
- Goal editor reserve policies: `qa_goal_reserve_policies.png`
- Export backup area/confirmation: `qa_export_backup_confirmation.png`
- Restore confirmation (`RESTORE` typed): `qa_restore_confirmation.png`
- Post-restore E2E success state: `qa_restore_e2e_success_today.png`
- Projected shortfall with protected reserve: `qa_projected_shortfall_protected_reserve.png`
- Simulate using reserve state: `qa_shortfall_simulate_reserve.png`

Observations:

- No horizontal overflow observed at tested widths.
- 390px layout remains usable with bottom nav and key CTA visible.
- Warning states now include explicit actions (`Simulate using reserve`, `Adjust spending plan`, `Transfer funds`).
- Paid-in-full / revolving visual distinction remains intact.
- Keyboard focus indicators visible on interactive controls.
- Dialog/sheet titles visible for Spend Impact drawer.

## Final checks

- `npm run test` → PASS (86/86)
- `npm run typecheck` → PASS
- `npm run lint` → PASS (3 existing non-blocking warnings)
- `npm run build` → PASS

## Remaining risks

- Security Advisor warning (leaked-password protection) remains open.
- Four requested RLS tables (`scenarios`, `recurring_items`, `merchant_rules`, `review_items`) are not present in current schema; no live isolation test possible until they exist.

## Items requiring PTO approval

1. Approve transition from P0.5 to P1 (CSV Import / Reality Loop / Monthly Review).
2. Decide whether to make leaked-password protection a blocking security gate or track as follow-up.
