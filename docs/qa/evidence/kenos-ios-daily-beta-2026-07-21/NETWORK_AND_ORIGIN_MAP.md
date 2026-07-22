# NETWORK_ORIGIN_MAP — Kenos iOS Daily Beta

**Updated:** 2026-07-21T16:30Z
**network scope:** **LAN-DEPENDENT** (dev) · **Production HTTPS + SW** (Phase 1 offline shell)

## Phase 1 — Offline Shell Boot (2026-07-21)

- Health probe failure no longer hard-gates WK when the surface already painted or origin is production `*.kenos.space` (Service Worker may serve cached shell).
- Non-blocking **Sync paused** banner replaces full-screen gate in those cases; **Use Production** / **Retry** remain available.
- `WKAppBoundDomains` (10 hosts) in iOS `Info.plist`; `limitsNavigationsToAppBoundDomains` only when the load host is **listed** (not every `*.kenos.space` / `*.netlify.app`). LAN/Tailscale HTTP Daily Beta unchanged.
- AIOS Service Worker: HTTPS-only registration; navigate fallback tries cached route then `/`.

### App-Bound host list (≤10)

`www.kenos.space`, `planner.kenos.space`, `fitness.kenos.space`, `finance.kenos.space`, `knowledge.kenos.space`, `music.kenos.space`, `home.kenos.space`, `health.kenos.space`, `kenos-www.netlify.app`, `portal.kenos.space`

Excluded: deprecated `aios.kenos.space`; per-app Netlify preview hosts (not production Continuity).

## Origins

| Surface | Origin | Process context |
| --- | --- | --- |
| Today / Assistant / Spaces / Inbox | `http://10.20.202.15:5219` | in-app WKWebView (`space.kenos.app.ios`) |
| Plan Continuity | `http://10.20.202.15:5188` | in-app Continuity WKWebView cover (`stayInApp`) |
| Training Continuity | `http://10.20.202.15:5190` | in-app Continuity WKWebView cover |
| Mac loopback | `http://127.0.0.1:*` | **forbidden** as iPhone origin |
| Cloud shell DNS | `aios.kenos.space` | unresolved — unused |
| Phone client IP | `10.20.202.6` | observed in Daily Beta access logs |

## Policy

- No public tunnel; no tokens in URL
- Continuity must not open external Safari for Daily Beta Plan/Training
- Leaving LAN → degraded / offline UI; recovery verified via `kenos-ctl` stop/start

## Honesty

Final claim: **NETWORK SCOPE: LAN-DEPENDENT** until a phone-reachable Owner canary replaces Mac LAN.
