# Kenos spacing SSOT — 2026-07-21

## Rule

**Horizontal gutter = 16pt** (`--kenos-space-inline` → `--space-4`).

Applies to:
- `KenosSystemBar` large title + action bubble row
- Kenos Mode page content (`today-page`, `spaces-page`, `control-page`)
- Domain `DomainMusicHeader` (already `padding-inline: 16`)

**Top:** native shell uses status clearance `54px` on `#main-content`; page `padding-top: 0` under SystemBar / Music header — no double pad.

## Before → after

| Surface | Before | After |
| ------- | ------ | ----- |
| Today native width | `100% - 28px` (14pt) | `100% - 2×16` |
| SystemBar | hard `16px` | `var(--kenos-space-inline)` |
| control-page | `100% - 32px` | tokenized `2 × --kenos-space-inline` |
| Token | missing inline | `--kenos-space-inline: 16px` |

Do not invent extra scale — reuse `--kenos-space-*` for section gaps.
