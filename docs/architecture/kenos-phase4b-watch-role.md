---
title: Kenos Phase 4B watchOS daily role
owner: kenpan
last_verified: 2026-07-19
doc_role: phase4b-watch-role
status: temporary-approved-for-phase-4b-cross-device-daily-loop
---

# Kenos Phase 4B — watchOS daily role

> Local/simulator foundation only. No production APNs, OAuth, Executor, App Store/TestFlight, or Phase 5.

## Role

watchOS is a **companion surface of the single Kenos product** (not a second app brand). It owns high-frequency, low-cognition glances and short capture — never deep Work editing or long Assistant chat.

| In scope | Out of scope |
| --- | --- |
| Today glance | Full Assistant conversation |
| next Plan item | Project / Meeting / Decision editors |
| active Work deliverable | Library reading |
| Inbox / Approval counts + safe Approval detail | Production Connector |
| Quick Capture → companion transfer | Auto-approve high-risk Actions |
| Activity result glance | Second canonical store |
| offline / sync status | Production APNs |
| open-on-iPhone handoff | watchOS-only Task/Approval truth |

## Shared foundation (must reuse)

- `KenosContracts`, `KenosClient`, `KenosStore`, `KenosActions`, `KenosDesign`
- New thin packages: `KenosNotifications`, `KenosHandoff`
- Compact glances are **display mappings** from canonical projections — not transport truth
- Watch Quick Capture creates a local `CaptureEnvelope` / `CaptureDraft`, queues it, then companion-transfers to iPhone for review — never auto-creates Task/Project/Decision

## Product placement

- XcodeGen target `KenosWatch` under `clients/apple/Apps` (same Kenos project)
- Placeholder bundle ID: `space.kenos.app.ios.watch` (must prefix companion iOS ID; KR-P4B-TEMP-005)
- Embedded companion of `KenosIOS` where toolchain allows
- Health companion watch remains separate evidence/domain tool — not merged wholesale

## Distribution gates (explicit)

- Production Team / App Group / WatchConnectivity entitlements
- Production APNs credentials
- Critical alert entitlement (disabled by default; not requested this slice)
- TestFlight / App Store
