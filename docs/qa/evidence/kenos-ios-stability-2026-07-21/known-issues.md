# known-issues — iOS Stability 2026-07-21

## P0

_None._

## P1

1. **LAN origin uses DHCP IP** (`http://10.20.x.x:5219`) — Mac IP change breaks phone until rebuild/Settings update. mDNS `.local` on this Mac resolves to loopback locally; not adopted without phone Bonjour proof.

## P1 fixed this lane

1. **Planner sync clobber of fresher REST mutations** — ISO `updatedAt` lost LWW to local numeric timestamps. Fixed via `coerceTimestamp` in `migrate.js`. Evidence: Flow A `PASS_DEVICE_SESSION_MUTATE` after rebuild.

## P2

- True Mac sleep/wake visual confirmation (Owner)
- iPhone Wi‑Fi toggle (Owner)
- Shelf / Quick Switch gesture metrics (Owner)
- 3-day natural dogfood OPEN
- Paper remains PARTIAL

## Environment

- NETWORK SCOPE: **LAN-DEPENDENT** (+ production fallback in Settings)
- Phase 4: EXIT_OPEN
