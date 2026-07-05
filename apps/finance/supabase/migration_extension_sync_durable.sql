-- Finance OS — Durable extension sync idempotency (Phase 1)
-- processed_captures table, platform_id on transactions, atomic finalize RPC.

begin;

-- ===================== 扩展 capture 幂等记录 =====================

create table if not exists public.extension_processed_captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  envelope_id text not null,
  payload_hash text not null,
  capture_source text not null,
  capture_kind text not null,
  processed_at timestamptz not null default now(),
  constraint extension_processed_captures_user_envelope_uidx unique (user_id, envelope_id)
);

create index if not exists extension_processed_captures_user_processed_idx
  on public.extension_processed_captures (user_id, processed_at desc);

-- ===================== 交易 platform_id（扩展侧稳定 ID） =====================

alter table public.transactions
  add column if not exists platform_id text,
  add column if not exists capture_source text;

create unique index if not exists transactions_user_capture_platform_uidx
  on public.transactions (user_id, capture_source, platform_id)
  where platform_id is not null and platform_id <> '';

-- ===================== RLS =====================

do $$
declare t text;
begin
  t := 'extension_processed_captures';
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', t || '_select', t);
  execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)', t || '_select', t);
  execute format('drop policy if exists %I on public.%I', t || '_insert', t);
  execute format('create policy %I on public.%I for insert with check ((select auth.uid()) = user_id)', t || '_insert', t);
  execute format('drop policy if exists %I on public.%I', t || '_delete', t);
  execute format('create policy %I on public.%I for delete using ((select auth.uid()) = user_id)', t || '_delete', t);
end $$;

-- ===================== RPC：扩展同步原子落库 =====================

