# NETWORK_FAILURE_MATRIX

**run:** `soak-2026-07-21T17-26-01-078Z`  
**HEAD:** `71ad6d5f3aca78a1b7985e77061f13fac59afb10`  
**verdict:** `PASS`

| Case | Result | Injected | Recovery ms | Data loss | Auth | Notes |
| --- | --- | --- | ---: | ---: | --- | --- |
| CASE_1_normal_lan | PASS | none | 0 | 0 | none_observed | core paths healthy |
| CASE_2_mac_sleep_proxy | PASS | kenos_ctl_stop_all (Mac sleep phone-visible proxy) | — | 0 | must_not_logout (Owner visual) | services down; native launch may still open; no white-screen claim without screenshot |
| CASE_3_mac_wake_proxy | PASS | none (wake/start) | 74 | 0 | must_not_require_relogin (Owner visual) | services restored after stop |
| CASE_4_restart_aios | PASS | launchctl kickstart -k com.kenpan.kenos-daily-beta.aios | 79 | 0 | none_expected | single-domain restart must not brick shell |
| CASE_4_restart_planner | PASS | launchctl kickstart -k com.kenpan.kenos-daily-beta.planner | 80 | 0 | none_expected | single-domain restart must not brick shell |
| CASE_4_restart_fitness | PASS | launchctl kickstart -k com.kenpan.kenos-daily-beta.fitness | 78 | 0 | none_expected | single-domain restart must not brick shell |
| CASE_5_wifi_proxy | PASS | bogus_port_probe (phone Wi-Fi toggle = OWNER_DOGFOOD) | 0 | 0 | must_not_misclassify_as_logout | classification-only; real Wi-Fi toggle needs Owner |
| CASE_6_lan_identity | PASS | none | 0 | 0 | n/a | P1 residual: origin uses LAN IP (not stable hostname); DHCP change risk |
| CASE_7_mac_reboot_proxy | PASS | stop+start (launchd RunAtLoad rehearsal) | 79 | 0 | none | true reboot OWNER_DOGFOOD; agents verify launchd boot path via ctl start |
| CASE_8_partial_fitness_down | PASS | bootout fitness LaunchAgent | 77 | 0 | none | other domains must stay up; Training unavailable honest |

## Mac sleep/wake honesty

Automated cases use **kenos-ctl stop/start** as the phone-visible backend outage proxy.
True `pmset sleep` is **OWNER_DOGFOOD** (would suspend the agent host).

See also `MAC_SLEEP_WAKE_REPORT.md`.
