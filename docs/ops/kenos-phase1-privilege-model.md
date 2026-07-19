---
title: Kenos Phase 1 production privilege review model
owner: kenpan
last_verified: 2026-07-19
doc_role: production-security-review-package
status: local-disposable-proof-production-review-required
---

# Kenos Phase 1 production privilege review model

This package describes the proposed privileges for `plan.create_task`. Nothing
here has been applied to a remote or production database. The executable SQL is
kept under `apps/planner/supabase/review/` and is intentionally outside the
automatic migration chain.

## Privilege matrix

| Principal | Command RPC | Task/internal tables | Activity / Outbox read | Outbox delivery | Notes |
| --- | --- | --- | --- | --- | --- |
| `anon` | none | none | none | none | Fail closed. |
| `authenticated` | execute `public.kenos_create_plan_task_action(jsonb)` | no direct Kenos writes; no idempotency visibility; existing `planner_tasks` read remains user-scoped | own Activity and Outbox through RLS; read-only | none | Actor/owner comes from `auth.uid()`, never payload authority. |
| `kenos_outbox_worker` | none | no Task, Activity, idempotency, or direct Outbox DML | none | execute only `private.kenos_transition_plan_outbox(...)` | `NOLOGIN`, `NOINHERIT`, no `BYPASSRLS`; a separately approved controlled runtime identity would need membership. |
| `service_role` | no Kenos-specific grant required | no new grant in this package | no new grant | no worker-function grant | Reserved for controlled administration/testing; not a Web, plugin, Apple, Assistant, or ordinary worker credential. |
| migration owner | creates/owns tables and functions | full DDL for the reviewed migration only | full for migration | grants worker function | Must be distinct from runtime roles and human-reviewed. |
| function owner | owns the two fixed-search-path definers | atomic command or one compare-and-set Outbox transition | writes only required rows | transition only | Must not be `anon`, `authenticated`, `service_role`, or the worker role. |

There are no sequences in this draft: identifiers use `gen_random_uuid()`, so
no sequence grants are required. Public schema usage remains the platform
default; `private` schema usage is denied to clients and granted only to the
logical worker for its one explicitly granted function.

## Function and RLS posture

- The public command wrapper is the only client-callable RPC. It uses
  `SECURITY DEFINER` solely so the authenticated caller cannot reach the private
  executor directly. Both functions set `search_path = ''` and use qualified
  object names.
- The private executor binds `actor.id` and row `user_id` to `auth.uid()`,
  validates version/domain/classification/risk/expiry, and performs Task,
  idempotency, Outbox, and Activity writes in one transaction.
- `authenticated` has no insert/update/delete grant on Kenos internal tables.
  Activity and Outbox have `TO authenticated` owner-scoped SELECT policies.
  The idempotency table is not client-readable.
- The worker cannot update the Outbox table directly. Its definer function
  enforces the manifest transition graph and compare-and-set expected status;
  published/dead-letter rows cannot re-enter delivery.
- Activity is user-readable but cannot be forged. Sensitive Activity fields are
  validated/redacted before insertion.

## Threat model and proof

| Threat | Control | Disposable proof |
| --- | --- | --- |
| Payload owner/actor spoofing | `auth.uid()` binding in private executor | second user and actor mismatch rejected |
| Direct Task/internal-table bypass | revoke client DML; command RPC only | direct Outbox write denied; ACL assertions |
| Calling private executor | revoke execute and private schema usage | `has_function_privilege`/`has_schema_privilege` false |
| Search-path object substitution | empty `search_path`; qualified names | SQL invariant guard and DB lint |
| Replay creates duplicate Task | user/action/idempotency uniqueness | canonical replay returns first Task |
| Action UUID rebound to new key | unique `(user_id, action_id)` | `action_id_reused` rejection |
| Worker jumps terminal state | transition graph + compare-and-set | published to retry rejected |
| Worker broad data access | no table grants; one function only | direct Outbox update and Activity read denied |
| Secret copied to Activity | recursive redaction validation | canonical raw-token Activity rejected in TS/Swift |
| Anonymous execution | no RPC execute grant | ACL assertion |

Run the proof with:

```bash
node scripts/test-kenos-phase1-db.mjs
npx supabase db lint --local --workdir apps/planner --level warning --fail-on error
```

The first command creates and removes a disposable Supabase Postgres container;
it applies both review artifacts and runs transaction, identity, RLS, privilege,
and worker-transition tests using the canonical JSON corpus.

## Production review and rollback

Before production apply, the owner and security reviewer must approve the
function owner, migration executor, dedicated worker login/membership strategy,
PostgREST exposed schemas, JWT/RLS behavior, and audit/alert routing. Re-run the
tests against a disposable restore of the current production schema and run the
Supabase security/performance advisors. The local CLI exposes `db lint` but no
advisor command; remote advisors were not run because production access is
prohibited.

If privileges must be revoked before any writer cutover:

```sql
revoke execute on function public.kenos_create_plan_task_action(jsonb) from authenticated;
revoke execute on function private.kenos_transition_plan_outbox(uuid, text, text, text, text, timestamptz) from kenos_outbox_worker;
revoke usage on schema private from kenos_outbox_worker;
```

Then set the server writer flag Off and stop the worker. Do not drop Tasks,
Activity, Outbox, or idempotency rows during rollback. Dropping review objects is
allowed only after retention/reconciliation approval; it is not part of the
initial rollback.