create or replace function public.finalize_extension_sync_v1(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid;
  p_envelope_id text;
  p_payload_hash text;
  p_capture_source text;
  p_capture_kind text;
  v_existing_hash text;
  v_already_processed boolean := false;
  v_inserted_txn integer := 0;
  v_skipped_txn integer := 0;
  v_inserted_assert integer := 0;
  v_txn_rows jsonb := '[]'::jsonb;
  v_txn_elem jsonb;
  v_assert_elem jsonb;
  v_platform_id text;
  v_inserted uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid payload';
  end if;

  p_envelope_id := left(coalesce(payload ->> 'envelope_id', ''), 512);
  p_payload_hash := left(coalesce(payload ->> 'payload_hash', ''), 128);
  p_capture_source := left(coalesce(payload ->> 'capture_source', ''), 64);
  p_capture_kind := left(coalesce(payload ->> 'capture_kind', ''), 64);

  if p_envelope_id = '' or p_payload_hash = '' or p_capture_source = '' or p_capture_kind = '' then
    raise exception 'missing envelope metadata';
  end if;

  select e.payload_hash
    into v_existing_hash
  from public.extension_processed_captures e
  where e.user_id = uid
    and e.envelope_id = p_envelope_id
  for update;

  if found then
    if v_existing_hash <> p_payload_hash then
      raise exception 'envelope payload mismatch for %', p_envelope_id;
    end if;
    v_already_processed := true;
  else
    insert into public.extension_processed_captures (
      user_id,
      envelope_id,
      payload_hash,
      capture_source,
      capture_kind
    )
    values (
      uid,
      p_envelope_id,
      p_payload_hash,
      p_capture_source,
      p_capture_kind
    );
    v_already_processed := false;
  end if;

  if v_already_processed then
    return jsonb_build_object(
      'already_processed', true,
      'inserted_transaction_count', 0,
      'skipped_transaction_count', 0,
      'inserted_assertion_count', 0,
      'transactions', '[]'::jsonb
    );
  end if;

  if jsonb_typeof(payload -> 'transactions') = 'array' then
    for v_txn_elem in select value from jsonb_array_elements(payload -> 'transactions') loop
      v_platform_id := nullif(left(coalesce(v_txn_elem ->> 'platform_id', ''), 256), '');

      if v_platform_id is not null then
        insert into public.transactions (
          user_id,
          txn_date,
          occurred_on,
          merchant,
          merchant_name,
          category,
          normalized_category,
          account,
          source_account_label,
          flow,
          flow_type,
          amount,
          source_amount,
          budget_impact,
          in_spending,
          include_in_spending_analytics,
          in_cash_flow,
          include_in_cash_flow_history,
          exclude_reason,
          source,
          platform_id,
          capture_source,
          review_status,
          review_flags
        )
        values (
          uid,
          (v_txn_elem ->> 'date')::date,
          (v_txn_elem ->> 'date')::date,
          left(coalesce(v_txn_elem ->> 'merchant', ''), 200),
          left(coalesce(v_txn_elem ->> 'merchant', ''), 200),
          left(coalesce(v_txn_elem ->> 'category', 'Uncategorized'), 200),
          left(coalesce(v_txn_elem ->> 'category', 'Uncategorized'), 200),
          left(coalesce(v_txn_elem ->> 'account', 'Unknown'), 200),
          left(coalesce(v_txn_elem ->> 'account', 'Unknown'), 200),
          left(coalesce(v_txn_elem ->> 'flow_type', 'expense'), 64),
          left(coalesce(v_txn_elem ->> 'flow_type', 'expense'), 64),
          coalesce((v_txn_elem ->> 'amount')::numeric, 0),
          coalesce((v_txn_elem ->> 'amount')::numeric, 0),
          coalesce((v_txn_elem ->> 'budget_impact')::numeric, 0),
          coalesce((v_txn_elem ->> 'include_in_spending_analytics')::boolean, false),
          coalesce((v_txn_elem ->> 'include_in_spending_analytics')::boolean, false),
          coalesce((v_txn_elem ->> 'include_in_cash_flow_history')::boolean, false),
          coalesce((v_txn_elem ->> 'include_in_cash_flow_history')::boolean, false),
          nullif(left(coalesce(v_txn_elem ->> 'exclude_reason', ''), 200), ''),
          coalesce(nullif(left(v_txn_elem ->> 'source', ''), 32), 'import'),
          v_platform_id,
          p_capture_source,
          'resolved',
          '[]'::jsonb
        )
        on conflict (user_id, capture_source, platform_id) do nothing
        returning id into v_inserted;

        if v_inserted is null then
          v_skipped_txn := v_skipped_txn + 1;
        else
          v_inserted_txn := v_inserted_txn + 1;
          v_txn_rows := v_txn_rows || jsonb_build_array(
            jsonb_build_object(
              'id', v_inserted,
              'date', v_txn_elem ->> 'date',
              'merchant', v_txn_elem ->> 'merchant',
              'category', coalesce(v_txn_elem ->> 'category', 'Uncategorized'),
              'account', coalesce(v_txn_elem ->> 'account', 'Unknown'),
              'flow_type', coalesce(v_txn_elem ->> 'flow_type', 'expense'),
              'amount', coalesce((v_txn_elem ->> 'amount')::numeric, 0),
              'budget_impact', coalesce((v_txn_elem ->> 'budget_impact')::numeric, 0),
              'include_in_spending_analytics', coalesce((v_txn_elem ->> 'include_in_spending_analytics')::boolean, false),
              'include_in_cash_flow_history', coalesce((v_txn_elem ->> 'include_in_cash_flow_history')::boolean, false),
              'exclude_reason', v_txn_elem ->> 'exclude_reason',
              'source', coalesce(v_txn_elem ->> 'source', 'import'),
              'platform_id', v_platform_id,
              'capture_source', p_capture_source
            )
          );
        end if;
      else
        insert into public.transactions (
          user_id,
          txn_date,
          occurred_on,
          merchant,
          merchant_name,
          category,
          normalized_category,
          account,
          source_account_label,
          flow,
          flow_type,
          amount,
          source_amount,
          budget_impact,
          in_spending,
          include_in_spending_analytics,
          in_cash_flow,
          include_in_cash_flow_history,
          exclude_reason,
          source,
          capture_source,
          review_status,
          review_flags
        )
        values (
          uid,
          (v_txn_elem ->> 'date')::date,
          (v_txn_elem ->> 'date')::date,
          left(coalesce(v_txn_elem ->> 'merchant', ''), 200),
          left(coalesce(v_txn_elem ->> 'merchant', ''), 200),
          left(coalesce(v_txn_elem ->> 'category', 'Uncategorized'), 200),
          left(coalesce(v_txn_elem ->> 'category', 'Uncategorized'), 200),
          left(coalesce(v_txn_elem ->> 'account', 'Unknown'), 200),
          left(coalesce(v_txn_elem ->> 'account', 'Unknown'), 200),
          left(coalesce(v_txn_elem ->> 'flow_type', 'expense'), 64),
          left(coalesce(v_txn_elem ->> 'flow_type', 'expense'), 64),
          coalesce((v_txn_elem ->> 'amount')::numeric, 0),
          coalesce((v_txn_elem ->> 'amount')::numeric, 0),
          coalesce((v_txn_elem ->> 'budget_impact')::numeric, 0),
          coalesce((v_txn_elem ->> 'include_in_spending_analytics')::boolean, false),
          coalesce((v_txn_elem ->> 'include_in_spending_analytics')::boolean, false),
          coalesce((v_txn_elem ->> 'include_in_cash_flow_history')::boolean, false),
          coalesce((v_txn_elem ->> 'include_in_cash_flow_history')::boolean, false),
          nullif(left(coalesce(v_txn_elem ->> 'exclude_reason', ''), 200), ''),
          coalesce(nullif(left(v_txn_elem ->> 'source', ''), 32), 'import'),
          p_capture_source,
          'resolved',
          '[]'::jsonb
        )
        returning id into v_inserted;

        v_inserted_txn := v_inserted_txn + 1;
        v_txn_rows := v_txn_rows || jsonb_build_array(
          jsonb_build_object(
            'id', v_inserted,
            'date', v_txn_elem ->> 'date',
            'merchant', v_txn_elem ->> 'merchant',
            'category', coalesce(v_txn_elem ->> 'category', 'Uncategorized'),
            'account', coalesce(v_txn_elem ->> 'account', 'Unknown'),
            'flow_type', coalesce(v_txn_elem ->> 'flow_type', 'expense'),
            'amount', coalesce((v_txn_elem ->> 'amount')::numeric, 0),
            'budget_impact', coalesce((v_txn_elem ->> 'budget_impact')::numeric, 0),
            'include_in_spending_analytics', coalesce((v_txn_elem ->> 'include_in_spending_analytics')::boolean, false),
            'include_in_cash_flow_history', coalesce((v_txn_elem ->> 'include_in_cash_flow_history')::boolean, false),
            'exclude_reason', v_txn_elem ->> 'exclude_reason',
            'source', coalesce(v_txn_elem ->> 'source', 'import'),
            'capture_source', p_capture_source
          )
        );
      end if;
    end loop;
  end if;

  if jsonb_typeof(payload -> 'balance_assertions') = 'array' then
    for v_assert_elem in select value from jsonb_array_elements(payload -> 'balance_assertions') loop
      insert into public.balance_assertions (
        user_id,
        account_id,
        assertion_date,
        amount,
        note
      )
      values (
        uid,
        left(coalesce(v_assert_elem ->> 'account_id', ''), 128),
        (v_assert_elem ->> 'assertion_date')::date,
        coalesce((v_assert_elem ->> 'amount')::numeric, 0),
        nullif(left(coalesce(v_assert_elem ->> 'note', ''), 500), '')
      );
      v_inserted_assert := v_inserted_assert + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'already_processed', false,
    'inserted_transaction_count', v_inserted_txn,
    'skipped_transaction_count', v_skipped_txn,
    'inserted_assertion_count', v_inserted_assert,
    'transactions', v_txn_rows
  );
end;
$$;

revoke execute on function public.finalize_extension_sync_v1(jsonb) from public;
revoke execute on function public.finalize_extension_sync_v1(jsonb) from anon;
grant execute on function public.finalize_extension_sync_v1(jsonb) to authenticated;

commit;
