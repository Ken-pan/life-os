-- Kenos Production Wave 1 formal migration (additive).
-- Canonical apply source after APPROVE_KENOS_PRODUCTION_WAVE_1.
-- Historical review evidence: apps/planner/supabase/review/20260719110000_kenos_focus_context.sql
-- Prerequisites: remote tip > 20260717220000; backward-compatible; retry-safe.
-- Explicit exclusions: planner_tasks direct-write revoke; writer/Portal cutover; production seed.

set lock_timeout = '5s';
set statement_timeout = '30s';

create table if not exists public.kenos_focus_contexts (
  id uuid primary key,
  version text not null default '1' check (version = '1'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in (
    'training', 'deep_work', 'meeting', 'reading', 'home_organizing',
    'finance_review', 'wind_down', 'custom'
  )),
  active_space text not null,
  active_session_ref jsonb,
  started_at timestamptz,
  expected_end_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  status text not null check (status in (
    'inactive', 'starting', 'active', 'temporarily_left', 'paused',
    'ending', 'completed', 'cancelled'
  )),
  visible_domains jsonb not null default '[]'::jsonb,
  hidden_domains jsonb not null default '[]'::jsonb,
  allowed_interruption_categories jsonb not null default '[]'::jsonb,
  assistant_scope jsonb not null,
  notification_policy_ref text not null,
  deferred_queue_ref uuid not null,
  return_destination jsonb not null,
  source text not null check (source in (
    'user', 'assistant_suggestion', 'apple_focus_suggestion', 'system', 'deep_link'
  )),
  classification text not null check (classification in (
    'public', 'personal', 'sensitive', 'work_confidential', 'restricted_local_only', 'ephemeral'
  )),
  title text not null check (length(btrim(title)) between 1 and 120),
  safe_summary text not null check (
    length(btrim(safe_summary)) between 1 and 500
    and safe_summary !~* '\m(token|secret|password|authorization|cookie|bearer)\M'
  ),
  correlation_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint kenos_focus_contexts_timestamps_check check (updated_at >= created_at),
  constraint kenos_focus_contexts_visible_check check (jsonb_typeof(visible_domains) = 'array'),
  constraint kenos_focus_contexts_hidden_check check (jsonb_typeof(hidden_domains) = 'array')
);

create index if not exists kenos_focus_contexts_owner_status_idx
  on public.kenos_focus_contexts (owner_id, status, updated_at desc);

create table if not exists public.kenos_deferred_items (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  focus_context_id uuid not null references public.kenos_focus_contexts (id) on delete cascade,
  source_domain text not null,
  source_entity_ref jsonb,
  category text not null,
  safe_summary text not null check (
    length(btrim(safe_summary)) between 1 and 300
    and safe_summary !~* '\m(token|secret|password|authorization|cookie|bearer)\M'
  ),
  classification text not null,
  original_created_at timestamptz not null,
  deferred_at timestamptz not null,
  release_at timestamptz,
  expiry timestamptz,
  urgency text not null check (urgency in ('low', 'normal', 'high', 'critical')),
  status text not null check (status in ('pending', 'released', 'dismissed', 'expired', 'superseded')),
  reason text not null,
  correlation_id uuid not null
);

create index if not exists kenos_deferred_items_focus_status_idx
  on public.kenos_deferred_items (focus_context_id, status, deferred_at desc);

create table if not exists public.kenos_proactive_suggestions (
  id uuid primary key,
  version text not null default '1' check (version = '1'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('rule', 'session', 'assistant', 'system', 'apple_focus')),
  target_domain text not null,
  focus_context_id uuid references public.kenos_focus_contexts (id) on delete set null,
  suggestion_type text not null,
  title text not null,
  safe_summary text not null,
  rationale text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  risk text not null check (risk in ('R0', 'R1', 'R2', 'R3', 'R4')),
  proposed_action jsonb not null,
  approval_requirement text not null check (
    approval_requirement in ('none', 'confirm', 'strong_confirm', 'fail_closed')
  ),
  created_at timestamptz not null,
  expires_at timestamptz,
  status text not null check (status in (
    'generated', 'shown', 'accepted', 'dismissed', 'expired',
    'superseded', 'converted_to_action', 'failed'
  )),
  dismissal_reason text,
  feedback text,
  classification text not null,
  correlation_id uuid not null,
  why_now text not null,
  signals_used jsonb not null default '[]'::jsonb,
  impact_summary text not null
);

create index if not exists kenos_proactive_suggestions_owner_status_idx
  on public.kenos_proactive_suggestions (owner_id, status, created_at desc);

alter table public.kenos_focus_contexts enable row level security;
alter table public.kenos_deferred_items enable row level security;
alter table public.kenos_proactive_suggestions enable row level security;

drop policy if exists kenos_focus_contexts_select_own on public.kenos_focus_contexts;
create policy kenos_focus_contexts_select_own
  on public.kenos_focus_contexts for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists kenos_deferred_items_select_own on public.kenos_deferred_items;
create policy kenos_deferred_items_select_own
  on public.kenos_deferred_items for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists kenos_proactive_suggestions_select_own on public.kenos_proactive_suggestions;
create policy kenos_proactive_suggestions_select_own
  on public.kenos_proactive_suggestions for select to authenticated
  using ((select auth.uid()) = owner_id);

-- Authenticated clients must not directly write Focus tables in Wave 1.
-- Mutations go through future SECURITY DEFINER command RPCs (not opened here).
revoke insert, update, delete on public.kenos_focus_contexts from anon, authenticated;
revoke insert, update, delete on public.kenos_deferred_items from anon, authenticated;
revoke insert, update, delete on public.kenos_proactive_suggestions from anon, authenticated;
grant select on public.kenos_focus_contexts to authenticated;
grant select on public.kenos_deferred_items to authenticated;
grant select on public.kenos_proactive_suggestions to authenticated;

-- Placeholder read RPC (owner-bound). Expand after Wave 1 approval.
create or replace function public.kenos_list_focus_contexts()
returns setof public.kenos_focus_contexts
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from public.kenos_focus_contexts
  where owner_id = (select auth.uid())
  order by updated_at desc;
$$;

revoke all on function public.kenos_list_focus_contexts() from public, anon;
grant execute on function public.kenos_list_focus_contexts() to authenticated;
