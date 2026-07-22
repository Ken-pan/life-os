---
title: KENOS F5-05–07 — Combined Final Report
owner: kenpan
last_verified: 2026-07-21
doc_role: milestone-final-report
status: F5_05_07_PASS_LOCAL_READY_FOR_OWNER_REVIEW
---

# KENOS F5-05–07 — Sync Reliability · Performance/Observability · Knowledge-to-Action

## 1. Overall result

`F5_05_07_PASS_LOCAL_READY_FOR_OWNER_REVIEW`

## 2. Phase results

```
F5-05 RELIABILITY:               PASS_SYNC_RELIABILITY_LOCAL
F5-06 PERFORMANCE/OBSERVABILITY: PASS_OBSERVABLE_AND_BUDGETED
F5-07 KNOWLEDGE-TO-ACTION:       PASS_KNOWLEDGE_TO_ACTION_LOCAL
```

## 3. Git lineage

- **Source branch**: `kenos-f5-02-04` (base for this run).
- **New branch**: `kenos-f5-05-07` (created from `kenos-f5-02-04`).
- **Merge base** with `master`: `026eba560` (master tip = P5 Gate-1 tip).
- **P5 Gate-1 commits included?** YES — all 4 (`4b590f2cb`, `4a4e9821f`,
  `da9fb677e`, `026eba560`) are ancestors of `kenos-f5-02-04`, verified with
  `git merge-base --is-ancestor`.
- **All F5-02–04 commits included?** YES — 18 commits ahead of origin/master.
- **Local integrations performed**: none needed (linear history; nothing to
  cherry-pick or merge).
- **Push / merge?** NONE. 29 commits ahead of `origin/master`, all local.

Ancestry: `origin/master (d01f12ca3)` → P5 Gate-1 (4) → F5-02–04 (14) →
F5-05–07 (11) = `kenos-f5-05-07`.

## 4. What is now trustworthy (proven by code + tests)

- **No supported mutation is silently lost**: durable queue survives kill/
  relaunch; startup + foreground flush drains it (was only `online`-triggered);
  permanent rejections surface as actionable instead of burning retries silently.
- **Ambiguous success is idempotent** across retries and two clients (FI-1/FI-3).
- **Queued commands cannot cross accounts** (FI-5 + user-bound queue).
- **A rejected mutation leaves no partial state** (FI-2, atomic RPC).
- **Same idempotency key + different payload is rejected**, not silently dropped.
- **Activity list read is O(limit)** (covering index; measured ~10× at 2000 rows).
- **Logs never leak query-string content** (route values redacted) or secrets.
- **A user action is traceable end-to-end in the DB** by correlationId.
- **Operational failures have executable runbooks + a read-only health check.**
- **Real source material becomes a grounded, injection-safe, canonical Plan task**
  (11-assertion E2E), with dedup, cross-user isolation, and idempotent retry.

## 5. Sync state model

States: `LOCAL_DRAFT → QUEUED → SENDING → SERVER_CONFIRMED` (happy path);
failure branches `RETRYABLE_FAILURE`(auto ≤5) `→ DEAD_LETTER`, `AUTH_BLOCKED`
(reauth, no attempt burned), `CONFLICT` (manual), `REJECTED` (permanent, no
retry), `CANCELLED`. Durable owner = localStorage `kenos.plan.offlineIntentQueue.v1`
(user-bound; no tokens stored). Conflict policy: whole-row LWW by `updatedAt`
with 30-day soft-delete tombstones (destructive ops recoverable). Relaunch:
queue + Continue restore from localStorage, startup flush drains, canonical
re-fetch reconciles. Full table + module: F5-05 report §2.

## 6. Failure-injection evidence

20-scenario matrix in the F5-05 report §5. DB half (`failure_injection_tests.sql`,
FI-1..5) + queue/lifecycle unit tests (27) + LWW merge tests. All PASS. Each row
lists scenario / expected / actual / covered-by.

## 7. Performance results

| Journey | Env | Before | After | Budget | Status |
| --- | --- | --- | --- | --- | --- |
| activity list (2000 rows) | local PG17 | 0.412 ms, scan-all + sort | 0.041 ms, index scan of limit | ≤200 ms p50 | OK (~10×, O(limit)) |
| portal_today_summary (500 tasks) | local PG17 | — | 0.33 ms | ≤200 ms p50 | OK |
| aios web JS bundle | build | — | 2.69 MB | ≤4 MB | OK |
| planner web JS bundle | build | — | 0.81 MB | ≤2 MB | OK |

All local clean-room measurements (labeled). iOS cold-launch benchmark is an
owner gate (needs device automation); existing smoke p50 = 447 ms.

## 8. Observability

- **Trace**: correlationId flows client→idempotencyKey→outbox→activity; DB
  trace query in F5-06 report §3 answers "committed? Activity produced?".
- **Log fields**: timestamp, level, category, app/version/build, route(safe),
  file/function/line, metadata. **Redacted**: bearer/token/JWT/`sb_*`/`sk-*`/
  email + query-string VALUES. Redaction test added.
- **Error taxonomy**: one canonical set (`kenosErrorTaxonomy.js`) both read/write
  classifiers map into; each category has retryable/needsAuth/recovery.
- **Health**: `scripts/kenos-health-check.mjs` (DB, 7 RPCs, 3 indexes, RLS).
- **Runbooks**: `docs/ops/kenos-core-loop-runbooks.md` (12).

## 9. Knowledge-to-Action architecture

