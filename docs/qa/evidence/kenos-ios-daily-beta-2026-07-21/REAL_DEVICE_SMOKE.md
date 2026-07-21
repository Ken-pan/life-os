# REAL_DEVICE_SMOKE

Device unlocked · Local Network granted · Mac LAN origin up.

## Automated / access-log proven

| Flow | Expected | Actual |
| --- | --- | --- |
| Cold launch | App starts to Today shell | PASS (`devicectl launch`) |
| Today | GET `/` from phone | PASS `10.20.202.6` |
| Assistant | GET `/assistant` | PASS |
| Inbox | GET `/inbox` | PASS |
| Spaces | Tab / payload to `/spaces` | PARTIAL (tab wired; fewer access lines than Today) |
| Planner | Open `:5188` | PASS (full SPA asset tree) |
| Fitness | Open `:5190` | PASS (SPA + `c_bench.jpg`) |
| Force quit → reopen | Launch after SIGKILL | PASS |
| Offline → online | Mac stop/start; phone refetch | PASS |

## Owner interactive (remaining)

- Continue card → correct Planner task / Fitness set
- Duplicate Continue tap launches once
- Account B isolation
- Wi‑Fi → Cellular
- Dark Mode / Dynamic Type / VoiceOver button names / 44pt targets visual confirm

## Residual API

Planner `POST /api/ai/plan` → **501** on static Python server (no Netlify functions locally). SPA + Supabase client paths still load; AI plan endpoint is residual for LAN static mode.
