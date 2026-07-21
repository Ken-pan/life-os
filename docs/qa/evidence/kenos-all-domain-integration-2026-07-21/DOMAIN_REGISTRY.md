# Domain Registry — Contract

**SSOT:** `apps/aios/src/lib/kenos/domainIntegration.core.js`  
**Mirror:** `clients/apple/Apps/Shared/KenosDomainRegistry.swift` (must match IDs / ports / homePaths / dock slots)

## Registered IDs

`kenos`, `plan`, `training`, `work`, `money`, `library`, `music`, `home`, `health`, `paper`

## Alias map (frozen)

| Alias | Canonical |
| ----- | --------- |
| finance, financeos, finance-os | money |
| knowledge, knowledgeos, knowledge-os | library |
| fitness, fitnessos | training |
| planner, planner-os | plan |
| focus, status | health |
| paperos, paper-os | paper |
| work-focus | work |

## Navigation

- One Bottom Dock on screen.
- Domain Mode: native Kenos return chip + ≤4 domain capsule slots (≤5 chrome total).
- Slot budgets enforced by `assertManifestSlotBudget` / Swift manifests.
- Accents reused from `domainIdentity.core.js` (no second color SSOT).

## Provider surfaces (stubs → fill per domain)

Continue · Shelf · Today · Inbox · Assistant · Quick Switch

Plan/Training satisfy full providers; others start as shelf/continue stubs until Gate commits.
