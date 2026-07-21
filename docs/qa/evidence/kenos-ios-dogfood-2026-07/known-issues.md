# known-issues — Stabilization

## P0

_None known at Day-0 open._

## P1

_None known at Day-0 open._

## P2 (non-blocking · from Owner review)

1. iOS top chrome feels like system console (history / search / grid / settings capsule) — defer redesign
2. Today content density / whitespace — observe during dogfood; do not pack cards
3. Assistant = IN-APP WEB / HYBRID — not Fully Native
4. Settings Diagnostics section labeled (2026-07-21 UX wave) — still denser than consumer Settings; further trim later
5. ~~**macOS board = Web desktop viewport**~~ — **mitigated (dogfood)**: KenosMac Command Center sidebar + Kenos Mode AIOS shell WK + Domain Continuity WK + Command Bar (⌘⇧Space) + Menu Bar Focus/Approvals/Capture + unreachable recovery. Not App Store / notarization READY; Mac Web Daily Beta remains valid fallback.
6. ~~**Dual bottom nav**~~ — **mitigated**: native Domain Dock; Plan BottomNav/FAB not mounted under `iosNativeShell`; platform FAB hide CSS; `activeTab` → dock sync via navManifest.
7. ~~**LAN-dependent Daily Beta**~~ — **mitigated**: auto/manual fallback to production `*.kenos.space` when LAN probe fails (Settings toggle default ON). Residual: production may lag Daily Beta features; use Retry LAN for companion dogfood.

## Environment

- NETWORK SCOPE: **LAN-PREFERRED + PRODUCTION FALLBACK** (cellular / Mac sleep → `aios.kenos.space` + domain production origins)

## UX framework waves (2026-07-21 code)

| Wave              | Status                | Notes                                                                                                 |
| ----------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| A Availability    | READY (prod fallback) | Domain/shell probe; `openContinuity`; LAN→production fallback default ON                              |
| B Chrome contract | READY                 | activeTab→dock (Training/Money/Music/Health); FAB/`lib-top-fab`/Timer; Paper stub dock                |
| C Live context    | READY                 | Live Accessory 4+ sources; Shelf Active / Recent / All Spaces                                         |
| D System presence | foundation READY      | BugReport attachLogs ON; Shelf Dynamic Type; App Intents; ActivityKit/APNs still Owner flip           |
| Opt pass          | READY                 | WK process warmup; Live Accessory minimize; LA staleDate/compact; MetricKit; Quick Switch search role |
