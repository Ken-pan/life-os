-- FINC.PURCHASE.6.a — Purchase Review data foundation.
--
-- Durable transaction↔order association + append-only decision events, so
-- Confirm / Reject / Undo become authoritative review state instead of being
-- inferred from (and unsafely written into) finance_transactions.purchase_enrichment.
--
-- SSOT for the mutation semantics is the pure engine
-- packages/finance-core/src/engine/purchaseReviewDecision.ts (unit-tested). These
-- RPCs mirror it exactly: optimistic association_version, action_key idempotency,
-- single-step latest-first Undo, and manual-decision precedence.
--
-- Design source: apps/finance/docs/FP6_PURCHASE_REVIEW_DATA_CONTRACT.md
--
-- NOTE: purchase_enrichment JSONB remains the enrichment payload only — never
-- authoritative review state.

-- ─────────────────────────────── Tables ───────────────────────────────

create table if not exists public.purchase_associations (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  transaction_id       uuid not null references public.finance_transactions (id) on delete cascade,
  source               text not null,
  external_order_id    text not null,
  state                text not null default 'proposed',
  association_version  integer not null default 0,
  decision_version     integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint purchase_associations_state_check
    check (state in ('proposed', 'confirmed', 'rejected')),
  constraint purchase_associations_source_check
    check (source in ('amazon', 'bestbuy', 'target')),
  -- Stable candidate identity: one transaction + order pairing = one row.
  constraint purchase_associations_candidate_uniq
    unique (transaction_id, source, external_order_id)
);

comment on table public.purchase_associations is
  'FINC.PURCHASE.6.a authoritative transaction↔order review state. purchase_enrichment JSONB stays enrichment-only.';

create index if not exists purchase_associations_user_txn_idx
  on public.purchase_associations (user_id, transaction_id);
create index if not exists purchase_associations_user_state_idx
  on public.purchase_associations (user_id, state);

create table if not exists public.purchase_decisions (
  id                            uuid primary key default gen_random_uuid(),
  user_id                       uuid not null references auth.users (id) on delete cascade,
  association_id                uuid not null references public.purchase_associations (id) on delete cascade,
  action_key                    text not null,
  action_type                   text not null,
  from_state                    text not null,
  to_state                      text not null,
  expected_association_version  integer not null,
  resulting_association_version integer not null,
  reverses_decision_id          uuid references public.purchase_decisions (id),
  created_at                    timestamptz not null default now(),
  constraint purchase_decisions_action_type_check
    check (action_type in ('confirm', 'reject', 'undo')),
  -- Idempotency: a repeated client action_key resolves to the same event.
  constraint purchase_decisions_idempotency_uniq
    unique (association_id, action_key)
);

comment on table public.purchase_decisions is
  'FINC.PURCHASE.6.a append-only decision events (confirm/reject/undo). Undo appends; history is never rewritten.';

create index if not exists purchase_decisions_assoc_created_idx
  on public.purchase_decisions (association_id, created_at);

-- ─────────────────────────────── RLS ───────────────────────────────
-- Same ownership rule as finance_transactions: owner + finance app access.

alter table public.purchase_associations enable row level security;
alter table public.purchase_decisions   enable row level security;

drop policy if exists purchase_associations_select on public.purchase_associations;
create policy purchase_associations_select on public.purchase_associations
  for select using (
    (select auth.uid()) = user_id and private.has_app_access('finance')
  );

drop policy if exists purchase_associations_insert on public.purchase_associations;
create policy purchase_associations_insert on public.purchase_associations
  for insert with check (
    (select auth.uid()) = user_id and private.has_app_access('finance')
  );

drop policy if exists purchase_associations_update on public.purchase_associations;
create policy purchase_associations_update on public.purchase_associations
  for update using (
    (select auth.uid()) = user_id and private.has_app_access('finance')
  ) with check (
    (select auth.uid()) = user_id and private.has_app_access('finance')
  );

