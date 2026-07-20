# CURRENT UI — WHY IT STILL LOOKS CHEAP

**SHA:** `502d805c28b29d3d50c0efa2699ab717a301ac45`  
**Baseline root:** `output/uiux/kenos-visual-rescue-2026-07-20/baseline/`  
**Data:** `kenosDemo=1` (not auth wall)

Prior compounding stamps are **structural only**. This document is the visual diagnosis.

---

## Evidence set used

| Shot | Path |
|---|---|
| Web mobile Today | `baseline/web-390x844/today.png` |
| Web mobile Spaces | `baseline/web-390x844/spaces.png` |
| Web mobile Switcher | `baseline/web-390x844/space-switcher.png` |
| Web tablet Approvals | `baseline/web-1024x768/approvals.png` |
| Web desktop Today/Spaces | `baseline/web-1440x900/*.png` |
| iPhone Today | `baseline/iphone-17-pro/00-launch-today.png` |
| iPad Today | `baseline/ipad-pro-13/00-portrait-today.png` |

---

## Root causes (with screenshot regions)

### 1. Typography — page title as poster, content as afterthought

**Evidence:** `web-390x844/today.png`, `iphone-17-pro/00-launch-today.png`, `ipad-pro-13/00-portrait-today.png`

- “Today” / “Spaces” / “Approvals” jump to display scale without a supporting type ramp (no distinct list-title / body / metadata roles).
- Subtitles (“状态、下一步…”, “Now, next…”) are low-contrast gray and feel like placeholder captions, not editorial lead-ins.
- On Approvals (`web-1024x768/approvals.png`), metadata (`plan.reschedule_task`, R2 badge) competes with the human summary in the same visual band.

**Cheap signal:** typography size alone substitutes for hierarchy; feels like a docs site hero, not a daily tool.

### 2. Spacing rhythm — sparse top, colliding bottom

**Evidence:** `iphone-17-pro/00-launch-today.png`, `web-390x844/today.png`

- Large empty band under the title before content.
- Floating tab / SAFE FAB (`SPACE Switch`) crowds the bottom; on iPhone the Liquid Glass tab bar **covers list rows** (“Kenos Phase 3” partially hidden).
- Section gaps are uniform → sections do not group as “now / decide / spaces”.

**Cheap signal:** whitespace is leftover, not designed density.

### 3. Density — iPad wastes the canvas

**Evidence:** `ipad-pro-13/00-portrait-today.png`

- ~⅓ sidebar + sparse list of 4 text rows on a huge white plane.
- No secondary column, inspector, or progressive disclosure.
- Same mobile content model stretched to iPad.

**Cheap signal:** “list on white” admin tool, not a mature iPad product.

### 4. Composition — chrome floats, content sinks

**Evidence:** iPhone Today (floating top pill + floating bottom pill)

- Two floating chrome clusters with no content frame between them.
- Content is a flat stack under chrome, not a composed workspace.

**Cheap signal:** prototype shell with chrome as decoration.

### 5. Navigation chrome — competing Switch / Spaces / FAB

**Evidence:** `web-390x844/today.png` (FAB “SPACE Switch”), Spaces tab, sidebar globe

- Three ways to “go to Spaces / switch” with different labels (Switch / Spaces / All).
- FAB looks like a marketing sticker, not a native control.

**Cheap signal:** unfinished IA leaking into chrome.

### 6. Surface hierarchy — flat black OR flat white, then random cards

**Evidence:** Spaces list (flat rules) vs Switcher sheet (stacked rounded cards)

- Content pages: almost no surface levels (canvas = content).
- Switcher: suddenly multiple raised cards (`SYSTEM` / `RECENT` / `ALL`).
- Inconsistent: either no depth or card soup.

**Cheap signal:** no coherent material system; Liquid Glass only on iOS tab, nowhere intentional on Web.

### 7. Card overuse (in overlays) + card absence (in content)

**Evidence:** `space-switcher.png` vs `spaces.png`

- Directory page is hairline list (good instinct) but Switcher wraps everything in rounded cards → visual language splits.
- Approvals row packs badges + bullets + dual buttons without a calm primary zone.

### 8. Iconography — thin mixed metaphors

**Evidence:** Web bottom nav vs Apple tab icons; Spaces rows with no domain marks

- Web Spaces tab uses globe; Apple Spaces uses grid; Switcher uses star + external.
- Domain rows (Plan/Money/Training) have **no identity marks** — only chevron/external.

**Cheap signal:** generic icon salad / missing product marks.

### 9. Color & contrast

**Evidence:** iPhone orange status; Web teal “已更新”; Approvals pink R2

- Pure `#000` canvases feel harsh vs system grouped backgrounds.
- Status colors shout louder than primary tasks (orange above Today list).
- Domain accents absent; everything is grayscale + one alarm color.

### 10. Radius inconsistency

**Evidence:** FAB rounded rect, tab pills, switcher cards, Approvals chips

- Multiple unrelated radii without a named scale (control / sheet / group).

### 11. Empty / status states look like debug notices

**Evidence:** iPhone “Some content couldn’t update”; Web “已更新” + long drill disclaimer on Approvals

- Status copy is honest (good) but styled like engineering banners, not product states.
- R2 / payload language still peeks into Approvals metadata band.

### 12. Domain identity — deep-link directory, not integration

**Evidence:** `spaces.png` DOMAIN APPS rows with external icon only

- Plan/Money/Training/Music/Home look identical text rows.
- Opening Fitness/Planner is not visible in Kenos chrome as “you are in Fitness”.

**Cheap signal:** launcher list, not a multi-app OS shell.

### 13. Content realism / mock tone

**Evidence:** Approvals long superseded lorem; Training Focus copy reads like internal docs

- Demo content includes QA filler paragraphs → reads as staging UI.

### 14. Motion — not evidenced as intentional

- Switcher sheet appears as standard overlay; no purposeful hierarchy motion yet (neither good nor premium).

### 15. Platform mismatch

**Evidence:** Web dark flat vs iPhone Liquid Glass tab vs iPad light split

- Three different product personalities across clients.
- iPad sidebar is correct pattern but content panel is empty of iPad craft.

---

## Summary judgment

Kenos currently looks cheap because:

1. **Hero titles + sparse body** replace a real type/spacing system.  
2. **Chrome floats and collides** with content (especially iPhone).  
3. **No stable surface language** (flat lists ↔ card sheets).  
4. **Domain apps appear as external text rows**, so the product feels like a portal, not a shell.  
5. **Status/debug chrome** outranks daily content.

Structural cleanup (IA, switcher prototype, demo seed) did **not** fix these.

**Status:** `KENOS VISUAL QUALITY — NOT_ACCEPTED`
