# NETWORK_ORIGIN_MAP — Kenos iOS Daily Beta

**Updated:** 2026-07-21T05:45Z
**network scope:** **LAN-DEPENDENT**

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
