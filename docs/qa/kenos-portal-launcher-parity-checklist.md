---
title: KENOS PORTAL LAUNCHER / DEEP-LINK PARITY CHECKLIST
owner: kenpan
last_verified: 2026-07-20
status: CHECKLIST — NO_REDIRECT
---

# Portal → AIOS launcher / deep-link parity

Production Portal redirect **unchanged**. This checklist only gates soft-redirect readiness.

## Launcher destinations

| Portal app | URL                 | AIOS coverage today                        | Gap                                             |
| ---------- | ------------------- | ------------------------------------------ | ----------------------------------------------- |
| Planner    | planner.kenos.space | Spaces → Plan external + Plan writers live | Deep paths (inbox/calendar) still Planner-owned |
| Finance    | finance.kenos.space | Money Space read + external link           | Ledger UI remains Finance                       |
| Fitness    | fitness.kenos.space | Training Space read + external link        | Workout writer not Kenos                        |
| Music      | music.kenos.space   | Music read flag + external link            | Player remains Music                            |
| Home       | home.kenos.space    | Home read flag + external link             | Spatial editor remains Home                     |
| AIOS       | aios.kenos.space    | Hosted                                     | —                                               |

## Portal ⌘K deep links (sample)

| Portal deep link          | AIOS equivalent                                | Parity                      |
| ------------------------- | ---------------------------------------------- | --------------------------- |
| Planner · 今日 `/`        | external Plan                                  | Partial                     |
| Planner · 收件箱 `/inbox` | AIOS Inbox (Approvals/Capture) ≠ Planner inbox | Different Owner — keep both |
| Finance · 今日可花        | Money Space summary card                       | Partial (read only)         |
| Fitness sessions          | Training Space                                 | Partial (read only)         |
| Music now playing         | Music summary via Today                        | Partial (read only)         |
| AIOS Today/Assistant      | Hosted `/` `/assistant`                        | Full                        |

## Soft-redirect blockers (still open)

1. `redirectToPortal()` / `getPortalOrigin()` still hardcode Portal
2. Planner Inbox ≠ AIOS Inbox semantics
3. No traffic observation window yet
4. Apple / Capture / remaining Legacy revoke not complete

## Explicitly not done

- No DNS change
- No Portal deploy
- No production `landingOrigin` override
