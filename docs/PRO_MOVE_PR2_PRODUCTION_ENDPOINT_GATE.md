# PR-2: Production Endpoint Deploy Gate

## Status
**WARN / Option B Satisfied** (Exact deployment/routing/env blocker is documented with the next required fix).

## Details

- **Route files found:** Yes, `apps/planner/server/paperService.mjs`, `apps/planner/netlify/functions/paper-actions.mjs`, `paper-today.mjs`, and `paper-delta.mjs` exist in the `master` branch and properly export a Netlify function handler with `export const config = { path: '/api/paper/...' };`.
- **Redirect config found/added:** Not needed/applicable. Netlify v2 functions automatically mount to the path specified in `export const config = { path: '...' };`. We verified `netlify.toml` maps the functions directory correctly.
- **Local endpoint statuses:** `http://localhost:8888/api/paper/today` returns `401 Unauthorized` with JSON `{"error":"unauthorized"}` when supplied with the test token, confirming the endpoint routes correctly locally.
- **Production endpoint statuses:** `https://planner.kenos.space/api/paper/today` returns **HTTP 200** but the body is **HTML** (the SvelteKit `index.html` fallback), not JSON.
- **Content-Type verification:** Production returned `text/html; charset=UTF-8`, whereas local returned `application/json`.
- **Environment variables:** The user confirmed `PAPER_DEVICE_TOKEN` and `PAPER_DEVICE_USER_ID` are set in the Netlify UI. No secrets were printed or committed. No writes were enabled.

## Blocker
The production deployment at `planner.kenos.space` is successfully serving the SvelteKit app, but the Netlify Functions (specifically `paper-today.mjs` and `paper-delta.mjs`) are not being invoked for the `/api/paper/*` routes. Instead, SvelteKit's catch-all routing (`/* -> /index.html`) is intercepting the request and returning the SPA fallback HTML.

This usually happens when:
1. The recent commit containing `paper-today.mjs` hasn't fully deployed to production yet.
2. The `export const config = { path: '/api/paper/today' }` syntax is being overridden or ignored by the SvelteKit adapter/build process, requiring an explicit `[[redirects]]` rule in `netlify.toml` (e.g., `from = "/api/paper/*" to = "/.netlify/functions/paper-:splat" status = 200`) before the `/* -> /index.html` rule.

## Next Step Recommendation
Modify `apps/planner/netlify.toml` to include explicit `[[redirects]]` for the `/api/paper/*` routes pointing directly to the compiled `/.netlify/functions/` paths, ensuring they take precedence over the SPA catch-all rule, and deploy the fix to production.