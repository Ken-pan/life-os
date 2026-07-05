# Test and QA Coverage

## Existing tests

| Test file | Area | Cases covered | Pass / fail | Gaps |
| --- | --- | --- | --- | --- |
| `engine/finance.test.ts` | 金融原语 | realReturn, futureCost, loan | **Pass** | — |
| `engine/monthly.test.ts` | 月引擎 | 结构、机会成本、CC 模式、surplus | **Pass** | goals, salaryGrowth |
| `engine/metrics.test.ts` | — | (in monthly/scenarios) | — | dedicated file 无 |
| `engine/scenarios.test.ts` | 情景 | partner, spend impact | **Pass** | — |
| `engine/dashboard.test.ts` | 日引擎+STS+actions | reserve CC, everydayOnCard, STS | **Pass** | — |
| `engine/transactions.test.ts` | 交易分析 | series, category, recurring | **Pass** | refunds in sample |
| `engine/calendar.test.ts` | 日历 | week bounds | **Pass** | — |
| `store/persistence.test.ts` | 迁移 | normalize, parse JSON | **Pass** | Supabase 无 |
| `format.test.ts` | 格式化 | money, labels | **Pass** | — |
| `debug/overflowGuard.test.ts` | 移动 overflow | horizontal report | **Pass** | — |

**Summary**：9 files, **70 tests, all pass** (2026-05-30).

## Build and runtime checks

| Check | Status | Notes |
| --- | --- | --- |
| npm install | **Pass** | 0 vulnerabilities |
| npm run test | **Pass** | 70/70 |
| npm run typecheck | **Pass** | tsc -b --noEmit |
| npm run lint | **Pass** (3 warnings) | react-refresh/only-export-components in store files |
| npm run build | **Pass** | chunk >500kB warning |
| Local preview | **UNVERIFIED** | 未启动 `npm run dev` 目视 |
| E2E / Playwright | **None** | — |

## Required regression tests

| Required test | Exists | File | Pass / fail | Missing cases | Priority |
| --- | --- | --- | --- | --- | --- |
| Aggregate accounts no double-count | Partial | dashboard.test net worth | Pass | duplicate named accounts | Medium |
| CC payments not lifestyle spending | Yes | transactions.test | Pass | — | — |
| Internal transfers not spending | Partial | sample only | Pass | explicit transfer row | Low |
| Refunds reduce spending | Partial | txnPayload logic | No test | refund row in series | Medium |
| Income increases cash flow | Yes | transactions.test net | Pass | — | — |
| Mirror duplicates not in analytics | Partial | statistics count | No dedicated | mirror row fixture | Medium |
| Balances not from incomplete txn history | Implicit | architecture | N/A | document | Low |
| STS excludes brokerage/HSA/retirement | Yes | dashboard.test | Pass | HSA type N/A | — |
| Revolving vs paid-in-full | Yes | monthly.test | Pass | — | — |
| Negative cash explicit state | Partial | negativeCash flag | No UI test | — | Medium |
| Forecast changes w/ recurring spend | Partial | monthly surplus | No explicit | expense-change event | Medium |
| Forecast changes w/ one-time spend | Yes | monthly.test purchase | Pass | — | — |
| Goal-delay stable | Yes | monthly.test | Pass | — | — |
| Inflation vs nominal distinguishable | Partial | finance.test | No chart test | — | Low |
| Import/export preserve data | Partial | persistence.test | Pass | Supabase roundtrip 无 | High |
| Clear local data removes PII | **No** | — | — | — | High |
| Merchant XSS/injection | **No** | — | — | — | Medium |
| STS uses goal.current for reserve | **No** | — | — | documents bug | **Critical** |
| computeSpendImpact STS = main STS | **No** | — | — | — | **Critical** |
