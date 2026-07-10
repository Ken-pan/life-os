# PR-2 Routing Fix Gate

## Status
**PASS** (production `/api/paper/*` now resolves to JSON functions instead of SPA HTML fallback).

## Routing inspection
- `apps/planner/netlify.toml` contains a SPA catch-all:
  - `/* -> /index.html 200`
- Source redirects:
  - `apps/planner/static/_redirects` **added** with API rules.
  - `apps/planner/public/_redirects` does not exist.
- Build output:
  - `apps/planner/build/_redirects` exists after build.
  - It contains API routes **before** `/* /index.html 200`.

## Final `_redirects` summary (publish output)
1. `/api/paper/mock/today -> /.netlify/functions/paper-mock-today`
2. `/api/paper/mock/actions -> /.netlify/functions/paper-mock-actions`
3. `/api/paper/mock/delta -> /.netlify/functions/paper-mock-delta`
4. `/api/paper/mock/heartbeat -> /.netlify/functions/paper-mock-heartbeat`
5. `/api/paper/today -> /.netlify/functions/paper-today`
6. `/api/paper/delta -> /.netlify/functions/paper-delta`
7. `/api/paper/actions -> /.netlify/functions/paper-actions`
8. `/* -> /index.html 200`

## Verification results

### Local (`netlify dev`)
- `GET /api/paper/mock/today` → `200`, `application/json`
- `GET /api/paper/today` (no auth) → `401`, `application/json`
- `GET /api/paper/today` with `$PAPER_DEVICE_TOKEN` could not be run in this shell because the variable is not exported locally.

### Production (`planner.kenos.space`)
- `GET /api/paper/mock/today` → `200`, `application/json`, JSON body.
- `GET /api/paper/today` (no auth) → `401`, `application/json`, JSON body `{"error":"unauthorized"}`.
- `GET /.netlify/functions/paper-today` returns HTML app shell; route access for clients should use `/api/paper/today`.

## Content-type and body checks
- `/api/paper/mock/today`: JSON ✅
- `/api/paper/today`: JSON ✅ (unauthorized response)
- No HTML fallback for `/api/paper/today` after routing fix ✅

## Environment and safety
- No token values printed.
- No `.env` or secrets committed.
- No write endpoints executed.
- Production env key values were not printed; prior project setup indicates `PAPER_DEVICE_TOKEN` and `PAPER_DEVICE_USER_ID` are configured in Netlify.

## Recommendation
Proceed with PR-2 merge/review. For a final authenticated 200-path validation, run one production probe with a valid bearer token from a secure shell:

`curl -i -H "Authorization: Bearer $PAPER_DEVICE_TOKEN" https://planner.kenos.space/api/paper/today`

