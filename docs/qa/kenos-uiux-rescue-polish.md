# Rescue polish — follow Owner-recommended tradeoffs

**Date:** 2026-07-20  
**Choices applied:**

| Tradeoff | Choice |
|---|---|
| A deep link vs true embed | **Keep state-restored deep link** (no iframe) |
| B Continue placement | **Chrome-only** — `KenosSystemBar` (mobile) + AppBar/Sidebar (desktop) |

## Shipped

1. **KenosSystemBar** — sticky material chrome; Continue + Capture; recent count; ⌘. still works  
2. Removed duplicate Continue from Today / Spaces / Training / bridges / states  
3. Light canvas/chrome tokens (warmer, less washed)  
4. Wider content max on ≥1024  
5. Evidence: `output/uiux/.../rounds/polish/after/`

## Still for Owner

- Domain bridges remain CTA shells  
- True Fitness/Planner embed not in scope  
- Simulator iPad window matrix still Owner-local  

Status unchanged: **READY_FOR_OWNER_REVIEW** (no visual PASS).
