# PREFLIGHT_REPORT

**ts:** 2026-07-22T04:33:38.089Z
**HEAD:** `4a4e9821ffc8a4adabc33c480ee0a98914a810ff`
**formal baseline:** `502d805c28b29d3d50c0efa2699ab717a301ac45`
**verdict:** `PASS_WITH_REBUILD_REQUIRED`

## Checks

| Name | OK | Category | Reason |
| --- | --- | --- | --- |
| 17_pro_connected | true | device | online |
| Kenos | true | product | installed |
| lan_origin_reachable | true | service | health_200 |
| service_aios | true | service | up |
| service_planner | true | service | up |
| service_fitness | true | service | up |
| service_finance | true | service | up |
| service_knowledge | true | service | up |
| service_music | true | service | up |
| service_home | true | service | up |
| service_health | true | service | up |
| build_sha_recorded | true | product | ios=05930e624 release=4b590f2cb |
| head_vs_installed_drift | false | product | HEAD≠installed (need rebuild). head= installed=05930e624 |
| stable_hostname_origin | true | product | mdns=kens-m5-max-macbook-pro.tail04e0e6.ts.net |
| app_launchable | true | product | launched |
| wkwebview_payload | true | product | payload_launch_accepted |
| auth_bootstrap_surface | true | product | deferred_to_smoke_flow_a (no token in preflight) |
| continue_store_readable | true | product | native_store_assumed; verified in continuity soak |
| app_log_path | true | product | kenos_app_logs schema exists; export in log-export |
| legacy_fallback_available | true | product | production_fallback_retained_in_settings |
| rollback_target | true | service | previous_release_present |

## Repairs

_none_

## Policy

- Environment/device failures are not counted as product regressions.
- Soak must not start on `FAIL_NO_SOAK`.
- `PASS_WITH_REBUILD_REQUIRED` means rebuild+install current HEAD before claiming current-HEAD stability.
