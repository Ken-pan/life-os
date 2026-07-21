# APP_LOG_PRIVACY_AUDIT

**ts:** 2026-07-21T17:26:39.612Z
**HEAD:** `71ad6d5f3aca78a1b7985e77061f13fac59afb10`

## Rules enforced in export

- JWT / access_token / refresh_token → redacted
- Emails → redacted
- No task titles, health details, finance amounts, note bodies, Home images

## Retention

- Local LaunchAgent logs exported as **tail ≤ 512 KiB** per file
- Evidence `dogfood-events.jsonl` stores machine events only (no payloads)

## Categories expected in native `KenosLog`

launch · auth · navigation · domain · network · recovery · webview · continuity · isolation · crash · warning

Each event should carry: timestamp, build SHA, device, session ID, masked UID, category, code, recoverable, domain, correlation ID — verified in code review; runtime sample may be empty offline.

## Outbox honesty

`kenos_app_logs` ingest ≠ outbox delivery worker complete.
