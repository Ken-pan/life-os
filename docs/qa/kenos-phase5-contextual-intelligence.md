# Kenos Phase 5 — Contextual Intelligence QA

Date: 2026-07-19  
Verdict target: `PARTIAL_PASS_CONTEXTUAL_INTELLIGENCE_READY_WITH_PRODUCTION_GATES`

## Scope exercised

| Surface | Training Focus | Deep Work Focus | Notes |
| --- | --- | --- | --- |
| Web AIOS | `/spaces/training` → `/focus` | `/spaces/work` → `/focus` | Global nav hidden while active; return banner on leave |
| iPhone | Spaces → Start Training Focus | Spaces → Start Deep Work Focus | Tab bar hidden in session |
| iPad/Mac | Same IA | Menu Start/End Focus | Sidebar hidden while active |
| Watch | Training Focus glance | — | No Work/Money/Home counts while active |

## Behavioral checks

- [x] Single foreground Focus — second start fails closed
- [x] Legal transitions + temporarily_left → return
- [x] Work/Money/Home deferred during Training; no deferred badge anxiety
- [x] Health safety always_allow
- [x] Scoped Assistant denies proactive cross-domain; explicit cross-domain marked
- [x] Suggestions include whyNow / rationale / impact / approvalRequirement
- [x] Intervention budget caps non-urgent suggestions
- [x] R4 fail closed
- [x] End summary restrained; deferred released carefully (no dump)
- [x] No ProductionExecutor / autoApproveAll / production APNs in Focus code
- [x] `?kenosDemo=1` behavior preserved elsewhere; Focus UI avoids tech jargon

## Commands

```bash
node packages/contracts/scripts/kenos-focus.test.mjs
node --test apps/aios/src/lib/kenos/focusStore.test.js
node scripts/check-kenos-phase5.mjs
npm run check -w aios-os
# Apple (signing off)
xcodebuild -project clients/apple/Apps/Kenos.xcodeproj -scheme KenosIOS -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project clients/apple/Apps/Kenos.xcodeproj -scheme KenosMac -configuration Debug \
  CODE_SIGNING_ALLOWED=NO build
```

## Production gates (remaining)

- no production notification delivery
- no real Apple Focus entitlement wiring
- no production Executor / Approval decisions
- Watch ↔ phone Focus state not shared via App Group yet
- no deploy / push / writer cutover

Honesty: local proactive simulation ≠ production proactive intelligence.
