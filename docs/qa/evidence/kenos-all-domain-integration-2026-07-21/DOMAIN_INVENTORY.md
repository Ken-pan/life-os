# Domain Inventory — Kenos All-Domain Integration

**Date:** 2026-07-21  
**SSOT contracts:** `apps/aios/src/lib/kenos/domainIntegration.core.js`  
**Swift mirror:** `clients/apple/Apps/Shared/KenosDomainRegistry.swift`

| Domain ID | Legacy name | App path | Strategy | Surface | Status (honest) |
| --------- | ----------- | -------- | -------- | ------- | --------------- |
| plan | Planner OS | `apps/planner` | embedded_web | Continuity WKWebView | reference (Daily Beta READY) |
| training | Fitness OS | `apps/fitness` | embedded_web | Continuity WKWebView | reference (Daily Beta READY) |
| work | Work / Deep Work | `apps/aios` `/work`, `/spaces/work` | embedded_web (AIOS origin) | Continuity on Kenos origin | DAILY_BETA_INTEGRATED |
| money | Finance OS | `apps/finance` | embedded_web | Continuity | DAILY_BETA_INTEGRATED |
| library | Knowledge OS | `apps/knowledge` | embedded_web | Continuity | PARTIAL (alias knowledge→library) |
| music | Music OS | `apps/music` | embedded_web | Continuity | PARTIAL |
| home | Home OS | `apps/home` | embedded_web | Continuity | PARTIAL (experimental) |
| health | Health / Focus / Status | `apps/health` | embedded_web | Continuity | PARTIAL (experimental; single domain) |
| paper | Paper OS | sibling `paperos` (not in monorepo app) | legacy_fallback | hosted stub path | NOT_INTEGRATED / missing in-repo app |

## Notes

- No brand DB migration (Finance→Money naming is UI/domain-id only).
- Paper lives outside this monorepo as `../paperos`; do not invent dual knowledge truth.
- Plan/Training Continuity + Domain Dock + Space Shelf are the reference implementations.
