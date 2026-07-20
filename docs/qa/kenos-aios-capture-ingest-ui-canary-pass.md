---
title: KENOS AIOS CAPTURE INGEST — UI CANARY PASS
owner: kenpan
last_verified: 2026-07-20
status: UI_CANARY_PASS — PROD_OWNER_LIMITED_NEXT
---

# AIOS Capture Ingest UI Canary

| Item | Value |
| --- | --- |
| Canary deploy | `6a5dbd6d78f6c3d467eabcd8` |
| SHA | `854ed08e0…` |
| URL | https://aios-kenos-read-canary.netlify.app |

## UI smoke

| Step | Result |
| --- | --- |
| Owner session on canary | PASS |
| Quick Capture → text → 打开 Inbox | PASS |
| DB envelope `needs_review` | PASS (`e943ab48-…`) |
| Outbox pending `autoConvert=false` `executor=disabled` | PASS |
| Navigated to `/inbox#capture` | PASS |
| Cleanup | PASS |

## Next

Owner-limited production AIOS bake with Capture ingest ON (exact SHA). Rollback: `6a5dbab9…`.
