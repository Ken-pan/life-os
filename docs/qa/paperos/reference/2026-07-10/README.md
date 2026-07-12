# PaperOS UI Reference Mockups — 2026-07-10

**Status:** Design-direction references (not literal visual specs)
**Workstream:** PAPR.UI
**Canonical spec:** [`../../ui-spec.md`](../../ui-spec.md)

These six PNGs capture the **target product language** for PaperOS on reMarkable Paper Pro Move portrait mode. They inform information architecture, chrome behavior, and hierarchy — they are **not** pixel-perfect implementation specs.

## Files

| File                                                             | Screen                                                          | Brief P0 ID |
| ---------------------------------------------------------------- | --------------------------------------------------------------- | ----------- |
| [`01-home-hub-ia-only.png`](./01-home-hub-ia-only.png)           | Home / Today hub (search entry, recent notes, tasks, documents) | 01          |
| [`02-global-search.png`](./02-global-search.png)                 | Global Search (titles, handwriting, tags)                       | 14          |
| [`03-new-note.png`](./03-new-note.png)                           | New Note template picker                                        | 12          |
| [`04-page-overview.png`](./04-page-overview.png)                 | Page Overview (notebook pages grid)                             | 10          |
| [`05-editor-tools-revealed.png`](./05-editor-tools-revealed.png) | Note Editor — **tools revealed** state                          | 08          |
| [`06-notes-gallery.png`](./06-notes-gallery.png)                 | Notes Gallery                                                   | 03          |

## How to read these mockups

### Design direction, not literal spec

- Copy **structure and behavior**, not decorative chrome.
- The target experience is: **paper canvas + contextual tools + temporary system surfaces**.
- **Real device screenshots always override mockup assumptions** when they disagree.
  See: [`docs/ui-qa-screenshots/paperos/device/baseline-2026-07-10/`](../../../../ui-qa-screenshots/paperos/device/baseline-2026-07-10/) (local; gitignored).

### Portrait layout vs Move framebuffer

The mockups were composed at a **941×1672** portrait canvas — close to the Move framebuffer (~954×1696). Repo copies are **576×1024** PNG exports at the same ~9:16 aspect ratio. Use aspect and spacing relationships, not absolute pixel sizes.

### Home (`01-home-hub-ia-only.png`)

- **Copy:** information hierarchy — search entry, recent notes, upcoming tasks, documents, browse-all action.
- **Do not copy:** the outer rounded card, drop shadow, nested dashboard container, or “app in a card” framing.
- Home should feel like content on paper, not a SaaS dashboard widget board.

### Editor (`05-editor-tools-revealed.png`)

- This image shows the **tools-revealed** state (expanded tool rail visible).
- It is **not** the default writing state. Default writing should be near edge-to-edge canvas with chrome collapsed after pen activity (brief §7.7).
- Copy: floating narrow tool rail, page indicator placement, title bar density.
- Do not copy: paper texture grain, decorative shadows, or illustrative handwriting as product data.

### Notes Gallery (`06-notes-gallery.png`)

- Copy: two-column grid, paper thumbnails as primary objects, text tabs with underline, sparse metadata.
- Do not copy: drop shadows on thumbnails, fake star/sync on every item unless state warrants it.

### Search (`02-global-search.png`)

- Copy: search field as sole prominent container, grouped unboxed results, handwriting hit emphasis without yellow highlight.
- Fake result counts and sample titles are placeholders only.

### New Note / Page Overview (`03`, `04`)

- Copy: template-as-paper-thumb, immediate-create flow, page grid without outer card chrome.
- Do not copy: fake dates, page counts, or notebook titles as shipped product copy.

## Do not copy from any mockup

- Paper texture / grain overlays
- Decorative shadows and nested card containers
- Fake page counts, timestamps, or demo notebook names as defaults
- Yellow search highlighting
- Permanent sync/status chrome when healthy
- Any element that contradicts [`ui-spec.md`](../../ui-spec.md)

## Related evidence paths

| Artifact                     | Path                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Spec                         | [`../../ui-spec.md`](../../ui-spec.md)                                                        |
| Device baseline (2026-07-10) | `docs/ui-qa-screenshots/paperos/device/baseline-2026-07-10/`                                                                              |
| Subsequent captures          | `docs/ui-qa-screenshots/paperos/device/latest/`                                                                                           |
| Capture workflow             | [`apps/planner-device/remarkable-lite/docs/test-driver.md`](../../../../../apps/planner-device/remarkable-lite/docs/test-driver.md) |
