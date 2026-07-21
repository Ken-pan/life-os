# PREFLIGHT_REPORT

**ts:** 2026-07-21T17:25:21.171Z
**HEAD:** `71ad6d5f3aca78a1b7985e77061f13fac59afb10`
**formal baseline:** `502d805c28b29d3d50c0efa2699ab717a301ac45`
**verdict:** `PASS`

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
| build_sha_recorded | true | product | ios=71ad6d5f3 release=71ad6d5f3 |
| head_vs_installed_drift | true | product | aligned |
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
