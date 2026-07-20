---
title: KENOS PORTAL REDIRECT CANARY — OWNER_LIMITED_PASS
owner: kenpan
last_verified: 2026-07-20
status: OWNER_LIMITED_PASS
---

# Portal Today → Kenos Today soft-redirect (Owner-limited)

| Item            | Value                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| Portal deploy   | `6a5e347265864128941f0777`                                                                  |
| Rollback Portal | `6a5c617eceda660008ee2583`                                                                  |
| Route           | `https://portal.kenos.space/today`                                                          |
| Destination     | `https://aios-kenos.netlify.app/` (working AIOS prod; `aios.kenos.space` DNS not relied on) |
| Flags           | `VITE_KENOS_PORTAL_TODAY_REDIRECT=1` + Owner email allow-list                               |
| stop_builds     | remains **true**                                                                            |
| Portal home `/` | still live — not retired                                                                    |

## Gates

| Check                               | Result                                               |
| ----------------------------------- | ---------------------------------------------------- |
| Exact route only (`/today`)         | PASS                                                 |
| Query/hash preserved in builder     | PASS (unit)                                          |
| Non-cohort / flag Off paths         | PASS (denied / disabled UI)                          |
| No DNS cutover / no Portal delete   | PASS                                                 |
| ⌘K entry `Portal · Today → Kenos`   | PASS (portal-local)                                  |
| Full Owner logged-in redirect click | Owner session required on device — code+deploy ready |

## Not done

- No bulk Portal redirects
- No Portal retirement
- No `redirectToPortal()` sync hardcode change
