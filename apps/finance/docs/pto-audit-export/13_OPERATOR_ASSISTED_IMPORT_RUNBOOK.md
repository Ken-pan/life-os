# Operator-Assisted Transaction Import (Temporary)

## Scope

This runbook documents the temporary import path before a full in-app CSV wizard exists.

## Inputs

- Normalized source file: `src/data/transactions.json` (local-only, gitignored)
- Target user id: pass via `--user-id=<uuid>` or `FINANCE_OS_USER_ID`

## Steps

1. Prepare normalized `transactions.json` with `categories`, `accounts`, `flowTypes`, and `txns`.
2. Generate SQL batches:

   ```bash
   FINANCE_OS_USER_ID="<target-user-uuid>" node scripts/gen-txn-sql.mjs
   ```

   or

   ```bash
   node scripts/gen-txn-sql.mjs --user-id="<target-user-uuid>"
   ```

3. Review generated files under `scripts/.txn-sql/`.
4. Execute each `batch_*.sql` against Supabase `public.transactions`.
5. Verify inserted row count and sanity-check category/account distribution.
6. Remove local raw artifacts if no longer needed.

## Safety checks

- Never commit `src/data/transactions.json` or `scripts/.txn-sql/*`.
- Confirm target `user_id` before execution.
- Run in small batches and verify after each batch.
