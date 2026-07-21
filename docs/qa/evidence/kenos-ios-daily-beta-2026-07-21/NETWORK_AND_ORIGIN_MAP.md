# NETWORK_AND_ORIGIN_MAP

## Priority decision

1. Cloud private origin `https://aios.kenos.space` — **DNS fail** (not used).
2. Existing private network — N/A beyond LAN.
3. **Secure LAN + private bind** — **SELECTED** for iOS Daily Beta.
4. PWA — emergency fallback only (not PASS).

## Origins

| Surface | Origin | Bind | Phone reachable |
| --- | --- | --- | --- |
| Kenos shell (AIOS) | `http://10.20.202.15:5219` | `0.0.0.0` via Python static | YES (`10.20.202.6`) |
| Planner | `http://10.20.202.15:5188` | same | YES |
| Fitness | `http://10.20.202.15:5190` | same | YES |
| Mac loopback | `http://127.0.0.1:5219` | health OK | **NO on iPhone** |

## Server note

Node `serve-static.mjs` accepts TCP on LAN IP but returns empty HTTP on this Mac (Application Firewall interaction). Daily Beta control plane now serves with `serve-static.py` (Python) for LAN + loopback.

## Constraints honored

- No insecure public tunnel
- No random ephemeral ports for daily entry (fixed 5219/5188/5190)
- No requirement to start Vite daily (`kenos-ctl` LaunchAgents)
- Mac must be on + `kenos-start` healthy for iPhone home use
- Away-from-home without Mac LAN / without aios DNS → honest degraded UI in app
