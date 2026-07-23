-- Pending 交易入账(FINC.PENDING.1)
-- 目标:扩展抓到的 Pending 行照样入账并带 pending 标记(用户直觉:钱已经花出去了就该看见);
-- posted 版本(同 user_id+capture_source+platform_id)到达时原地转正——冲突从 do nothing 改为
-- 「存量行仍是 pending 才 do update」,已转正/用户手动维护过的行绝不被爬虫覆写。
--
-- 结果契约新增 updated_transaction_count / updated_transactions(旧客户端忽略,纯增量)。

alter table public.finance_transactions
  add column if not exists pending boolean not null default false;

comment on column public.finance_transactions.pending is
  '扩展抓取时页面标记为 Pending(授权未清算)。posted 版本按 platform_id 转正后为 false;转正后扩展不再覆写本行。';

CREATE OR REPLACE FUNCTION "public"."finalize_extension_sync_v1"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  uid uuid;
  p_envelope_id text;
  p_payload_hash text;
  p_capture_source text;
  p_capture_kind text;
  v_existing_hash text;
  v_already_processed boolean := false;
  v_inserted_txn integer := 0;
  v_updated_txn integer := 0;
  v_skipped_txn integer := 0;
  v_inserted_assert integer := 0;
  v_txn_rows jsonb := '[]'::jsonb;
  v_updated_rows jsonb := '[]'::jsonb;
  v_txn_elem jsonb;
  v_assert_elem jsonb;
  v_platform_id text;
  v_pending boolean;
  v_inserted uuid;
  v_was_insert boolean;
  v_txn_date date;
  v_txn_idx integer := 0;
  v_row_json jsonb;
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
      'updated_transaction_count', 0,
      'skipped_transaction_count', 0,
      'inserted_assertion_count', 0,
      'transactions', '[]'::jsonb,
      'updated_transactions', '[]'::jsonb
    );
  end if;

  if jsonb_typeof(payload -> 'transactions') = 'array' then
    for v_txn_elem in select value from jsonb_array_elements(payload -> 'transactions') loop
      v_txn_idx := v_txn_idx + 1;
      begin
        v_txn_date := public.fos_ext_json_date(v_txn_elem, 'date');
        if v_txn_date is null then
          v_skipped_txn := v_skipped_txn + 1;
          continue;
        end if;

        v_platform_id := nullif(left(coalesce(v_txn_elem ->> 'platform_id', ''), 256), '');
        v_pending := public.fos_ext_json_bool(v_txn_elem, 'pending', false);

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
            pending,
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
            v_pending,
            'resolved',
            '[]'::jsonb
          )
          on conflict (user_id, capture_source, platform_id)
          where platform_id is not null and platform_id <> ''
          -- 仅当存量行还是 pending 才允许扩展覆写(pending 重抓刷新 / posted 转正)。
          -- 已转正(pending=false)的行冻结:用户可能已手动改类别/商户,爬虫不得回写。
          do update set
            txn_date = excluded.txn_date,
            occurred_on = excluded.occurred_on,
            merchant = excluded.merchant,
            merchant_name = excluded.merchant_name,
            category = excluded.category,
            normalized_category = excluded.normalized_category,
            account = excluded.account,
            source_account_label = excluded.source_account_label,
            flow = excluded.flow,
            flow_type = excluded.flow_type,
            amount = excluded.amount,
            source_amount = excluded.source_amount,
            budget_impact = excluded.budget_impact,
            in_spending = excluded.in_spending,
            include_in_spending_analytics = excluded.include_in_spending_analytics,
            in_cash_flow = excluded.in_cash_flow,
            include_in_cash_flow_history = excluded.include_in_cash_flow_history,
            exclude_reason = excluded.exclude_reason,
            pending = excluded.pending,
            updated_at = now()
          where finance_transactions.pending = true
          returning id, (xmax = 0) into v_inserted, v_was_insert;

          if v_inserted is null then
            v_skipped_txn := v_skipped_txn + 1;
          else
            v_row_json := jsonb_build_object(
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
              'capture_source', p_capture_source,
              'pending', v_pending
            );
            if v_was_insert then
              v_inserted_txn := v_inserted_txn + 1;
              v_txn_rows := v_txn_rows || jsonb_build_array(v_row_json);
            else
              v_updated_txn := v_updated_txn + 1;
              v_updated_rows := v_updated_rows || jsonb_build_array(v_row_json);
            end if;
          end if;
        else
          -- 无 platform_id 的行不允许 pending 入账(没有稳定键无法转正对账,风险是永久重复)。
          if v_pending then
            v_skipped_txn := v_skipped_txn + 1;
            continue;
          end if;
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
      exception
        when invalid_text_representation then
          raise exception
            'finalize_extension_sync_v1 cast failed envelope=% txn_index=% capture_source=% capture_kind=% elem=% pg_error=%',
            p_envelope_id,
            v_txn_idx,
            p_capture_source,
            p_capture_kind,
            left(v_txn_elem::text, 1200),
            sqlerrm
            using errcode = sqlstate;
      end;
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
    'updated_transaction_count', v_updated_txn,
    'skipped_transaction_count', v_skipped_txn,
    'inserted_assertion_count', v_inserted_assert,
    'transactions', v_txn_rows,
    'updated_transactions', v_updated_rows
  );
end;
$$;

-- CREATE OR REPLACE 保留既有 owner 与 ACL;防御性重申(Kenos 可信设备教训:替换后权限必须显式核对)。
ALTER FUNCTION "public"."finalize_extension_sync_v1"("payload" "jsonb") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."finalize_extension_sync_v1"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_extension_sync_v1"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_extension_sync_v1"("payload" "jsonb") TO "service_role";
