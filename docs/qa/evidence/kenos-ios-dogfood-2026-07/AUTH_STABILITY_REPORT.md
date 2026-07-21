# AUTH_STABILITY_REPORT

**Opened:** 2026-07-21T11:16:24Z  
**Day-0:** setup probes only — not a multi-day claim.

## Rules

- Do not log tokens, full emails, or session payloads
- Auth initializing ≠ logout

## Day-0

| Check | Result | Class |
| --- | --- | --- |
| App launches without auth wipe | pending real use | — |
| Lock/unlock preserves session | pending real use | — |
| Force-quit preserves session | pending real use | — |

See READY-gate isolation PASS in `kenos-ios-daily-beta-2026-07-21` for baseline; stabilization tracks regressions only.
