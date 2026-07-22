# Outbox Worker — Least-Privilege Credential Runbook (G5)

> Today the worker authenticates with the full `service_role` key but needs only
> `EXECUTE` on four RPCs. This migrates it to a dedicated `kenos_worker` role
> presented as a scoped PostgREST JWT. No production credential is created or
> rotated by this milestone — these are Owner steps.

## Credential loading contract (enforced in code)

`apps/planner/server/outboxWorker.core.mjs → resolveCredentialContract({env, argv, envFileMode})`,
wired into `apps/planner/agent/outbox-worker.mjs` at startup. Rules (fail-closed):

1. **No secret in argv** — refuses to start if any `--key=/--token=/--jwt=` flag or a bare `eyJ…` JWT appears in `process.argv` (would be visible in `ps`).
2. **Safe file permissions** — if `~/.kenos/outbox-worker.env` exists, its mode must be `600` (no group/other bits); otherwise the worker refuses to start (`credential_file_permissions_unsafe`).
3. **Prefer least privilege** — if `KENOS_WORKER_JWT` is set, it is used (must match `eyJ…`); else falls back to `SUPABASE_SERVICE_ROLE_KEY` **with a warning** to migrate.
4. **No credential → refuse** (`no_credential`).
5. No secret is ever logged, put in the plist, or passed in argv (the launchd plist `source`s the env file and `exec`s node; the key becomes a process env var only).

Unit tests: `apps/planner/server/outboxWorker.core.test.mjs` (secret-in-argv, unsafe-perms, jwt-preference, malformed-jwt, no-credential, service-role-warning).

## Migration (PREPARED — NOT APPLIED)

`apps/finance/supabase/migrations/PENDING_kenos_worker_role.sql.notapplied`:
- `create role kenos_worker nologin noinherit nobypassrls`
- `grant kenos_worker to authenticator` (PostgREST role-switch)
- `grant usage on schema public` + `grant execute` on exactly `kenos_outbox_worker_{claim,deliver,fail,metrics}`
- `requeue` intentionally **not** granted (operator-only)
- explicit `revoke all` on all public/private tables, sequences, `create` on schema, and default privileges — so the role has nothing but those four EXECUTEs.

Post-apply verification (in the migration footer): `has_function_privilege` = t for the 4 RPCs; `has_table_privilege(...,'insert')` = f; `has_function_privilege(...,'kenos_create_plan_task_action','execute')` = f; `requeue` = f.

## Operational steps (OWNER)

1. `npm run prod:authorize -- --operation apply_migration --project iueozzuctstwvzbcxcyh --ttl 1h --message "G5 worker role"`
2. Rename `PENDING_kenos_worker_role.sql.notapplied` → `<prod-timestamp>_kenos_worker_role.sql`; apply it (gated by step 1); run the footer verification queries.
3. Mint a `kenos_worker` JWT signed with the project JWT secret: claims `{ "role": "kenos_worker", "iss": "kenos-outbox-worker", "exp": <now + 90d> }`. Store **only** the JWT as `KENOS_WORKER_JWT=` in `~/.kenos/outbox-worker.env` (chmod 600) and remove `SUPABASE_SERVICE_ROLE_KEY`.
4. Restart the worker: `apps/planner/agent/install-outbox-worker.sh` (bootout+bootstrap). It will now authenticate as `kenos_worker`; the startup warning about service_role disappears.
5. Rotation: re-mint the JWT before `exp`; the worker picks it up on next restart. Revoke a leaked JWT by rotating the project JWT secret (heavier) or shortening `exp`.

## Rollback

Keep `SUPABASE_SERVICE_ROLE_KEY` in the env file until step 3 is verified; the contract prefers the JWT only when present, so reverting is just removing `KENOS_WORKER_JWT`. Dropping the role: `drop role kenos_worker;` (after the worker is back on service_role). No production rows are affected by any of this.
