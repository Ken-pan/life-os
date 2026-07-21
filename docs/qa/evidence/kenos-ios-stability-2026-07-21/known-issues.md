# known-issues — iOS Stability 2026-07-21

## P0

_None._

## P1

_None open._

### Closed

1. **LAN origin DHCP IP** — closed via mDNS `LocalHostName.local` + `KenosOriginResolver` (build `202607211735`).
2. **Planner sync clobber** — closed via `coerceTimestamp` (prior commit).

## P2 / Owner

- True Mac sleep/wake visual confirmation
- iPhone Wi‑Fi toggle
- True Mac reboot
- 3-day natural dogfood OPEN
- Paper remains PARTIAL
- Mac hostname rename → rebuild or Settings override (doctor reports host)

## Environment

- NETWORK SCOPE: **LAN-DEPENDENT** (stable hostname, not DHCP IP)
- Phase 4: EXIT_OPEN
