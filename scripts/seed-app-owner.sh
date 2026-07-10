#!/usr/bin/env bash
# Usage: ./scripts/seed-app-owner.sh <user-email>
# Example: ./scripts/seed-app-owner.sh ken@example.com

set -euo pipefail

EMAIL=$1

if [ -z "$EMAIL" ]; then
  echo "Usage: $0 <user-email>"
  exit 1
fi

echo "Looking up UUID for $EMAIL..."
# In a real environment, you might query Supabase auth API or use the local CLI.
# Using supabase-sql.sh to run a query to get the UUID.

# The query below assumes we can query auth.users directly via our SQL script.
UUID=$(./scripts/supabase-sql.sh "SELECT id FROM auth.users WHERE email = '$EMAIL' LIMIT 1" | grep -E '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')

if [ -z "$UUID" ]; then
  echo "Could not find user with email $EMAIL in auth.users."
  exit 1
fi

echo "Found UUID: $UUID"
echo "Seeding owner roles for all apps..."

SEED_SQL="
insert into public.app_memberships (
  app_key, user_id, role, status, granted_by, activated_at
)
values
  ('planner', '$UUID', 'owner', 'active', '$UUID', now()),
  ('fitness', '$UUID', 'owner', 'active', '$UUID', now()),
  ('finance', '$UUID', 'owner', 'active', '$UUID', now()),
  ('music',   '$UUID', 'owner', 'active', '$UUID', now()),
  ('home',    '$UUID', 'owner', 'active', '$UUID', now()),
  ('paper',   '$UUID', 'owner', 'active', '$UUID', now()),
  ('portal',  '$UUID', 'owner', 'active', '$UUID', now())
on conflict (app_key, user_id)
do update set
  role = excluded.role,
  status = excluded.status,
  updated_at = now();
"

./scripts/supabase-sql.sh "$SEED_SQL"

echo "Done! Seeded owner roles for $EMAIL ($UUID)."
