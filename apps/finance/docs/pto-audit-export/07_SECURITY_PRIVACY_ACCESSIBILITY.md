# Security, Privacy, and Accessibility

## Privacy

| Area | Finding | Severity | Evidence | Risk | Recommended next action |
| --- | --- | --- | --- | --- | --- |
| Local-first | 财务数据存 Supabase 非纯本地 | High | `repo.ts`, README 矛盾 | 云泄露/误配置 RLS | 文档准确；审计 RLS |
| Browser storage | Auth token + theme in localStorage | Medium | `supabase.ts` storageKey | XSS→session theft | CSP review UNVERIFIED |
| Export | 无 UI 导出 | High | persistence 未用 | 用户无法备份 | Implement export |
| Deletion | 仅单笔 txn delete | Medium | HistoryView | 残留 PII | Account wipe flow |
| Masking | privacy 隐藏金额非商户 | Low | format money() | shoulder surfing partial | — |
| Merchant exposure | 明文存储 | Medium | transactions.merchant | sensitive | Optional alias |
| Logging | console.error 同步失败 | Low | store.tsx persist | 可能含错误详情 | Sanitize |
| Telemetry | 未见第三方 analytics | UNVERIFIED | grep 无 sentry | — | Confirm none |
| Cloud sync | 全部财务云存储 | High | architecture | provider trust | Encrypt at rest policy |

## Security

| Area | Finding | Severity | Evidence | Risk | Action |
| --- | --- | --- | --- | --- | --- |
| Secrets in repo | .env.example only | Low | .env.example | — | Keep gitignore |
| anon key in client | By design | Medium | VITE_SUPABASE_ANON_KEY | RLS must hold | Audit policies |
| Input validation | Number fields loose | Medium | fields.tsx | bad data | Server constraints |
| CSV injection | N/A no export CSV | — | — | — | — |
| JSON validation | normalizeData loose | Medium | persistence.ts | malformed import | Stricter schema if wire UI |
| XSS merchant names | React text escape default | Low | ledger render | low if no dangerouslySetInnerHTML | Audit imports |
| File upload limits | No upload UI | — | — | — | — |
| Dependencies | 0 npm audit vulns | Low | npm install | — | monitor |
| Error leakage | Login generic message | Low | AuthGate | — | OK |
| Backup file sensitivity | SQL batches in repo scripts | Medium | scripts/.txn-sql | dev data leak | gitignore batches |
| gen-txn-sql USER_ID | Hardcoded uuid in script | High | gen-txn-sql.mjs L9 | PII in tooling | env var + gitignore |
| Device limit bypass | Server trigger | Low | schema enforce_device_limit | client bypass prevented | OK |

## Accessibility

| Area | Finding | Severity | Evidence | Risk | Action |
| --- | --- | --- | --- | --- | --- |
| Keyboard nav | Tab buttons native | UNVERIFIED | button elements | — | Manual audit |
| Visible focus | CSS UNVERIFIED | UNVERIFIED | index.css | — | Test |
| Dialog focus trap | Drawers backdrop click close | UNVERIFIED | SpendImpactDrawer | focus escape | aria-modal audit |
| Sheet labels | aria-label on mobile tabs | Low | AppShell | OK partial | — |
| Form labels | fields.tsx label prop | Medium | most fields | OK | — |
| Table headers | Ledger 无 table 语义 | Medium | div ledger-row | SR structure | role=table or list |
| Color states | dot + text severity | Medium | TodayView | partial | — |
| Chart summaries | muted-note 部分 | Medium | ForecastView | incomplete | SR table |
| Contrast | UNVERIFIED | UNVERIFIED | theme vars | — | axe scan |
| Responsive | mobile tabbar, overflow guard | Medium | index.css, overflowGuard | horizontal scroll dev guard | OK trend |
| Screen reader | aria-current on nav | Low | AppShell | OK | — |
