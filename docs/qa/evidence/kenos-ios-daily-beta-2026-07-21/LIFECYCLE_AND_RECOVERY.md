# LIFECYCLE_AND_RECOVERY — Ken’s 17 Pro

**run_id:** `lifecycle-2026-07-21T03:28Z`
**HEAD SHA:** `d8ec099ca92055bda74bc0b41bacc5708b303348`
**device / iOS:** 17 Pro / 27.0
**network scope:** LAN-DEPENDENT

## Matrix

| Check | Expected | Actual | Exit | Evidence |
| --- | --- | --- | --- | --- |
| Force quit → reopen | relaunch + shell fetch | launch ec=0 + phone GET `/` | **PASS** | `logs/forcequit-traffic.txt` |
| Backend stop → launch | App does not require Mac forever; launch still returns | launch ec=0 while aios stopped | **PASS** | `logs/offline_down-seq.txt` |
| Backend restart → reload | phone refetches shell | phone GET `/` 200 after `kenos-ctl restart` | **PASS** | `logs/recovery-seq-traffic.txt` |
| Lock → unlock | launch fails Locked; succeeds after unlock | observed both | **PASS** | `logs/UNLOCKED.flag`, earlier Locked launch logs |
| Wi‑Fi → Cellular | honest degrade off LAN | **NOT RUN** (owner toggle) | HOLD | — |
| Dark / Dynamic Type / VO / Reduce Motion | owner interactive | **NOT RUN** | HOLD | — |
| Safe area / 44×44 | code + prior visual rescue | not re-measured this run | PARTIAL | prior rescue docs |

## Honesty rule

Cellular cannot reach Mac LAN — that is **not** a product defect under **LAN-DEPENDENT** Daily Beta. Must show degraded/offline, not infinite loading.
