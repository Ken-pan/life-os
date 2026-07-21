# MAC_SLEEP_WAKE_REPORT

**Automated proxy:** CASE_2 / CASE_3 in NETWORK_FAILURE_MATRIX (`kenos-ctl stop` → `start`).
**True Mac sleep:** OWNER_DOGFOOD — OPEN
**True Mac reboot:** OWNER_DOGFOOD — OPEN (CASE_7 rehearses launchd start path only)

| Check | Automated | Owner |
| --- | --- | --- |
| Backend unavailable UI | PARTIAL (service down proven) | Confirm no white screen |
| last-known-good retained | NOT_MEASURED in XCUI | Confirm |
| Continue not wiped | NOT_MEASURED in XCUI | Confirm |
| Auth not cleared | NOT_MEASURED in XCUI | Confirm |
| Auto/manual retry after wake | service restore PASS | Confirm UI retry |
