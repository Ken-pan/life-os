---
title: KENOS CAPTURE ENVELOPE — INGEST + EXPLICIT PLAN CONVERT
owner: kenpan
last_verified: 2026-07-20
status: RPC_CANARY_PASS — AUTO_CONVERT_OFF
---

# CaptureEnvelope production writers

## Migrations

| Version | Capability |
| --- | --- |
| `20260720210000` | `kenos_capture_envelopes` + list + `kenos_ingest_capture_envelope_action` |
| `20260720220000` | `kenos_convert_capture_to_plan_task_action` (explicit user only) |

Tip: **`20260720220000`**

## Canaries

| Step | Result |
| --- | --- |
| Ingest → `needs_review` | PASS `autoConvert=false` |
| Idempotent ingest | PASS |
| Cross-user list | PASS 0 rows |
| Explicit convert → Plan create | PASS (task tombstoned after) |
| Silent auto-convert | Not implemented (by design) |

## Rules enforced

- Uncertain captures stay Inbox `needs_review`
- Convert requires user actor + explicit RPC
- Nested Plan create uses Kenos create writer (no Legacy dual-write path in RPC)
- Executor disabled on outbox payloads

## Not opened

- Capture → Work / Library auto routes
- Browser connector production writes
- Client UI bake flags
