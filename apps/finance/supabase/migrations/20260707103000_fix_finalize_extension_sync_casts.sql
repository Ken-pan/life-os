-- Extension sync RPC: tolerate empty-string JSON fields (22P02 on "" casts).

create or replace function public.fos_ext_json_bool(
  elem jsonb,
  key text,
  default_val boolean default false
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when elem -> key is null or jsonb_typeof(elem -> key) = 'null' then default_val
    when jsonb_typeof(elem -> key) = 'boolean' then (elem ->> key)::boolean
    when btrim(coalesce(elem ->> key, '')) = '' then default_val
    when lower(elem ->> key) in ('true', 't', '1', 'yes') then true
    when lower(elem ->> key) in ('false', 'f', '0', 'no') then false
    else default_val
  end;
$$;

create or replace function public.fos_ext_json_numeric(
  elem jsonb,
  key text,
  default_val numeric default 0
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when elem -> key is null or jsonb_typeof(elem -> key) = 'null' then default_val
    when btrim(coalesce(elem ->> key, '')) = '' then default_val
    else (elem ->> key)::numeric
  end;
$$;

create or replace function public.fos_ext_json_date(elem jsonb, key text)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when btrim(coalesce(elem ->> key, '')) = '' then null::date
    else (elem ->> key)::date
  end;
$$;

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
  v_txn_date date;
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
  from public.finance_extension_processed_captures e
  where e.user_id = uid
    and e.envelope_id = p_envelope_id
  for update;

  if found then
    if v_existing_hash <> p_payload_hash then
      raise exception 'envelope payload mismatch for %', p_envelope_id;
    end if;
    v_already_processed := true;
  else
    insert into public.finance_extension_processed_captures (
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
      v_txn_date := public.fos_ext_json_date(v_txn_elem, 'date');
      if v_txn_date is null then
        v_skipped_txn := v_skipped_txn + 1;
        continue;
      end if;

      v_platform_id := nullif(left(coalesce(v_txn_elem ->> 'platform_id', ''), 256), '');

      if v_platform_id is not null then
        insert into public.finance_transactions (
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
          v_txn_date,
          v_txn_date,
          left(coalesce(v_txn_elem ->> 'merchant', ''), 200),
          left(coalesce(v_txn_elem ->> 'merchant', ''), 200),
          left(coalesce(v_txn_elem ->> 'category', 'Uncategorized'), 200),
          left(coalesce(v_txn_elem ->> 'category', 'Uncategorized'), 200),
          left(coalesce(v_txn_elem ->> 'account', 'Unknown'), 200),
          left(coalesce(v_txn_elem ->> 'account', 'Unknown'), 200),
          left(coalesce(v_txn_elem ->> 'flow_type', 'expense'), 64),
          left(coalesce(v_txn_elem ->> 'flow_type', 'expense'), 64),
          public.fos_ext_json_numeric(v_txn_elem, 'amount', 0),
          public.fos_ext_json_numeric(v_txn_elem, 'amount', 0),
          public.fos_ext_json_numeric(v_txn_elem, 'budget_impact', 0),
          public.fos_ext_json_bool(v_txn_elem, 'include_in_spending_analytics', false),
          public.fos_ext_json_bool(v_txn_elem, 'include_in_spending_analytics', false),
          public.fos_ext_json_bool(v_txn_elem, 'include_in_cash_flow_history', false),
          public.fos_ext_json_bool(v_txn_elem, 'include_in_cash_flow_history', false),
          nullif(left(coalesce(v_txn_elem ->> 'exclude_reason', ''), 200), ''),
          coalesce(nullif(left(coalesce(v_txn_elem ->> 'source', ''), 32), ''), 'import'),
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
              'amount', public.fos_ext_json_numeric(v_txn_elem, 'amount', 0),
              'budget_impact', public.fos_ext_json_numeric(v_txn_elem, 'budget_impact', 0),
              'include_in_spending_analytics', public.fos_ext_json_bool(v_txn_elem, 'include_in_spending_analytics', false),
              'include_in_cash_flow_history', public.fos_ext_json_bool(v_txn_elem, 'include_in_cash_flow_history', false),
              'exclude_reason', v_txn_elem ->> 'exclude_reason',
              'source', coalesce(v_txn_elem ->> 'source', 'import'),
              'platform_id', v_platform_id,
              'capture_source', p_capture_source
            )
          );
        end if;
      else
        insert into public.finance_transactions (
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
          v_txn_date,
          v_txn_date,
          left(coalesce(v_txn_elem ->> 'merchant', ''), 200),
          left(coalesce(v_txn_elem ->> 'merchant', ''), 200),
          left(coalesce(v_txn_elem ->> 'category', 'Uncategorized'), 200),
          left(coalesce(v_txn_elem ->> 'category', 'Uncategorized'), 200),
          left(coalesce(v_txn_elem ->> 'account', 'Unknown'), 200),
          left(coalesce(v_txn_elem ->> 'account', 'Unknown'), 200),
          left(coalesce(v_txn_elem ->> 'flow_type', 'expense'), 64),
          left(coalesce(v_txn_elem ->> 'flow_type', 'expense'), 64),
          public.fos_ext_json_numeric(v_txn_elem, 'amount', 0),
          public.fos_ext_json_numeric(v_txn_elem, 'amount', 0),
          public.fos_ext_json_numeric(v_txn_elem, 'budget_impact', 0),
          public.fos_ext_json_bool(v_txn_elem, 'include_in_spending_analytics', false),
          public.fos_ext_json_bool(v_txn_elem, 'include_in_spending_analytics', false),
          public.fos_ext_json_bool(v_txn_elem, 'include_in_cash_flow_history', false),
          public.fos_ext_json_bool(v_txn_elem, 'include_in_cash_flow_history', false),
          nullif(left(coalesce(v_txn_elem ->> 'exclude_reason', ''), 200), ''),
          coalesce(nullif(left(coalesce(v_txn_elem ->> 'source', ''), 32), ''), 'import'),
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
            'amount', public.fos_ext_json_numeric(v_txn_elem, 'amount', 0),
            'budget_impact', public.fos_ext_json_numeric(v_txn_elem, 'budget_impact', 0),
            'include_in_spending_analytics', public.fos_ext_json_bool(v_txn_elem, 'include_in_spending_analytics', false),
            'include_in_cash_flow_history', public.fos_ext_json_bool(v_txn_elem, 'include_in_cash_flow_history', false),
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
      if public.fos_ext_json_date(v_assert_elem, 'assertion_date') is null then
        continue;
      end if;
      insert into public.finance_balance_assertions (
        user_id,
        account_id,
        assertion_date,
        amount,
        note
      )
      values (
        uid,
        left(coalesce(v_assert_elem ->> 'account_id', ''), 128),
        public.fos_ext_json_date(v_assert_elem, 'assertion_date'),
        public.fos_ext_json_numeric(v_assert_elem, 'amount', 0),
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
