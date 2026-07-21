---
title: Kenos app logs — upload · analyze · alert
owner: kenpan
last_verified: 2026-07-21
status: active
---

# Kenos app logs

First-party dogfood telemetry. **No Sentry / Mixpanel / PostHog.**

## Pipeline

```text
iOS KenosLog ──► kenos_ingest_app_logs ──► kenos_app_logs
Web PWA       ──► same RPC (platform-web/kenos-app-logs)
                     │
                     ├─ kenos_app_log_summary(hours)
                     └─ kenos_scan_app_log_alerts() → kenos_app_log_alerts
                            ▲
                     cron: npm run qa:app-logs:apply
```

| Surface                  | Upload                                                                        |
| ------------------------ | ----------------------------------------------------------------------------- |
| Kenos iOS Continuity     | Native `KenosLogCloudSync` (default on, notice+)                              |
| Web inside Continuity    | Skips RPC (native owns cloud); forwards structured events to `kenosNativeLog` |
| Standalone PWA / desktop | `installKenosAppLogs` → RPC (warning+), after sign-in                         |
| Health raw data          | **Never** — Health stays off shared Supabase                                  |

Wired apps: portal · planner · fitness · finance · music · home · aios · knowledge.

## Schema / RPC

| Object                                      | Role                                |
| ------------------------------------------- | ----------------------------------- |
| `kenos_app_log_sessions` / `kenos_app_logs` | Session + events (`20260721144405`) |
| `kenos_ingest_app_logs`                     | Idempotent batch ingest (≤200)      |
| `kenos_app_log_summary(hours)`              | Owner analysis JSON                 |
| `kenos_app_log_alerts`                      | Deduped alert ledger                |
| `kenos_scan_app_log_alerts(mins)`           | Authenticated self-scan             |
| `kenos_scan_app_log_alerts_all(mins)`       | Ops/cron scan (`20260721180000`)    |

## Alert rules (30m window, hourly fingerprint)

| Kind            | Threshold                           | Severity |
| --------------- | ----------------------------------- | -------- |
| `fault_spike`   | ≥1 fault                            | critical |
| `error_burst`   | ≥5 errors                           | warning  |
| `warning_burst` | ≥20 warnings                        | warning  |
| `crash_bug`     | high / MetricKit / crash `bug_logs` | critical |

## Ops

```bash
# Dry-run rule fixture
npm run qa:app-logs

# Scan + list open alerts (needs migration applied + supabase login)
npm run qa:app-logs:apply

# Optional webhook for critical opens
KENOS_APP_LOG_ALERT_WEBHOOK=https://… npm run qa:app-logs:apply -- --webhook
```

Apply migration (owner-approved):

```bash
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260721180000_kenos_app_logs_analyze_alert.sql
```

Quick SQL:

```sql
select public.kenos_app_log_summary(24);
select * from public.kenos_app_log_alerts where status = 'open' order by created_at desc limit 20;
```

## Redaction

Client redacts bearer/JWT/tokens/secrets before upload (parity with iOS `KenosLogRedactor`). Do not log medical/finance payloads or raw connector bodies.
