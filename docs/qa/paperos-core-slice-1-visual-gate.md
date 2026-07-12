# PaperOS PAPR.UI Core Slice 1 — Visual Gate Report

1. **FINAL VERDICT:**
   PASS WITH WARN

2. **Area Verdict Table**

| Area | Reference intent | Previous baseline | Candidate | Verdict |
|---|---|---|---|---|
| Navigation | System drawer + overlays; no permanent rail | Bottom tab bar always visible | Drawer implemented, bottom bar removed, but legacy IA remains | PASS WITH WARN |
| Notes Gallery | 4 tabs, paper thumbnails, no cards | 2 tabs, bordered thumbnails | 4 tabs present, clean layout, but thumbnail border remains | PASS WITH WARN |
| Editor | Edge-to-edge canvas, chrome hides, floating tools | Fixed top bar + left rail always visible | Chrome hides after writing, but expanded tools still use legacy rail | PASS WITH WARN |
| E-ink visual language | Ink 100/70/30/Paper, minimal borders | Ad-hoc colors, 50-70% borders | Typography-focused, mostly clean, some heavy borders/blocks remain | PASS WITH WARN |

3. **Must-fix findings**

- **Severity:** P0
  **Screenshot:** `02-system-drawer-open.png`
  **Observed issue:** The system drawer still contains legacy modules (`Inbox`, `Review`, `System`) and `Home`/`Today` are split.
  **Why it harms the e-ink experience:** It perpetuates the old 6-module tablet app architecture rather than adopting the new 3-layer, simplified OS model (Home/Today, Notes, Tasks, Documents, Settings).
  **Recommendation:** Remove `Inbox` and `Review` from the drawer, merge `Home` and `Today` into a single destination, and rename `System` to `Settings`.

- **Severity:** P0
  **Screenshot:** `07-editor-tools-revealed.png`
  **Observed issue:** The tools revealed state displays the legacy heavy left rail (P1, P2, Erase) and legacy top bar.
  **Why it harms the e-ink experience:** It permanently eats into the canvas when tools are active and feels like a heavy tablet UI rather than contextual tools on a paper canvas.
  **Recommendation:** Replace the legacy left rail with the specified narrow floating tool rail (pen, eraser, undo, handle) and update the top bar layout.

- **Severity:** P1
  **Screenshot:** `03-notes-recent.png`
  **Observed issue:** The notebook thumbnail is enclosed in a thin square border/frame.
  **Why it harms the e-ink experience:** It makes the notebook look like a nested web card or image placeholder rather than a physical paper object.
  **Recommendation:** Remove the border entirely, letting the paper thumbnail and content define its own shape (with an optional 2-4px corner radius).

- **Severity:** P1
  **Screenshot:** `03-notes-recent.png`
  **Observed issue:** The `+` (New Note) button is a heavy, solid black sharp rectangle.
  **Why it harms the e-ink experience:** It feels visually aggressive and does not follow the system's radius semantics for buttons (6-8px radius) or icon hierarchy.
  **Recommendation:** Apply a 6-8px corner radius if a solid button is used, or change it to a standard `Ink 100` icon without the heavy background fill.

- **Severity:** P2
  **Screenshot:** `02-system-drawer-open.png`
  **Observed issue:** The active item ("Home") in the drawer is marked with a thick black vertical line on the left edge.
  **Why it harms the e-ink experience:** It introduces an unnecessary heavy geometric shape and departs from the minimalist four-grayscale-token typographic hierarchy.
  **Recommendation:** Remove the heavy left border and rely solely on `Ink 100` (bold) text to indicate the active item.

4. **Later-polish findings**
- The "Tools" handle in the `08-editor-after-writing.png` clean state is currently a text box; it could be refined into a minimal icon or smaller handle to maximize immersion.
- Empty states and loading placeholders should be reviewed to ensure they rely on typography rather than generic spinners or bordered boxes.

5. **Device-only uncertainties that screenshots cannot prove**
- Whether the chrome automatically hides after 1-2 seconds of writing (screenshots only show the end state).
- The touch latency and refresh performance of the native ink overlay.
- Gesture interactions (e.g., edge swipe to open the system drawer).
- Why `05-notebook-opened.png` and `06-editor-clean.png` were not successfully captured (whether due to a test script failure, missing semantic IDs, or race conditions with chrome hiding).

6. **Recommendation**
- one bounded correction pass
