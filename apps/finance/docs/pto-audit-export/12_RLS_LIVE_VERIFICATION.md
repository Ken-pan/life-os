# RLS Live Verification (Supabase)

Status: **PARTIALLY VERIFIED** (manual run required in deployed project)

## Tables requiring RLS

- `user_settings`
- `accounts`
- `cash_flows`
- `scenario_events`
- `goals`
- `transactions`
- `allowed_devices`
- `finance_data` (legacy backup table)

## Manual verification steps (deployed Supabase project)

1. Open Supabase dashboard -> SQL editor.
2. Confirm RLS enabled for each table above:
   - `select relname, relrowsecurity from pg_class where relname in (...)`
3. Confirm row policies exist for select/insert/update/delete and scope to `auth.uid() = user_id`.
4. In Authentication, create two test users: `user_a`, `user_b`.
5. Obtain access tokens for both users.
6. Execute API/SQL operations under each token to validate isolation.

## Two-user isolation matrix

| Table | Operation | User A own rows | User A on User B rows | Expected |
| --- | --- | --- | --- | --- |
| `accounts` | select | allowed | denied | isolated |
| `accounts` | insert | allowed (user_id=A) | denied (user_id=B) | isolated |
| `accounts` | update | allowed own | denied other | isolated |
| `accounts` | delete | allowed own | denied other | isolated |
| `cash_flows` | select/insert/update/delete | same as above | same as above | isolated |
| `scenario_events` | select/insert/update/delete | same as above | same as above | isolated |
| `goals` | select/insert/update/delete | same as above | same as above | isolated |
| `transactions` | select/insert/update/delete | same as above | same as above | isolated |
| `user_settings` | select/insert/update/delete | same as above | same as above | isolated |
| `allowed_devices` | select/insert/update/delete | same as above | same as above | isolated |
| `finance_data` | select/insert/update/delete | same as above | same as above | isolated |

## Supabase Security Advisor

- Advisor result: **UNVERIFIED (placeholder)**
- Action: Run Security Advisor in production project and paste findings here.

## Verification status

- Schema-level RLS declarations in repo: **VERIFIED**
- Live deployed policies by manual test: **UNVERIFIED**
- Two-user isolation select/insert/update/delete: **UNVERIFIED**
- Security Advisor review: **UNVERIFIED**

## Notes

- This file intentionally distinguishes schema intent vs live verification.
- PTO sign-off should require live two-user evidence before claiming full RLS verification.
