# ALL KENOS DOMAINS — INTEGRATED DAILY BETA

**Date:** 2026-07-21  
**Evidence root:** `docs/qa/evidence/kenos-all-domain-integration-2026-07-21/`  
**SSOT:** `apps/aios/src/lib/kenos/domainIntegration.core.js`  
**Swift mirror:** `clients/apple/Apps/Shared/KenosDomainRegistry.swift`

## Scoreboard

```
ALL KENOS DOMAINS — INTEGRATED DAILY BETA
WORK: DAILY_BETA_INTEGRATED (Continuity dock; prod Work reads local-off residual)
MONEY: DAILY_BETA_INTEGRATED (Continuity dock; AuthGate until Owner login)
LIBRARY: DAILY_BETA_INTEGRATED
MUSIC: DAILY_BETA_INTEGRATED
HOME: DAILY_BETA_INTEGRATED
HEALTH: DAILY_BETA_INTEGRATED
PAPER: PARTIAL (in-repo app missing → legacy_fallback placeholder)
OVERALL PERSONAL DAILY BETA: READY_LAN_DEPENDENT (device smoke PASS_LAN this session)
PHASE 4: EXIT_OPEN
LEGACY FALLBACK: RETAINED
PUSH / DEPLOY / PROD MIGRATION: NOT PERFORMED
```

## Honest downgrade check (this follow-up)

| Domain | Prior claim | After device + embed audit | Downgrade? |
| ------ | ----------- | -------------------------- | ---------- |
| Work | DAILY_BETA_INTEGRATED | Continuity Work dock verified; capability banner expected | No |
| Money | DAILY_BETA_INTEGRATED | Native Money dock + no web tabbar; AuthGate content | No |
| Library | DAILY_BETA_INTEGRATED | DomainMusicHeader + Library dock | No |
| Music | DAILY_BETA_INTEGRATED | DomainMusicHeader + Music dock | No |
| Home | DAILY_BETA_INTEGRATED | Storage Continuity + Home dock | No |
| Health | DAILY_BETA_INTEGRATED | DomainMusicHeader + Health dock (port 5192 gate fixed) | No |
| Paper | PARTIAL | Still sibling PaperOS | Keep PARTIAL |

No domain was downgraded from `DAILY_BETA_INTEGRATED` → `PARTIAL`. Paper stays PARTIAL.

## Follow-up commits (local)

- `fix(kenos): embed-shell chrome for domain Continuity`
- `docs(qa): record all-domain device smoke`

## Residuals

- Money/Library/Music/Home/Health LAN static servers are manual (`serve-static.py`); not yet in `kenos-ctl` LaunchAgents
- Work production reads remain local-off by design
- Money AuthGate until Owner session on device
- Paper full cutover blocked on sibling PaperOS embed decision
- Phase 4 EXIT_OPEN; APNs/TestFlight out of scope
