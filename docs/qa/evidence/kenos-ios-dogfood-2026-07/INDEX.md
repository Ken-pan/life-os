# Kenos iOS Daily Beta Stabilization — Dogfood

**Opened:** 2026-07-21T11:16:24Z
**Phase label:** `IOS DAILY BETA STABILIZATION`
**Does not close Phase 4.**

## Frozen status

```text
MAC WEB DAILY BETA: READY
IOS PERSONAL DAILY BETA: READY_LAN_PREFERRED_WITH_PRODUCTION_FALLBACK
OVERALL PERSONAL DAILY BETA: READY_LAN_PREFERRED_WITH_PRODUCTION_FALLBACK
IA MODEL: LOCKED
PHASE 4: EXIT_OPEN
ASSISTANT: IN-APP WEB / HYBRID
MACOS NATIVE CLIENT: FOUNDATION / EXIT_OPEN
```

## Scope

- Observability + LAN / entry reliability only
- No IA redesign, no APNs / TestFlight / App Group cutover, no push/deploy
- **UX framework waves A–D (code)** shipped 2026-07-21 — see `docs/qa/kenos-ios-ux-framework-2026-07-21.md` and `known-issues.md`. Does not claim LAN-free or Phase 4 close.
- **Shell Navigation v2** direction remains locked to IA; Space Shelf Active + Domain dock replace are in Daily Beta chrome now.

## Artifacts

| File                                         | Role                                           |
| -------------------------------------------- | ---------------------------------------------- |
| `DAILY_LOG.md`                               | Real-use diary (no fabricated days)            |
| `dogfood-events.jsonl`                       | Machine events (no tokens / emails / payloads) |
| `NETWORK_RECOVERY_REPORT.md`                 | LAN / Mac sleep-wake probes                    |
| `AUTH_STABILITY_REPORT.md`                   | Auth session honesty                           |
| `CONTINUE_STABILITY_REPORT.md`               | Continue / resume probes                       |
| `known-issues.md`                            | Open P0–P2 + UX wave status                    |
| `STABILIZATION_EXIT.md`                      | Exit criteria checklist (not yet PASSED)       |
| `../../kenos-ios-ux-framework-2026-07-21.md` | Waves A–D implementation record                |

## Next Owner action

Dogfood on 17 Pro for 3–7 real days. Agent only fixes P0/P1 from real use.
After Stabilization: prefer LAN → TestFlight → App Group/APNs, **or** schedule Navigation v2 if dual-bottom-nav pain dominates.
