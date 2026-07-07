# Storage Path Hardening

> **v1.1:** Public bucket accepted for internal/bundle use (R-03).  
> **v1.2 target:** Hash-only public paths. **v2:** Private bucket + signed URLs.

## Current path (legacy)

```
{userId}/{source}/{orderId}/{sha1_16hex}.{ext}
```

**Risk:** Metadata leakage (`userId`, `source`, `orderId`) — not image content sensitivity.

## v1.2 — Hash-only public path (recommended next)

Set when uploading:

```bash
FINANCE_IMAGE_PATH_MODE=hash node apps/finance/scripts/link-purchase-orders.mjs ...
```

Produces:

```
{userId}/{sha1_full}.{ext}
```

Implemented in `apps/finance/scripts/lib/purchaseImageStorage.mjs` (`buildStoragePath`).

### Backfill note

Existing 249 `imageStoragePath` rows keep legacy paths until re-upload or migration script.
New applies should use `hash` mode after approval.

## v2 — Private bucket + signed URL

- Flip bucket `public = false`
- App fetches signed URLs server-side or via edge function
- Higher effort; required before **external consumer expansion** (P1-4)

## Decision matrix

| Scenario | Recommendation |
|----------|----------------|
| Finance OS UI only (current) | Legacy path acceptable (documented) |
| New scoped apply batches | `FINANCE_IMAGE_PATH_MODE=hash` |
| External API consumers | Private + signed URL (v2) |
| Keep public forever | **Not recommended** — metadata leakage persists |
