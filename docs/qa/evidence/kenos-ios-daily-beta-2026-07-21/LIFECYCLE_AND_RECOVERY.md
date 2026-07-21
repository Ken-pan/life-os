# LIFECYCLE_AND_RECOVERY — Kenos iOS Daily Beta

**Updated:** 2026-07-21T05:45Z · build `202607210524`

| Scenario | Result | Notes |
| --- | --- | --- |
| Background → foreground | PASS | Continuity reopen keeps Training Set 2 / Plan MUT |
| Force quit → reopen | PASS | Flow A verify beacon + Flow B assert without `kenosSet` |
| Lock → unlock | PASS | `devicectl` launch after unlock poll |
| LAN service stop | PASS | `kenos-ctl stop` → unreachable path |
| LAN service restore | PASS | `kenos-ctl start` → shell recovers |
| Rollback | PASS | same as offline restore path |

Evidence: `logs/ios-matrix-close-latest.json`, `ios-daily-beta-results.json`.
