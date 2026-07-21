# Kenos iOS Daily Beta Stabilization — Dogfood

**Opened:** 2026-07-21T11:16:24Z  
**Phase label:** `IOS DAILY BETA STABILIZATION`  
**Does not close Phase 4.**

## Frozen status

```text
MAC WEB DAILY BETA: READY
IOS PERSONAL DAILY BETA: READY_LAN_DEPENDENT
OVERALL PERSONAL DAILY BETA: READY_LAN_DEPENDENT
IA MODEL: LOCKED
PHASE 4: EXIT_OPEN
ASSISTANT: IN-APP WEB / HYBRID
MACOS NATIVE CLIENT: FOUNDATION / EXIT_OPEN
```

## Scope

- Observability + LAN / entry reliability only
- No IA redesign, no APNs / TestFlight / App Group cutover, no push/deploy
- **Shell Navigation v2** (Domain dock replace + Space Shelf) = `APPROVED_DIRECTION` only — `docs/qa/kenos-shell-navigation-v2-2026-07-21.md`. Do not implement during dogfood.

## Artifacts

| File | Role |
| --- | --- |
| `DAILY_LOG.md` | Real-use diary (no fabricated days) |
| `dogfood-events.jsonl` | Machine events (no tokens / emails / payloads) |
| `NETWORK_RECOVERY_REPORT.md` | LAN / Mac sleep-wake probes |
| `AUTH_STABILITY_REPORT.md` | Auth session honesty |
| `CONTINUE_STABILITY_REPORT.md` | Continue / resume probes |
| `known-issues.md` | Open P0–P2 |
| `STABILIZATION_EXIT.md` | Exit criteria checklist (not yet PASSED) |

## Next Owner action

Dogfood on 17 Pro for 3–7 real days. Agent only fixes P0/P1 from real use.  
After Stabilization: prefer LAN → TestFlight → App Group/APNs, **or** schedule Navigation v2 if dual-bottom-nav pain dominates.
