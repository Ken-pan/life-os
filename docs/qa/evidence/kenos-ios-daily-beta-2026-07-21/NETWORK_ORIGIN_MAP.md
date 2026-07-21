# NETWORK_ORIGIN_MAP — Kenos iOS Daily Beta

**run_id:** `ios-daily-beta-2026-07-21T03:27Z`
**HEAD SHA:** `d8ec099ca92055bda74bc0b41bacc5708b303348`
**network scope:** **LAN-DEPENDENT** (not anywhere daily driver)

## Origins

| Surface | Origin | Notes |
| --- | --- | --- |
| Kenos shell (Today / Spaces / Inbox / Settings) | `http://10.20.202.15:5219` | Mac Daily Beta Python static (`KENOS_STATIC_BIND=0.0.0.0`) via `kenos-ctl` |
| Plan / Planner | `http://10.20.202.15:5188` | opened from Continuity / payload-url |
| Training / Fitness | `http://10.20.202.15:5190` | opened from Continuity / payload-url |
| Mac loopback (Mac only) | `http://127.0.0.1:5219` | **forbidden** as iPhone origin |
| Cloud shell DNS | `aios.kenos.space` | unresolved — not used this slice |
| Phone client IP observed | `10.20.202.6` | same private LAN |

## Policy

- No public tunnel
- No unauthenticated `0.0.0.0` beyond trusted private LAN already used by Mac Daily Beta
- No tokens in URL
- Fixed LAN address (en0) + launchd/`kenos-ctl` stable serve
- Leaving LAN → honest degraded / offline UI required (verified stop/start recovery)

## Honesty

Final Daily Beta claim for iOS must read **LAN-DEPENDENT** until a phone-reachable Owner canary origin replaces Mac LAN.
