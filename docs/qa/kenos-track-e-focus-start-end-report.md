---
title: KENOS TRACK E — FOCUS START/END CONTEXT WRITERS
owner: kenpan
last_verified: 2026-07-20
status: RPC_CANARY_PASS — CLIENT_FLAGS_OFF
---

# Track E: FocusContext start / end

## Backup

`/tmp/kenos-focus-writer-backup-20260720T0517*` (pre tip `20260720180000`, focus rows 0)

## Migration

| Version | RPCs |
| --- | --- |
| `20260720190000` | `kenos_start_focus_context_action`, `kenos_end_focus_context_action` |

Tip: **`20260720190000`**

## Canary (Owner)

| Step | Result |
| --- | --- |
| Start deep_work context | PASS `active` |
| Idempotent start | PASS `duplicate=true` |
| Cross-user end | PASS deny `focus_not_found` |
| End completed | PASS |
| List read | PASS |
| Cleanup | PASS |

Outbox remains `executor=disabled`. Deferred / suggestions writers not opened.

## Next

Track F Work entity create (no Plan body dual-write).
