---
title: KENOS CAPTURE TO PLAN OWNER-LIMITED CANARY — PASS
owner: kenpan
last_verified: 2026-07-20
status: PASS — OWNER_LIMITED_OBSERVE
---

# Capture → Plan Owner-limited Canary

| Item             | Value                                                         |
| ---------------- | ------------------------------------------------------------- |
| Code SHA         | `be9a2cc8f3361cfb851943a4a4aac884116a4b40`                    |
| Canary deploy    | `6a5e32890e9a1a20cab61a80`                                    |
| Prod AIOS deploy | `6a5e3298a269f920f5314a01`                                    |
| Flags            | Capture ingest + convert ON; Owner emails only; READ_CANARY=0 |
| Executor         | disabled                                                      |
| Auto convert     | false                                                         |

## Evidence

### RPC path

| Check                                                 | Result                   |
| ----------------------------------------------------- | ------------------------ |
| ingest → needs_review                                 | PASS (`1c85bd76-…`)      |
| convert → plan task=1                                 | PASS (`e726c1fe-…`)      |
| capture status materialized + original text preserved | PASS                     |
| idempotent replay duplicate                           | PASS                     |
| cross-user convert deny                               | PASS `capture_not_found` |
| outbox pending convert                                | PASS                     |
| archive cleanup                                       | PASS                     |

### UI path (Owner session)

| Check                            | Result                                  |
| -------------------------------- | --------------------------------------- |
| Inbox lists Kenos Capture        | PASS                                    |
| Needs review shows 「转为 Plan」 | PASS                                    |
| Click convert                    | PASS (`8010afb2-…` → task `0bb9bed0-…`) |
| Exactly one Plan task            | PASS                                    |
| No auto second conversion        | PASS                                    |

## Observation bounds (next)

- Max 10 conversions / ≤5 per day / 1 pending
- Offline/bulk/Assistant auto Off
- Owner cohort only
