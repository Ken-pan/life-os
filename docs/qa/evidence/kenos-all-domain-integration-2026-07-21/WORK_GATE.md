# Work Domain Gate — 2026-07-21

**Status:** `DAILY_BETA_INTEGRATED` (hosted on AIOS origin; Continuity + Domain Dock)

## Strategy

**B Embedded Web** on Kenos/AIOS origin (`/work`, `/spaces/work`) — not a separate app binary.

## Wired

| Surface | Implementation |
| ------- | -------------- |
| Registry | `domainIntegration.core.js` → work `integrationStatus: integrated` |
| Nav manifest | Kenos · Today · Projects · Focus · More |
| Continuity URL | `KenosDomainRegistry.homeURL("work")` → Daily Beta path `/work` |
| Shelf card | spaceCatalog external entry |
| Continue adapter | `workSpaceAdapter.js` ResumeDescriptor + leave-guard |
| Spaces list | availability `ready`, href `/work` |
| Native chrome | hide Spaces kickers + BottomNav when `iosNativeShell` |

## Honest residuals

- Work hub is still AIOS-hosted (not a standalone Work OS app).
- Device smoke Spaces→Work→Kenos pending when LAN preview available.
- Today/Inbox aggregation cross-cut comes in Phase C.

## Regression

- Plan/Training dock manifests unchanged (registry-driven, same slots).