drop policy if exists purchase_decisions_select on public.purchase_decisions;
create policy purchase_decisions_select on public.purchase_decisions
  for select using (
    (select auth.uid()) = user_id and private.has_app_access('finance')
  );

drop policy if exists purchase_decisions_insert on public.purchase_decisions;
create policy purchase_decisions_insert on public.purchase_decisions
  for insert with check (
    (select auth.uid()) = user_id and private.has_app_access('finance')
  );
-- Decisions are append-only: no update / delete policies (deny by default).

-- ─────────────────────────────── Helpers ───────────────────────────────

-- Serialize a full review state (association + decision history) as jsonb.
create or replace function public.purchase_review_get(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_assoc  public.purchase_associations%rowtype;
  v_result jsonb;
begin
  select * into v_assoc
  from public.purchase_associations
  where transaction_id = p_transaction_id
  order by updated_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'no_association');
  end if;

  select jsonb_build_object(
    'ok', true,
    'status', 200,
    'association', to_jsonb(v_assoc),
    'decisions', coalesce(
      (select jsonb_agg(to_jsonb(d) order by d.created_at)
         from public.purchase_decisions d
        where d.association_id = v_assoc.id),
      '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Confirm or reject a proposed association. Mirrors applyConfirmOrReject().
create or replace function public.purchase_review_decide(
  p_association_id uuid,
  p_action_type    text,
  p_expected_version integer,
  p_action_key     text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_assoc    public.purchase_associations%rowtype;
  v_existing public.purchase_decisions%rowtype;
  v_to_state text;
  v_new_ver  integer;
  v_decision public.purchase_decisions%rowtype;
begin
  if p_action_type not in ('confirm', 'reject') then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'invalid_action');
  end if;

  -- Lock the association row for the duration of the mutation.
  select * into v_assoc
  from public.purchase_associations
  where id = p_association_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'no_association');
  end if;

  -- Idempotency: same action_key returns the original decision, no new event.
  select * into v_existing
  from public.purchase_decisions
  where association_id = p_association_id and action_key = p_action_key;
  if found then
    return jsonb_build_object(
      'ok', true, 'status', 200, 'idempotentReplay', true,
      'association', to_jsonb(v_assoc), 'decision', to_jsonb(v_existing));
  end if;

  if v_assoc.state <> 'proposed' then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'not_proposed',
      'association', to_jsonb(v_assoc));
  end if;
  if v_assoc.association_version <> p_expected_version then
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'version_conflict',
      'association', to_jsonb(v_assoc));
  end if;

  v_to_state := case when p_action_type = 'confirm' then 'confirmed' else 'rejected' end;
  v_new_ver  := v_assoc.association_version + 1;

  insert into public.purchase_decisions (
    user_id, association_id, action_key, action_type, from_state, to_state,
    expected_association_version, resulting_association_version, reverses_decision_id
  ) values (
    v_assoc.user_id, v_assoc.id, p_action_key, p_action_type, 'proposed', v_to_state,
    p_expected_version, v_new_ver, null
  )
  returning * into v_decision;

  update public.purchase_associations
  set state = v_to_state,
      association_version = v_new_ver,
      decision_version = decision_version + 1,
      updated_at = now()
  where id = v_assoc.id
  returning * into v_assoc;

  return jsonb_build_object('ok', true, 'status', 200,
    'association', to_jsonb(v_assoc), 'decision', to_jsonb(v_decision));
end;
$$;

