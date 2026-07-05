# Traceability Index

| Product concept | Primary files | Relevant symbols | Audit sections |
| --- | --- | --- | --- |
| P2B Decision Studio | `src/components/DecisionStudioView.tsx`, `src/engine/decision.ts`, `src/engine/decision.test.ts`, `supabase/migration_p2b_decision_studio.sql`, `src/lib/repo.ts` | `selectDecisionComparison`, `loadDecisionRecords`, `upsertDecisionRecord`, `applyScenarioToPlan`, `undoLatestScenarioApply`, `decision_records` | 18_P2B_DECISION_STUDIO |
| P2A named scenarios foundation | `supabase/migration_p2a_named_scenarios.sql`, `supabase/schema.sql`, `src/lib/repo.ts`, `src/store/store.tsx`, `src/components/ScenariosView.tsx` | `scenarios`, `scenario_id`, `loadScenarioEvents`, `setActiveScenario`, `duplicateScenario` | 18_P2B_BLOCKED_BY_P2A |
| P2B dependency gate | `src/types.ts`, `src/components/ScenariosView.tsx`, `src/lib/repo.ts`, `supabase/schema.sql`, `src/engine/daily.ts`, `src/engine/monthly.ts` | `ScenarioEvent`, `projectDaily`, `projectMonthly`, `finalizeTransactionImport` | 18_P2B_BLOCKED_BY_P2A |
| Overview / 总览 | `OverviewView.tsx`, `hooks/useProjection.ts`, `engine/metrics.ts` | `summarize`, `OverviewMetrics` | 00, 01, 02 |
| Today / 今日 | `TodayView.tsx`, `hooks/useDashboard.ts` | `Dashboard`, `derived` | 01, 04, 02 |
| Accounts | `AccountsView.tsx`, `types.ts` Account | `upsertAccount`, `buildSimState` | 01, 03, 04-F |
| Safe to spend | `engine/metrics.ts`, `engine/daily.ts`, `hooks/useDashboard.ts` | `computeSafeToSpend`, `projectDaily` | 02, 04-B,C |
| Monthly forecast | `engine/monthly.ts`, `hooks/useProjection.ts` | `projectMonthly`, `MonthSnapshot` | 02, 03 |
| Daily cash calendar | `engine/daily.ts` | `DailyOutlook`, `DayEvent` | 02, 04-B |
| Action inbox | `engine/actions.ts` | `buildActions`, `ActionItem` | 01, 04-B |
| Spend simulator | `SpendImpactDrawer.tsx`, `engine/metrics.ts` | `computeSpendImpact` | 01, 02, 04-C,D |
| Forecast UI | `ForecastView.tsx`, `ForecastChart.tsx` | `Projection`, `adjustForDisplay` | 01, 05 |
| Plan / 规划 | `PlanView.tsx`, `CashFlowsView.tsx`, `FutureCashflowView.tsx`, `ScenariosView.tsx` | CashFlowItem, ScenarioEvent, Goal | 01, 04-G |
| Goals | `ScenariosView.tsx`, `types.ts` Goal | `goalReachMonth`, `reserve` | 01, 02, 10 |
| Scenarios (events) | `ScenariosView.tsx`, `monthly.ts` precomputeFlows | salary/expense/partner events | 01, 02 |
| Transactions / 记录 | `HistoryView.tsx`, `engine/transactions.ts`, `store/transactions.tsx` | `Txn`, `monthlySeries` | 01, 03, 04-E,H |
| Review / 审查 | `ReviewView.tsx`, `engine/realityLoop.ts`, `lib/repo.ts` | `normalizeAndReviewRows`, `finalizeTransactionImport`, `computeBaselineWindows` | 15, 16, 03, 04-E, 08, 11, 12 |
| Imports | `scripts/gen-txn-sql.mjs`, `lib/repo.ts` | `insertTxn`, offline SQL | 03, 04-A,E |
| P1A Atomic Import RPC | `supabase/migration_p1a_reality_loop.sql`, `lib/repo.ts` | `finalize_transaction_import_v1`, `finalizeTransactionImport` | 15, 16, 05, 17 |
| P1A Live Verification Gate | `docs/pto-audit-export/16_P1A_LIVE_VERIFICATION.md`, `scripts/p1a-browser-qa.mjs` | live RLS/RPC QA, browser screenshots | 16 |
| Duplicate detection | `engine/transactions.ts` | `excludeReason`, statistics | 01, 02, 08 |
| Merchant rules | `supabase/migration_p1a_reality_loop.sql`, `ReviewView.tsx` | `merchant_rules`, local recurring suggestions | 15, 09 |
| Recurring detection | `engine/transactions.ts` | `computeRecurring` | 01 |
| Recurring candidates (P1A) | `engine/realityLoop.ts`, `ReviewView.tsx`, `supabase/migration_p1a_reality_loop.sql` | `detectRecurringCandidates`, `recurring_items` | 15, 10 |
| Storage (cloud) | `lib/repo.ts`, `supabase/schema.sql` | all `upsert*` | 03, 07 |
| Storage (legacy local) | `store/persistence.ts` | `loadData`, `exportJSON` | 03, 07, 08 |
| Auth / devices | `auth/AuthGate.tsx`, `auth/DeviceManager.tsx`, `lib/devices.ts` | `ensureDeviceAuthorized` | 03, 07 |
| Settings | `SettingsView.tsx` | assumptions, theme, privacy | 01, 05 |
| Privacy | `SettingsView.tsx`, `format.ts` money() | `data.privacy` | 07, 10 |
| Export | `store/persistence.ts` | `exportJSON` (unwired) | 03, 04-I, 09 |
| Tests | `src/**/*.test.ts` | vitest | 08 |
| Design system | `index.css`, `components/fields.tsx`, `AppShell.tsx` | CSS vars, fields | 06, 07 |
| Types / schema | `types.ts`, `supabase/schema.sql` | FinanceData, tables | 03 |
| Format/i18n | `format.ts` | money, calendar labels | 02 |
| Debug | `debug/overflowGuard.ts` | mobile audit helper | 08 |

## Quick file map

```
src/types.ts                 —  domain model
src/engine/finance.ts        —  math primitives
src/engine/monthly.ts        —  long-range simulation
src/engine/daily.ts          —  short-range liquidity
src/engine/metrics.ts        —  KPIs + spend impact
src/engine/transactions.ts   —  historical analytics
src/engine/realityLoop.ts    —  CSV import / review / baseline / calibration engine
src/engine/actions.ts        —  action inbox rules
src/lib/repo.ts              —  Supabase DAL
src/store/store.tsx          —  finance mutations
src/store/transactions.tsx   —  txn loading
src/hooks/useDashboard.ts    —  today derived state
src/hooks/useProjection.ts   —  memoized projections
src/components/AppShell.tsx  —  navigation shell
src/components/ReviewView.tsx — P1A reality loop UI
supabase/migration_p1a_reality_loop.sql — P1A schema + RPC
```
