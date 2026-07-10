# P-MOVE-3: CJK Font + Pagination UI Gate

**Status: PASS** · 2026-07-09

PaperOS on the reMarkable Paper Pro Move now renders Simplified Chinese and
uses button-based pagination instead of e-ink scrolling. Verified live on
device by the operator.

## Scope

Two device UX fixes, no server/API changes:

1. Chinese text did not render (device ships Noto Sans/Serif without CJK).
2. Continuous scrolling was poor on e-ink; replaced with page switching.

Constraint compliance: `/api/paper/actions` untouched, no write flags enabled,
no token values printed or committed, nothing written to the root filesystem,
no fonts installed into `/usr/share/fonts`.

## Font

| Item | Value |
| --- | --- |
| Font | Noto Sans CJK SC Regular (OFL-licensed) |
| Source | notofonts/noto-cjk (Sans/OTF/SimplifiedChinese) |
| Device path | `/home/root/paperos/fonts/NotoSansCJKsc-Regular.otf` (15.7M) |
| Committed to repo | No — device-only asset, gitignored |
| Load method | `QFontDatabase::addApplicationFont()` in `main.cpp` |

`loadPaperOsFont()` scans `PAPEROS_FONT_DIR` (default
`/home/root/paperos/fonts`) for `*.otf/*.ttf/*.otc/*.ttc`, registers the first
usable file, applies it via `QGuiApplication::setFont()`, and exposes the
family to QML as the `appFontFamily` context property. Load success/failure is
logged. If no font loads, the app falls back to the platform default font and
keeps running (verified path: warning log, no crash).

Device log from the verification run:

```
PaperOS: loaded font "Noto Sans CJK SC" from "/home/root/paperos/fonts/NotoSansCJKsc-Regular.otf"
qml: UI font family: Noto Sans CJK SC
```

## Pagination

`qml/Main.qml` no longer uses ListView/Flickable for tasks:

- Fixed page of 5 tasks rendered with `Column` + `Repeater` over a
  `slice()` of the task array.
- Bottom pager: `‹ Prev · X / Y · Next ›`. Prev disabled on first page, Next
  disabled on last page; pager hidden when tasks fit on one page.
- Page index clamps automatically when the task list changes.
- Empty state: "No tasks for today" / "Loading tasks...".
- No animations, no kinetic flicking, instant page swaps.
- Focus card and last-sync footer preserved.
- Every `Text` uses `font.family: root.uiFont` (CJK family with platform
  fallback).

## Build

- `./scripts/build-remarkable.sh` (Docker, chiappa 5.7.119 SDK): success.
- Artifact: `build-docker/paperos`, ELF aarch64, 1.4M.
- One pre-existing `_qs` deprecation warning in `main.cpp` (unrelated).

## Deploy

- Binary shipped as `/home/root/paperos/paperos.next` first; the running
  `paperos` was not touched until verification passed.
- Font shipped to `/home/root/paperos/fonts/`.
- After the operator verified the UI, `paperos.next` was promoted to
  `/home/root/paperos/paperos`.

## Device UI test

- Operator approved stopping xochitl before the test.
- `paperos.next -platform epaper` ran with xochitl stopped.
- Operator confirmed on the physical screen: Chinese titles render,
  tasks show 5 per page, Prev/Next paging works, no scrolling needed.
- Test process exited and xochitl was restored: `xochitl=active` confirmed
  post-test.

## Rollback

Previous binaries retained on device:

```
/home/root/paperos/paperos.backup-20260710-002537   (pre-P-MOVE-3 binary)
/home/root/paperos/paperos.backup-20260709-235413   (earlier baseline)
```

To roll back:

```sh
ssh remarkable-pro-move 'cp /home/root/paperos/paperos.backup-20260710-002537 /home/root/paperos/paperos'
```

The font directory is additive and harmless to leave in place.
