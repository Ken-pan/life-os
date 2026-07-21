# UI polish slice — draft / Tab material / FAB / density / Dynamic Type

**Date:** 2026-07-21  
**Does not close Phase 4 · OWNER-QUALITY UI still NOT READY**

## Shipped

| Area | Change |
| ---- | ------ |
| **Draft leave** | Plan exposes `__KENOS_LEAVE_GUARD__`; Domain leave (Kenos chip / Shelf card / return) probes dirty editor → alert 继续编辑 / 丢弃并离开 |
| **Tab material** | Single full-width glass/material bar (Kenos + 4) · `@ScaledMetric` labels/icons · selection plate morph |
| **Plan FAB** | Hidden on native shell; **+** on Domain title chip → `__KENOS_DOMAIN_COMPOSE__` / openTaskEditor |
| **Density** | Today / Assistant / Inbox native-shell type + spacing tighten; Assistant hero subline |
| **Dynamic Type** | Dock icon/label use `@ScaledMetric` relative to body/caption2 |

## Evidence

Rebuild Daily Beta + device install after this slice. Manual: edit Plan task → Kenos chip → confirm alert.

```text
DRAFT_LEAVE_GUARD: SHIPPED
NATIVE_TAB_MATERIAL: IMPROVED (still custom dock, not UITabBar)
PLAN_FAB_ANDROID: REMOVED_ON_NATIVE
DENSITY_DT: PARTIAL_SHIP
OWNER-QUALITY UI: NOT READY
```
