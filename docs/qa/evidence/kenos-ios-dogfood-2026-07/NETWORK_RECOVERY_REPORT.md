# NETWORK_RECOVERY_REPORT

**Opened:** 2026-07-21T11:16:24Z

## Day-0 automated probes

See `smoke/lan-probe-day0.json` (filled by script).

## Owner-assisted (not automatable without side effects)

| Scenario | Status |
| --- | --- |
| Mac sleep → wake | pending Owner |
| Wi‑Fi reconnect phone | pending Owner |
| Cellular mid-session | soft residual · pending |

## Requirements under test

- No white screen on origin miss
- Today retains last-known-good when possible
- Show last-updated (where UI already has it)
- Continue not wiped on brief outage
- Auto-retry when origin returns
- No random IP/port guessing

## Day-0 automated results (2026-07-21T11:17:35.074Z)

| Probe | OK | Class | ms |
| --- | --- | --- | --- |
| kenos_health | true | backend | 11 |
| kenos_loopback_health | true | backend | 8 |
| planner | true | backend | 27 |
| fitness | true | backend | 23 |
| bogus_port | false | network | 8 |

Cold launch: **PASS** (product/launched)

