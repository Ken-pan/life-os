---
title: Kenos Phase 6 — Observability, shadow, canary, rollback
owner: kenpan
last_verified: 2026-07-19
status: stage-a-plan
---

# Observability / shadow / canary / rollback

## Metrics (Wave 1+)

| Signal | Owner | Alert idea |
| --- | --- | --- |
| Action latency / errors | Platform | p95 + error rate |
| Policy reject rate | Platform | spike vs baseline |
| Outbox backlog / retries / dead-letter | Platform | backlog > N |
| RLS denials | Platform | unexpected surge |
| Auth/session failures | Platform | surge |
| Shadow mismatch rate | Platform | blocking vs warning classes |
| Read-source unavailable rate | App surfaces | honesty regressions |
| Offline queue terminal failures | Apple/Web | >0 for canary users |
| Connector errors | Integration | per-connector |

## Must not log

tokens, secrets, cookies, raw sensitive conversations, full medical/finance payloads, unredacted Connector bodies.

## Shadow comparison

Independent sources only:

```text
legacy source  vs  Kenos source
```

Blocking mismatches: data loss, cross-user, owner mismatch, duplicate canonical writes, wrong completion/Approval, security/redaction failures.

Warning: stale delay, ordering, optional display fields.

Reuse: `docs/ops/kenos-phase1-writer-cutover.md` simulation patterns; Portal/AIOS shadow helpers — **do not self-compare**.

## Cutover waves (approval-gated)

| Wave | Scope | Approval |
| --- | --- | --- |
| 1 | Hosted schema + RLS + read RPC; **no writer cutover** | `APPROVE_KENOS_PRODUCTION_WAVE_1` |
| 2 | Internal Action canary | `APPROVE_KENOS_PRODUCTION_WRITER_CANARY` |
| 3 | Web default path / limited Portal flag | separate phrase / owner note |
| 4 | Apple hosted sync (dev/beta) | separate |
| 5 | Portal default switch | separate |
| 6 | Connector expansion (read/Capture) | separate |
| 7 | Legacy writer retirement | `APPROVE_KENOS_LEGACY_WRITER_RETIREMENT` |
| Dist | Apple distribution | `APPROVE_KENOS_APPLE_DISTRIBUTION` |

## Canary progression

```text
internal owner → allowlist → controlled % → broader
```

Abort: disable flag, stop worker, restore legacy writer policies if needed, **preserve** new records, reconcile, incident report. Never delete new data to roll back.

## Estimated Wave 1 impact

| Item | Estimate |
| --- | --- |
| Downtime | none expected (additive DDL) |
| User-visible | none if clients not switched |
| Blast radius | new empty Kenos tables + RPCs; Planner unchanged until revoke |
| Rollback | leave tables; disable RPCs grants; no Task rewrite |
