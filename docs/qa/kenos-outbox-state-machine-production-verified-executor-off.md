---
title: KENOS OUTBOX STATE MACHINE — PRODUCTION_VERIFIED_EXECUTOR_OFF
owner: kenpan
last_verified: 2026-07-20
status: PRODUCTION_VERIFIED_EXECUTOR_OFF
---

# Outbox state machine (Executor Off)

| Check                                             | Result                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| enqueue on Plan create                            | PASS → `pending`                                                                     |
| Owner list                                        | PASS — pending items only for Owner                                                  |
| cross-user dead-letter                            | DENY `outbox_not_found`                                                              |
| Owner dead-letter pending → `dead_letter`         | PASS                                                                                 |
| dead-letter idempotent replay                     | PASS `duplicate=true`                                                                |
| `delivered` / `published` count                   | **0**                                                                                |
| Worker role cannot client-transition to published | contract: transition grant = `kenos_outbox_worker` only; client uses dead-letter RPC |

Allowed under Executor Off: enqueue · pending · dead_letter · list · retry metadata. Not exercised: external delivery.
