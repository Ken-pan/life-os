---
title: KENOS CAPTURE INGEST + MUSIC/HOME READ FOUNDATION
owner: kenpan
last_verified: 2026-07-20
status: CLIENT_READY — FLAGS_DEFAULT_OFF — RPC_CANARY_PASS
---

# Capture ingest client + Music/Home reads

## Capture

| Item       | Value                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| Flags      | `VITE_KENOS_PROD_WRITES=1` + `VITE_KENOS_CAPTURE_INGEST_WRITER=1` (+ optional Owner emails) |
| Default    | Off                                                                                         |
| Host       | `captureWriters.host.js` → `lifeOsReadClient()` public RPC                                  |
| UI         | `CaptureQuick.svelte` — Inbox button ingests when On                                        |
| RPC canary | PASS — `needs_review`, `autoConvert=false`, outbox pending; cleaned                         |
| Executor   | disabled                                                                                    |

## Music / Home reads

| Domain | Flag                         | Source                       |
| ------ | ---------------------------- | ---------------------------- |
| Music  | `VITE_KENOS_PROD_READ_MUSIC` | `portal_today_summary.music` |
| Home   | `VITE_KENOS_PROD_READ_HOME`  | `portal_today_summary.home`  |

Both default Off. No domain writers.

## Next

1. Deploy Capture ingest on AIOS canary (exact SHA bake) → Owner UI smoke
2. Then Owner-limited production Capture bake
3. Optional Music/Home read bake on AIOS (read-only)
4. Apple physical device remains Owner gate (developer disk image)
