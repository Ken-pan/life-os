---
title: KENOS DOMAIN SPACES READINESS SNAPSHOT
owner: kenpan
last_verified: 2026-07-20
status: INVENTORY — NO DOMAIN WRITER CUTOVER
---

# Domain Spaces readiness (web)

Seven production sites remain `stop_builds=true`. No uncontrolled multi-site deploy.

| Domain | Prod site | Kenos system-layer read | First Writer target | Blocker |
| --- | --- | --- | --- | --- |
| Plan | planneros-ken | Owner-limited writers live | Already on Track A/B | Offline flush flag OFF; Legacy still for non-cohort |
| Assistant/AIOS | aios-kenos | Read-only maintenance live | Approval decide / Capture UI bake | Capture/Approval Owner-limited ON; Executor OFF |
| Work | via AIOS/Spaces | list RPCs exist | create/archive RPC PASS | Client Spaces UI incomplete |
| Focus | via AIOS | list + start/end RPC PASS | pause/resume/deferred | Client bake OFF |
| Fitness | fitnessos-ken | Legacy app | EntityRef-only Kenos bridge | Domain inventory + first read canary undeployed |
| Finance | financeos-ken | Legacy + extension | Capture harvest ≠ Work dual-write | Separate harvest path; no Kenos Writer yet |
| Music | musicos-ken | AIOS read flag ready | Read projection only first | No Kenos writer schema |
| Home | homeos-ken | AIOS read flag ready | Spatial + SSO | WIP |
| Knowledge | knowledge app | Partial | Library EntityRef | Vault/acceptance WIP |
| Health/Status | health | Partial | Status projection | Not blocking Plan core |
| PaperOS | sibling repo | Provider APIs in Planner | Sync contracts | Out of monorepo UI |

## Next domain slice order (unchanged)

AIOS write bake (Approval/Capture UI) → Planner Kenos-native → Fitness read → Finance read → Music → Home → Knowledge → Health → Paper sync → Apple → Portal soft redirect.
