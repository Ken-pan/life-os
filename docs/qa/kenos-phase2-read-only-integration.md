---
title: Kenos Phase 2 Read-only Integration QA
owner: kenpan
last_verified: 2026-07-19
status: partial-pass-with-explicit-read-model-blockers
---

# Kenos Phase 2 Read-only Integration QA

## Verdict

`PARTIAL_PASS_WITH_EXPLICIT_READ_MODEL_BLOCKERS`.

Today, Inbox and Activity have real repository-backed read-only sources. Approvals intentionally reports `unsupported` because no deployed canonical Approval read model exists. This QA does not treat local demo fixtures, `life_events`, Outbox or Phase 1 review-only SQL as production Approval data.

## Source evidence

| Surface | Source | Projection and safety evidence |
| --- | --- | --- |
| Today | `public.portal_today_summary` RPC | Read-only; Owner/source/freshness/deep links retained; stale/empty/permission/offline states visible |
| Inbox | pending `public.life_events` + `public.planner_tasks` references | Independent source settling, multi-source merge, sorting, dedupe, truncation, malformed/unknown downgrade, partial state |
| Approvals | none deployed | `unsupported`, empty and fail closed; session rehearsal cannot call an Executor |
| Activity | `public.life_events` compatibility source | Sorting, dedupe, truncation, failure visibility, unknown-event fallback and sensitive-field redaction |

## Automated coverage

- Projection tests cover multi-source sorting, duplicate identity, stale/empty/error/malformed/unknown records, sensitive-field redaction, Approval risk/expiry boundary, Activity pagination and redacted shadow mismatch categories.
- Slow-source tests prove one read does not erase or block already-settled sources.
- Portal route tests cover flag default Off, local opt-in, production-like host refusal without build flag, preserved membership filtering, Today/Assistant/legacy/fallback routing, query preservation and PWA start URL.
- The Phase 2 guard checks route existence, owner metadata, real source names, unsupported Approval, no mutation/Executor calls, mismatch categories, Portal flag default and doc/ledger status agreement.

## Browser matrix

| Scenario | Result |
| --- | --- |
| Desktop Today, no cloud auth | PASS — permission state shown; no fake production summary; final console 0 errors/0 warnings |
| Inbox, no cloud auth | PASS — permission state and zero rows |
| Approvals, no canonical source | PASS — unsupported and zero production rows |
| Activity, no cloud auth | PASS — permission state and no hardcoded feed |
| Explicit local `?kenosDemo=1` | PASS — visibly labelled local demo; no persistence/Executor |
| Offline refresh | PASS — offline state and safe retry affordance |
| Approval rehearsal + reload | PASS — session-only; no command-handler/Supabase mutation request |
| Mobile 390×844 | PASS — bottom navigation, hierarchy and touch targets usable |
| `/chat?return=%2Finbox#legacy` | PASS — `/assistant` with query/hash preserved |
| Unknown route | PASS — safe fallback; correct title; refresh/back/forward usable |
| Portal `?kenos=0/1`, unauthenticated | PASS — existing login surface retained; no auth/redirect loop |

Local screenshots are generated under ignored `output/playwright/` and are not product artifacts.

## Locked gates

No production database, migration, RPC apply, RLS/auth change, writer cutover, deploy, DNS, Portal default/redirect/retirement, old-path deletion or Phase 3 action was performed. Resolving Approval requires explicit owner/security/product design; once a real read model exists, rerun this matrix with authenticated dual-user/hosted evidence before promoting the verdict.