Source → normalize → extract → proposal → Approval(R1) → canonical Plan →
Activity → Continue. Every stage's owner/storage/authz/idempotency/failure/
privacy in F5-07 report §1. Built on the existing capture→convert→plan canonical
path; extraction is deterministic + injection-immune.

## 10. Prompt-injection evidence

F5-07 report §3: 4 attacks (ignore-instructions, exfil, self-approve, delete-all)
— all denied; enforcement = deterministic extractor (no tool access) +
`authorizeProposalMaterialization` (R1/plan-only, source cannot raise risk) +
F5-03 egress guard. Regression: `knowledgeExtraction.core.test.js` +
`knowledge_to_action_e2e.mjs` K2A-7.

## 11. End-to-end product evidence

`scripts/kenos-cleanroom/knowledge_to_action_e2e.mjs` — 11/11: source capture w/
provenance → grounded proposal (cites source) → accept → canonical Plan task →
task on canonical path (owner-visible) → Activity (no source leak) → dedup →
injection-safe → cross-user rejected → relaunch persist → idempotent retry.
Web+iOS convergence: same web bundle in WKWebView → same Supabase (P5 proven).

## 12. Tests and commands

```
# reliability + security + knowledge, one real-DB pass:
supabase start && scripts/kenos-cleanroom/replay.sh
  → 32 migrations, RLS T1-14, RPC R1-6, FI-1-5, K2A-1-10  ALL PASS
npx vitest run (apps/planner)          → 227 pass (lifecycle 6, queue 18, LWW)
npm test -w aios-os                    → 322 pass (knowledge extraction 7)
npm test -w @life-os/platform-web      → pass (error taxonomy, log redaction)
node scripts/kenos-health-check.mjs    → OK
node scripts/check-kenos-perf-budgets.mjs → OK
bash scripts/verify-kenos-refactor.sh  → all deterministic gates PASS
```
No skipped tests. No mocked persistence in the final K2A proof (real Postgres).

## 13. Local commits (F5-05–07, on `kenos-f5-05-07`)

```
7c2c65902 feat(sync): explicit mutation lifecycle — permanent rejections stop retrying
a54837eb8 fix(sync): flush queue on relaunch/foreground + payload-mismatch guard
8f8be2076 test(sync): F5-05 DB failure-injection suite
7010bbf2e docs(qa): F5-05 sync reliability report + 20-scenario matrix
2d4e08fe5 perf(db): covering index for kenos_plan_activity list read
17d8b1da6 fix(privacy)+perf: redact query values from logged routes; perf budgets
42b4db443 feat(observability): canonical error taxonomy + health check
6dbfbcbcc docs(ops): executable core-loop runbooks
10b372400 docs(qa): F5-06 performance & observability report
9b8dfb84f feat(knowledge): grounded Knowledge-to-Action on the canonical Plan path
c621fa207 docs(qa): F5-07 knowledge-to-action report
```

## 14. Remaining owner gates

| Gate | Decision | Recommended default | Risk | Next action | Rollback |
| --- | --- | --- | --- | --- | --- |
| Apply activity index to prod | approve additive index | apply | none (additive) | `scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260722060000_*.sql` | `drop index kenos_plan_activity_user_created_idx` |
| Push branch / open PR | approve push | hold until review | none local | `git push origin kenos-f5-05-07` | n/a |
| iOS cold-launch benchmark | wire device automation | defer | none | add to kenos-ios-stability | n/a |
| LLM extractor + local-vs-cloud AI policy | choose local-first | local, no silent cloud fallback | privacy | design behind existing contract | feature-flag |
| Calendar (R2) destination | enable only w/ secure connector + Approval | keep as proposal-only | external write | wire connector + Approval | flag off |
| F5-05/06 prior cutover gates | see F5-02 GATE A/B | apply drifted migrations | additive | F5-02 report §6 | forward-fix |

No production apply/deploy/push was performed.

## 15. Owner review checklist (~20 min)

- [ ] `git log --oneline origin/master..kenos-f5-05-07` — 29 commits, linear.
- [ ] `supabase start && bash scripts/kenos-cleanroom/replay.sh` → expect
      `...+ K2A SUITE: PASS` (32 migrations + RLS + RPC + FI + K2A).
- [ ] Skim F5-05 report §5 (20-scenario matrix) — accept the honest boundaries
      (double-click dedup, no version-conflict signal).
- [ ] Skim F5-06 report §1 (measured index win) + §7 (iOS launch owner gate).
- [ ] Skim F5-07 report §3 (injection evidence) — confirm extractor is
      propose-only and source cannot raise risk.
- [ ] Approve/defer the activity-index prod apply (§14) and the branch push.

## 16. Dogfood plan (3 days, ≤5 min/day)

**Day 1 — interrupted mutation + Knowledge capture**
- [ ] Turn on Airplane mode, complete a task, turn it off → task syncs, no dup.
- [ ] Paste a real note with a dated action item into Capture → open Inbox →
      accept the proposal → task appears in Plan with the right title/date.

**Day 2 — cross-client + rejected suggestion**
- [ ] Edit a task's title on Mac web; open iPhone → title converges.
- [ ] In a captured source, reject a proposed action → it does not become a task.

**Day 3 — accepted suggestion + Continue**
- [ ] Capture a webpage's text, accept one proposal → task created; kill+reopen
      the app → task persists, no duplicate.
- [ ] Use Continue → returns to the source/task; confirm it opens the right one.

If anything misbehaves: `node scripts/kenos-health-check.mjs` + the relevant
runbook in `docs/ops/kenos-core-loop-runbooks.md`.
