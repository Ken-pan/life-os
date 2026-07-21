# Kenos overall status — 2026-07-21 (dock Music selection + Domain shelf z-order)

```text
OVERALL PERSONAL DAILY BETA: READY_LAN_DEPENDENT
BUILD:                       202607211345 (installed + launched 17 Pro)
DOCK_SELECTION:              ICON_CAPSULE + MUSIC_TINT (no cell RoundedRectangle)
DOMAIN_SHELF:                ZORDER_FIXED (shelf above WKWebView; dock sibling)
SPACES_CHIP:                 SHELF_ALWAYS (not Home)
SPACE_SHELF:                 FULL_CATALOG + Kenos
FOCUS_HIDES_DOCK:            VERIFIED earlier on /day/chest/focus
OWNER-QUALITY UI:            NOT READY
```

## Latest slice (this session)

### Visual model (Apple Music / iOS Tab Bar)
- Selected: short **Capsule** behind **icon only** (`Color.black.opacity(0.40)`)
- Selected icon + label: Music-like coral/pink tint
- Unselected: secondary gray
- No tall `RoundedRectangle` wrapping the whole tab cell
- Dock bar itself remains floating Liquid Glass capsule

### Domain shelf bug (reproduced + fixed)
- **Repro:** Plan Domain → Spaces / `kenos://shelf` — shelf painted **under** WKWebView (invisible / untappable)
- **Fix:** `KenosDomainModeShell` ZStack order = web → edge pan → shelf (z 2–3) → dock sibling (z 4; under dim when shelf open)
- **Verify:** `screenshots/dock-shelf-fix-2026-07-21/03-plan-domain-space-shelf.png` shows Kenos + full APPS list with Plan Current

### Evidence
- `screenshots/dock-shelf-fix-2026-07-21/01-today-dock-selected.png`
- `screenshots/dock-shelf-fix-2026-07-21/02-plan-domain-dock.png`
- `screenshots/dock-shelf-fix-2026-07-21/03-plan-domain-space-shelf.png`

## Still open

- User message cut off mid-sentence about Domain shelf — if a *different* failure remains (empty list / can't dismiss / Kenos entry), need specifics
- Dogfood 3–7 days · Phase 4 entitlements · Dynamic Type sweep