-- Undo the latest reversible decision. Mirrors applyUndo().
create or replace function public.purchase_review_undo(
  p_association_id   uuid,
  p_target_decision_id uuid,
  p_expected_version integer,
  p_action_key       text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_assoc     public.purchase_associations%rowtype;
  v_existing  public.purchase_decisions%rowtype;
  v_target    public.purchase_decisions%rowtype;
  v_latest_id uuid;
  v_new_ver   integer;
  v_decision  public.purchase_decisions%rowtype;
begin
  select * into v_assoc
  from public.purchase_associations
  where id = p_association_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'no_association');
  end if;

  -- Idempotent replay.
  select * into v_existing
  from public.purchase_decisions
  where association_id = p_association_id and action_key = p_action_key;
  if found then
    return jsonb_build_object(
      'ok', true, 'status', 200, 'idempotentReplay', true,
      'association', to_jsonb(v_assoc), 'decision', to_jsonb(v_existing));
  end if;

  select * into v_target
  from public.purchase_decisions
  where id = p_target_decision_id and association_id = p_association_id;
  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'unknown_decision',
      'association', to_jsonb(v_assoc));
  end if;

  -- Already reversed by a prior undo → superseded.
  if exists (
    select 1 from public.purchase_decisions
    where association_id = p_association_id
      and action_type = 'undo'
      and reverses_decision_id = v_target.id
  ) then
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'superseded',
      'association', to_jsonb(v_assoc));
  end if;

  -- Latest reversible = most recent confirm/reject not yet reversed.
  select d.id into v_latest_id
  from public.purchase_decisions d
  where d.association_id = p_association_id
    and d.action_type in ('confirm', 'reject')
    and not exists (
      select 1 from public.purchase_decisions u
      where u.association_id = p_association_id
        and u.action_type = 'undo'
        and u.reverses_decision_id = d.id
    )
  order by d.created_at desc, d.id desc
  limit 1;

  if v_latest_id is null or v_latest_id <> v_target.id then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'not_reversible',
      'association', to_jsonb(v_assoc));
  end if;
  if v_assoc.association_version <> p_expected_version then
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'version_conflict',
      'association', to_jsonb(v_assoc));
  end if;

  v_new_ver := v_assoc.association_version + 1;

  insert into public.purchase_decisions (
    user_id, association_id, action_key, action_type, from_state, to_state,
    expected_association_version, resulting_association_version, reverses_decision_id
  ) values (
    v_assoc.user_id, v_assoc.id, p_action_key, 'undo', v_assoc.state, v_target.from_state,
    p_expected_version, v_new_ver, v_target.id
  )
  returning * into v_decision;

  update public.purchase_associations
  set state = v_target.from_state,
      association_version = v_new_ver,
      decision_version = decision_version + 1,
      updated_at = now()
  where id = v_assoc.id
  returning * into v_assoc;

  return jsonb_build_object('ok', true, 'status', 200,
    'association', to_jsonb(v_assoc), 'decision', to_jsonb(v_decision));
end;
$$;

-- ─────────────────────────────── Backfill ───────────────────────────────
-- Seed a `proposed` association for every transaction whose enrichment already
-- carries a supported source + concrete order id. Idempotent (unique candidate
-- key). Does NOT touch purchase_enrichment.

insert into public.purchase_associations (user_id, transaction_id, source, external_order_id, state)
select
  t.user_id,
  t.id,
  t.purchase_enrichment->>'source',
  t.purchase_enrichment->>'orderId',
  'proposed'
from public.finance_transactions t
where t.purchase_enrichment is not null
  and (t.purchase_enrichment->>'source') in ('amazon', 'bestbuy', 'target')
  and coalesce(t.purchase_enrichment->>'orderId', '') <> ''
on conflict (transaction_id, source, external_order_id) do nothing;

-- ─────────────────────────────── Grants ───────────────────────────────

revoke all on function public.purchase_review_get(uuid) from public;
grant execute on function public.purchase_review_get(uuid) to authenticated;

revoke all on function public.purchase_review_decide(uuid, text, integer, text) from public;
grant execute on function public.purchase_review_decide(uuid, text, integer, text) to authenticated;

revoke all on function public.purchase_review_undo(uuid, uuid, integer, text) from public;
grant execute on function public.purchase_review_undo(uuid, uuid, integer, text) to authenticated;

notify pgrst, 'reload schema';
