---
title: KENOS PORTAL RETIREMENT INVENTORY
owner: kenpan
last_verified: 2026-07-20
status: INVENTORY_COMPLETE — REDIRECT_NOT_STARTED
---

# Portal retirement inventory (no DNS/redirect yet)

Production: `https://portal.kenos.space` (`portal-ken`). Seven-site `stop_builds=true` remains.

## Duties → new Owner

| Duty | Current path | Target Owner | Disable-now risk |
| --- | --- | --- | --- |
| SSO login UI | `PortalUnauth.svelte` + `@life-os/sync` SSO | Shared sync + AIOS login surface | High |
| Unauthorized soft landing | `authController.redirectToPortal()` | AIOS/Kenos landing (must replace hardcode first) | High |
| App launcher cards | `+page.svelte` / `apps.js` | AIOS Spaces | High |
| Recent / default app | `portalPreferences.svelte.js` / `core_*` | Kenos default intent | Medium |
| ⌘K deep links | `commandPaletteActions.js` | AIOS command palette | Medium |
| Pending badge | `portalActionBadge.js` → Planner Inbox | AIOS Approvals + Planner Inbox | Medium-high |
| Today summary cards | `portal_today_summary` RPC UI | AIOS Today (already reads same RPC) | Medium |
| Home path compat | `hooks.server.js` → home.kenos.space | Home | Low-medium |
| PWA install guide | `PortalPwaGuide.svelte` | Kenos install strategy | Low-medium |

## Hard blockers before redirect

1. Replace `packages/sync` `redirectToPortal()` / `getPortalOrigin()` with Kenos-owned landing.
2. AIOS Spaces must cover launcher destinations.
3. Deep-link SSOT migrated.
4. Observation window on traffic after soft redirect.
5. Keep rollback DNS + deploy.

## Explicitly not done this slice

- No Portal deploy
- No DNS change
- No permanent delete
- No `redirectToPortal` behavior change in production sync

## Next safe steps

1. AIOS launcher/deep-link parity behind flag
2. Soft-redirect canary host (exact SHA) only after parity smoke
3. Then observe → stop primary entry → archive
