---
title: KENOS TRACK F — WORK CREATE/ARCHIVE PROJECT WRITERS
owner: kenpan
last_verified: 2026-07-20
status: RPC_CANARY_PASS — CLIENT_FLAGS_OFF
---

# Track F: Work project create / archive

## Migration

| Version | RPCs |
| --- | --- |
| `20260720200000` | `kenos_create_work_project_action`, `kenos_archive_work_project_action` |

Tip: **`20260720200000`**

## Canary

| Step | Result |
| --- | --- |
| Create project | PASS |
| Idempotent create | PASS |
| Embed canonical task body | PASS reject `work_must_not_embed_canonical_task` |
| Cross-user archive | PASS deny |
| Archive | PASS |
| Cleanup | PASS |

No Plan dual-write. Executor disabled.

## Next

CaptureEnvelope routing foundation; Assistant proposed Action (no auto-execute); domain Spaces inventory.
