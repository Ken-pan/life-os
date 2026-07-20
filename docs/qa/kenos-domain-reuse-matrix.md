# Kenos Domain Reuse Matrix

**Date:** 2026-07-20  
**Pattern name:** Domain Integration Pattern (DIP)

## Pattern

1. Find mature domain home / core flow  
2. Choose `REUSE_AS_IS` or `REUSE_WITH_SHELL` (prefer deep link over redesign)  
3. Remove duplicate system nav inside Kenos chrome only  
4. Keep domain-internal nav  
5. Attach Space Switcher + Assistant context + Inbox return  
6. Preserve visual identity  
7. Fix token conflicts only  
8. Verify return / Focus immersion  

## Matrix

| Domain | Mature surface | Method | Kenos integration | Identity preserved | Notes |
|---|---|---|---|---|---|
| Fitness / Training | Fitness `/`, `/day/*`, focus | DEEP_LINK + hosted read | `/spaces/training` read + external Fitness | Yes | Do not rewrite workout as Kenos cards |
| Planner / Plan | `/`, calendar, upcoming | DEEP_LINK | Today cards + Switcher | Yes | Writers stay in Planner |
| Finance / Money | `/home/today` | DEEP_LINK | Today + Switcher | Yes | No hosted Money page yet |
| Music | `/`, `/library` | DEEP_LINK | Today read + Switcher | Yes | |
| Home | `/plan`, storage | DEEP_LINK | Today read + Switcher | Yes | Spatial stays in Home |
| Knowledge | library / overview | DEEP_LINK | Apple “coming soon” | Yes | Wikilink chips shared |
| Work | AIOS `/work` | EMBED_EXISTING_ROUTE | Hosted + resume | Yes | Not a separate app |
| Focus | `/focus` + shell | REUSE_AS_IS | Hides global nav | Yes | Immersion pattern for Training Focus |
| Health | standalone | STANDALONE | Out of catalog | Yes | |
| PaperOS | sibling repo | DEEP_LINK | Via Plan/Work APIs | Yes | |

## Fitness sample result

- Hosted Training Space shows plan summary + “开启专注模式”
- Full workout UX remains Fitness OS
- Focus hides Kenos tab chrome
- Space Switcher can leave and return without inventing a second Fitness UI

## Anti-patterns avoided

- Dashboard-card mosaic of every domain  
- Embedding Fitness iframe in AIOS  
- Copying AppBrandSwitcher into Kenos as a fifth tab  
