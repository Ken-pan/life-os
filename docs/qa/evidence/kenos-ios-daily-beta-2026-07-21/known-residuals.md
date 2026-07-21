# known-residuals.md

## Active READY gate

1. **Owner Auth on 17 Pro** — WKWebView LocalStorage has no `sb-*-auth-token` (2026-07-21T03:29Z). Blocks FLOW A/B/C and AUTH PASS. See `OWNER_ACTION_NEXT.md`.

## Not blockers for home-LAN shell reachability

1. **VoiceOver / Dynamic Type / Dark Mode / Wi‑Fi↔Cellular** — not owner-executed this slice.
2. **Account B isolation on phone** — blocked until Auth; Mac Continuity isolation remains valid in unit tests.
3. **Away-from-home** — LAN-DEPENDENT until phone-reachable canary origin exists (no public tunnel).
4. **Static LAN API** — `POST /api/ai/plan` → 501 (Python static has no Netlify functions).
5. **Node LAN serve** — broken by macOS Application Firewall; Python `kenos-ctl` is the supported LAN path.
6. **Pixel screenshots** — wireless CoreDevice cannot `idevicescreenshot`; traffic logs are evidence.
7. **CFBundleVersion display** — device still shows `20260721` until next install after `$(CURRENT_PROJECT_VERSION)` fix.

## P0/P1

**NONE** for signed install + Today/Spaces/Inbox/Settings/Planner/Fitness LAN Continuity + force-quit/offline recovery on Ken’s 17 Pro.
