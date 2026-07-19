---
title: Kenos Phase 2 Read-only Integration QA
owner: kenpan
last_verified: 2026-07-19
status: read-only-integration-ready-no-production-cutover
---

# Kenos Phase 2 Read-only Integration QA

## Verdict

`READ_ONLY_INTEGRATION_READY`.

Today, Inbox and Activity retain repository-backed compatibility read sources. Approval now has an additive canonical v1 record, one canonical corpus shared by TypeScript/server/Swift, a review-only persistence/RPC artifact, disposable dual-user RLS/privilege proof and a real RPC-only Assistant adapter. Platform/System owns Approval lifecycle under `TEMPORARY_APPROVED_FOR_PHASE_2_APPROVAL_READ_MODEL`; Assistant only displays a projection. This verdict does not claim production apply, a public decision command or an Executor.

## Source evidence

| Surface | Source | Projection and safety evidence |
| --- | --- | --- |
| Today | `public.portal_today_summary` RPC | Read-only; Owner/source/freshness/deep links retained; stale/empty/permission/offline states visible |
| Inbox | pending `public.life_events` + `public.planner_tasks` references | Independent source settling, multi-source merge, sorting, dedupe, truncation, malformed/unknown downgrade, partial state |
| Approvals | review-only `public.kenos_action_approvals` + `public.kenos_list_action_approvals` | RPC-only projection; System owner, authenticated owner RLS, safe fields, effective expiry/supersession, no client write/decision/Executor |
| Activity | `public.life_events` compatibility source | Sorting, dedupe, truncation, failure visibility, unknown-event fallback and sensitive-field redaction |

## Automated coverage

- Canonical corpus covers nine valid Approval records and eleven invalid/transition/server-context cases. Zod, server validation and Swift Codable/transition tests consume that corpus; cross-language round-trip returns Swift output through Zod.
- Disposable Supabase applies the review SQL from scratch and proves owner A/B isolation, anonymous denial, client insert/update/delete denial, private writer boundary, service-role non-membership, fixed-search-path functions, effective expiry/supersession and rollback/reset.
- Projection tests cover RPC-only capability, pending/expired/superseded, stale/empty/partial/offline/permission/unavailable, malformed/unknown records, long-summary truncation, EntityRef minimization and zero Executor exposure.
- Slow-source tests prove one read does not erase or block already-settled sources.
- Portal route tests cover flag default Off, local opt-in, production-like host refusal without build flag, preserved membership filtering, Today/Assistant/legacy/fallback routing, query preservation and PWA start URL.
- The Phase 2 guard checks canonical Approval contract/corpus/Swift, review SQL/RLS/privileges, System owner metadata, real read RPC, no Assistant mutation/Executor or Activity/Outbox truth, dedicated shadow categories, Today/Portal count boundary, default-Off flag and doc/ledger status agreement.

## Browser matrix

| Scenario | Result |
| --- | --- |
| Desktop Today, no cloud auth | PASS — permission state shown; no fake production summary; final console 0 errors/0 warnings |
| Inbox, no cloud auth | PASS — permission state and zero rows |
| Approvals, no cloud auth | PASS — permission denied and no fake `0` |
| Canonical empty source | PASS — empty is distinct from unavailable |
| Pending / expired / superseded | PASS — status and fail-closed explanation visible; no decision control outside explicit demo |
| Stale / partial source | PASS — source warning retained while safe rows remain readable |
| Long summary / EntityRefs | PASS — wraps at desktop/mobile; raw business payload is absent |
| Activity, no cloud auth | PASS — permission state and no hardcoded feed |
| Explicit local `?kenosDemo=1` | PASS — visibly labelled local demo; session-only controls do not replace canonical projection |
| Offline refresh | PASS — offline state and safe retry affordance |
| Approval rehearsal + reload | PASS — request inspection shows no Supabase mutation, command handler or Executor call |
| Mobile 390×844 | PASS — bottom navigation, long content, focus order and touch targets usable |
| Keyboard / accessible labels | PASS — Today count has an unavailable/count label; links and demo-only controls are keyboard reachable |
| Today Approval count deep link | PASS — source unavailable renders `—`; available projection count links to `/approvals` |
| `/chat?return=%2Finbox#legacy` | PASS — `/assistant` with query/hash preserved |
| Unknown route | PASS — safe fallback; correct title; refresh/back/forward usable |
| Portal `?kenos=0/1`, unauthenticated | PASS — existing login surface retained; no auth/redirect loop |

Local screenshots are generated under ignored `output/playwright/` and are not product artifacts.

## Locked gates

No production database, migration/RPC apply, RLS/auth change, real approve/reject, Executor, writer cutover, deploy, DNS, Portal default/redirect/retirement, old-path deletion or Phase 3 action was performed. Production review still requires hosted RLS/advisors, function owner/worker identity, backup/change window, shadow thresholds, caller integration and explicit cutover approval. The temporary Approval ownership decision must be reviewed before real Executor integration.
