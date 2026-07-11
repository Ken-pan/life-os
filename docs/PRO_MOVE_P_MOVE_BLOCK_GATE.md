# P-MOVE-BLOCK — Production Paper API Gate

**Status:** PASS WITH WARN — manual recovery is live; durable Git deployment confirmation remains pending.  
**Date:** 2026-07-11  
**Scope:** Restore production delivery of the existing Planner Paper Netlify Functions. No API, routing, function-source, device, or data changes.

## Baseline

- Worktree baseline: `951c51791d8d344cbb4a65decf06016f1b3284a3`.
- Active production deploy before the repair: `6a517552fc0d5f00086a63fc` (Git deploy for that commit).
- Its `available_functions` metadata was empty.
- Unauthenticated `GET /api/paper/today`, `GET /api/paper/delta`, and `GET /api/paper/actions` each returned `404 text/html` with a Netlify error page.

## Local Build and Manifest

`npm run build:planner` passed. The only output was an existing Svelte accessibility warning in `packages/platform-web`.

The app build does not itself bundle functions. Netlify local build exposed the root cause: `apps/planner/netlify.toml` resolved `netlify/functions` from the repository root and reported that directory missing. The repository-supported targeted deployment path supplies `--functions=netlify/functions`; its local equivalent was verified with:

```bash
CI=1 npx netlify functions:build --filter planner-os \
  --src apps/planner/netlify/functions \
  --functions apps/planner/.netlify/functions
```

The generated manifest contained `paper-today`, `paper-delta`, `paper-actions`, `paper-mock-today`, `paper-mock-delta`, `paper-mock-actions`, and `paper-mock-heartbeat`, with their declared `/api/paper/*` paths. `apps/planner/static/_redirects` already declares those paths before the SPA fallback; it was not changed.

## A. Manual Production Recovery

Exact deployment command:

```bash
CI=1 npx netlify deploy --prod --no-build --filter planner-os \
  --dir=apps/planner/build --functions=netlify/functions \
  --site=82a6cadc-03f9-443c-85f7-26bd4a90f83f
```

- New active production deploy: `6a51a55681a6819849ee315b`.
- State: `ready`; context: `production`.
- Its deployed `available_functions` lists all required Paper functions and routes, plus the unrelated existing Planner functions.

| Request | Status | Content-Type | Redacted body shape | Result |
| --- | --- | --- | --- | --- |
| `GET /api/paper/today` | 401 | `application/json` | `{"error":"unauthorized"}` | Function auth boundary |
| `GET /api/paper/delta` | 401 | `application/json` | `{"error":"unauthorized"}` | Function auth boundary |
| `GET /api/paper/actions` | 405 | `application/json` | `{"error":"method_not_allowed"}` | Function method boundary |
| `POST /api/paper/actions` | 401 | `application/json` | `{"error":"unauthorized"}` | Function auth boundary |

The JSON content type, function-specific error shapes, CORS header, and non-404 responses prove these requests are no longer served by the SPA or an HTML Netlify fallback. No authentication token was used or logged.

## Rollback

If a rollback is required, restore the prior function-bearing Planner deploy `6a51755e8ede62d51d12c7ea` from Netlify's deploy history, then repeat the unauthenticated matrix above. CLI form (do not run unless rollback is needed):

```bash
netlify api restoreSiteDeploy --data \
  '{"site_id":"82a6cadc-03f9-443c-85f7-26bd4a90f83f","deploy_id":"6a51755e8ede62d51d12c7ea"}'
```

## B. Durable Continuous-Deployment Correction

The manual deployment used `--functions=netlify/functions`, but the prior Git
deploy did not. The active Netlify site uses repository base directory `/` and
package directory `apps/planner`; it selects `apps/planner/netlify.toml`.
Before this correction, that selected file used `directory = "netlify/functions"`,
which resolved to the nonexistent repository-root path `netlify/functions`.

The root `netlify.toml` already used the correct repository-relative path but
is not the configuration file selected for this package deploy. The durable
fix changes only the selected Planner config to
`apps/planner/netlify/functions`.

## C. Preview Evidence

PASS — normal configuration was verified without a `--functions` override:

```bash
CI=1 npx netlify build --filter planner-os
CI=1 npx netlify deploy --no-build --filter planner-os \
  --dir=apps/planner/build \
  --site=82a6cadc-03f9-443c-85f7-26bd4a90f83f
```

- The normal monorepo build selected `apps/planner/netlify.toml`, packaged
  `apps/planner/netlify/functions`, and generated a manifest with every
  required Paper function.
- Draft deploy: `6a51a775c4b21fa873d3a251` (`ready`, `deploy-preview`).
- Its `available_functions` contains `paper-today`, `paper-delta`,
  `paper-actions`, `paper-mock-today`, `paper-mock-delta`,
  `paper-mock-actions`, and `paper-mock-heartbeat`.
- Preview endpoint matrix: `GET today` 401 JSON unauthorized; `GET delta` 401
  JSON unauthorized; `GET actions` 405 JSON method-not-allowed; `POST actions`
  401 JSON unauthorized.
- The active production deploy remained `6a51a55681a6819849ee315b` throughout
  preview validation.

## D. Remaining Production Confirmation

Do not replace the recovered production deploy in this gate. After the draft
passes and this branch is merged, a normal Git-driven Planner production build
must be verified to contain the same functions before changing this status to
PASS. This gate does not validate a device-authenticated 200 response; that
remains the physical-device gate.
