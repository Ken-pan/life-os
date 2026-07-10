-- Life OS: 表名加模块前缀（finance_ / core_ / fitness_），便于 Supabase Table Editor 识别
-- planner_* 与 life_os_* 保持不变

-- 1) 重命名 public / fitness 业务表（模块前缀）
alter table if exists public.extension_processed_captures rename to finance_extension_processed_captures;
alter table if exists public.expected_occurrences rename to finance_expected_occurrences;
alter table if exists public.balance_assertions rename to finance_balance_assertions;
alter table if exists public.transaction_imports rename to finance_transaction_imports;
alter table if exists public.holding_daily_candles rename to finance_holding_daily_candles;
alter table if exists public.holding_price_trails rename to finance_holding_price_trails;
alter table if exists public.holding_positions rename to finance_holding_positions;
alter table if exists public.holdings_snapshots rename to finance_holdings_snapshots;
alter table if exists public.scenario_apply_audits rename to finance_scenario_apply_audits;
alter table if exists public.scenario_snapshots rename to finance_scenario_snapshots;
alter table if exists public.scenario_events rename to finance_scenario_events;
alter table if exists public.decision_records rename to finance_decision_records;
alter table if exists public.merchant_rules rename to finance_merchant_rules;
alter table if exists public.recurring_items rename to finance_recurring_items;
alter table if exists public.review_items rename to finance_review_items;
alter table if exists public.user_settings rename to finance_user_settings;
alter table if exists public.transactions rename to finance_transactions;
alter table if exists public.scenarios rename to finance_scenarios;
alter table if exists public.cash_flows rename to finance_cash_flows;
alter table if exists public.accounts rename to finance_accounts;
alter table if exists public.goals rename to finance_goals;
alter table if exists public.allowed_devices rename to core_allowed_devices;

alter table if exists fitness.exercise_weights rename to fitness_exercise_weights;
alter table if exists fitness.workout_sessions rename to fitness_workout_sessions;
alter table if exists fitness.exercise_logs rename to fitness_exercise_logs;
alter table if exists fitness.user_state rename to fitness_user_state;
alter table if exists fitness.profiles rename to fitness_profiles;


-- 2) 更新 RPC / 触发器函数中的表引用
create or replace function public.delete_all_financial_data_v2()
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted jsonb := '{}'::jsonb;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.finance_expected_occurrences where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('expected_occurrences', v_count);

  delete from public.finance_holding_positions where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('holding_positions', v_count);

  delete from public.finance_holdings_snapshots where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('holdings_snapshots', v_count);

  delete from public.finance_holding_price_trails where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('holding_price_trails', v_count);

  delete from public.finance_review_items where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('review_items', v_count);

  delete from public.finance_decision_records where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('decision_records', v_count);

  delete from public.finance_scenario_apply_audits where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('scenario_apply_audits', v_count);

  delete from public.finance_scenario_snapshots where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('scenario_snapshots', v_count);

  delete from public.finance_transactions where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('transactions', v_count);

  delete from public.finance_balance_assertions where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('balance_assertions', v_count);

  delete from public.finance_scenario_events where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('scenario_events', v_count);

  delete from public.finance_scenarios where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('scenarios', v_count);

  delete from public.finance_cash_flows where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('cash_flows', v_count);

  delete from public.finance_goals where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('goals', v_count);

  delete from public.finance_accounts where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('accounts', v_count);

  delete from public.finance_user_settings where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('user_settings', v_count);

  return jsonb_build_object('deleted', v_deleted, 'deletedAt', now());
end;
$$;

create or replace function public.restore_finance_backup_v2(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_schema_version int;
  v_data_version int;
  v_assumptions jsonb;
  v_privacy boolean;
  v_active_scenario_id text;
  v_portfolio_target jsonb;
  v_restored jsonb := '{}'::jsonb;
  v_count int;
  snap jsonb;
  pos jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if payload is null then
    raise exception 'payload is required';
  end if;

  v_schema_version := coalesce((payload->>'schemaVersion')::int, -1);
  if v_schema_version <> 2 then
    raise exception 'unsupported schemaVersion: %', v_schema_version;
  end if;

  v_data_version := coalesce((payload->>'dataVersion')::int, 6);
  v_assumptions := payload->'assumptions';
  v_privacy := coalesce((payload->>'privacy')::boolean, false);
  v_active_scenario_id := nullif(payload->>'activeScenarioId', '');
  v_portfolio_target := payload->'portfolioAllocationTarget';

  perform public.delete_all_financial_data_v2();

  insert into public.finance_user_settings (
    user_id, assumptions, privacy, data_version, active_scenario_id,
    portfolio_allocation_target, updated_at
  )
  values (
    v_uid, coalesce(v_assumptions, '{}'::jsonb), v_privacy, v_data_version,
    v_active_scenario_id, v_portfolio_target, now()
  );

  insert into public.finance_accounts (
    user_id,id,name,type,balance,annual_return,apr,liquid,credit_mode,
    statement_balance,due_day,auto_pay_mode,payment_account_id,annual_fee,annual_fee_date,
    monthly_payment,term_months,basis,note,balance_manual,fund_allocations,underlying_allocation,updated_at
  )
  select
    v_uid,
    a.id, coalesce(a.name, ''), a.type, coalesce(a.balance, 0), a."annualReturn",
    a.apr, a.liquid, a."creditMode", a."statementBalance", a."dueDay", a."autoPayMode",
    a."paymentAccountId", a."annualFee", a."annualFeeDate", a."monthlyPayment", a."termMonths",
    a.basis, a.note, coalesce(a."balanceManual", false),
    a."fundAllocations", a."underlyingAllocation",
    coalesce(a."updatedAt", now()::text)::timestamptz
  from jsonb_to_recordset(coalesce(payload->'accounts', '[]'::jsonb)) as a(
    id text, name text, type text, balance numeric, "annualReturn" numeric,
    apr numeric, liquid boolean, "creditMode" text, "statementBalance" numeric,
    "dueDay" integer, "autoPayMode" text, "paymentAccountId" text,
    "annualFee" numeric, "annualFeeDate" text, "monthlyPayment" numeric,
    "termMonths" integer, basis numeric, note text, "balanceManual" boolean,
    "fundAllocations" jsonb, "underlyingAllocation" jsonb, "updatedAt" text
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('accounts', v_count);

  insert into public.finance_scenarios (
    user_id,id,name,description,scenario_type,status,comparison_color_token,created_at,updated_at,archived_at
  )
  select
    v_uid,
    s.id, coalesce(s.name, 'Scenario'), s.description, coalesce(s."scenarioType", 'custom'),
    coalesce(s.status, 'draft'), s."comparisonColorToken",
    coalesce(s."createdAt", now()::text)::timestamptz,
    coalesce(s."updatedAt", now()::text)::timestamptz,
    s."archivedAt"::timestamptz
  from jsonb_to_recordset(coalesce(payload->'scenarios', '[]'::jsonb)) as s(
    id text, name text, description text, "scenarioType" text, status text,
    "comparisonColorToken" text, "createdAt" text, "updatedAt" text, "archivedAt" text
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('scenarios', v_count);

  insert into public.finance_cash_flows (
    user_id,id,name,type,frequency,amount,essential,start_month,end_month,category,pay_frequency,anchor_date,due_day
  )
  select
    v_uid,
    c.id, coalesce(c.name, ''), c.type, c.frequency, coalesce(c.amount, 0), c.essential,
    c."startMonth", c."endMonth", c.category, c."payFrequency", c."anchorDate", c."dueDay"
  from jsonb_to_recordset(coalesce(payload->'cashFlows', '[]'::jsonb)) as c(
    id text, name text, type text, frequency text, amount numeric, essential boolean,
    "startMonth" integer, "endMonth" integer, category text, "payFrequency" text,
    "anchorDate" text, "dueDay" integer
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('cash_flows', v_count);

  insert into public.finance_scenario_events (
    user_id,id,scenario_id,name,event_type,enabled,month_offset,amount,date,percent,contribution_percent,expense_category,funding_source,reconciled
  )
  select
    v_uid,
    e.id, coalesce(e."scenarioId", 'scenario_baseline'), coalesce(e.name, ''), e."eventType",
    coalesce(e.enabled, true), coalesce(e."monthOffset", 0),
    e.amount, e.date, e.percent, e."contributionPercent", e."expenseCategory", e."fundingSource", e.reconciled
  from jsonb_to_recordset(coalesce(payload->'events', '[]'::jsonb)) as e(
    id text, "scenarioId" text, name text, "eventType" text, enabled boolean, "monthOffset" integer,
    amount numeric, date text, percent numeric, "contributionPercent" numeric,
    "expenseCategory" text, "fundingSource" text, reconciled boolean
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('scenario_events', v_count);

  insert into public.finance_goals (
    user_id,id,name,metric,target,current,priority,funding_account_id,monthly_allocation,
    monthly_allocation_day,target_date,reserve_policy,reserve
  )
  select
    v_uid,
    g.id, coalesce(g.name, ''), g.metric, coalesce(g.target, 0), g.current, g.priority,
    g."fundingAccountId", g."monthlyAllocation", g."monthlyAllocationDay", g."targetDate",
    g."reservePolicy", g.reserve
  from jsonb_to_recordset(coalesce(payload->'goals', '[]'::jsonb)) as g(
    id text, name text, metric text, target numeric, current numeric, priority text,
    "fundingAccountId" text, "monthlyAllocation" numeric, "monthlyAllocationDay" integer,
    "targetDate" text, "reservePolicy" text, reserve boolean
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('goals', v_count);

  insert into public.finance_transactions (
    id,user_id,txn_date,merchant,category,account,flow,amount,budget_impact,in_spending,in_cash_flow,exclude_reason,source,updated_at
  )
  select
    coalesce(t.id, gen_random_uuid()),
    v_uid,
    t.date::date,
    coalesce(t.merchant, ''),
    coalesce(t.category, 'Uncategorized'),
    coalesce(t.account, 'Unknown'),
    coalesce(t.flow, 'expense'),
    coalesce(t.amount, 0),
    coalesce(t."budgetImpact", 0),
    coalesce(t."inSpending", false),
    coalesce(t."inCashFlow", false),
    t."excludeReason",
    coalesce(t.source, 'import'),
    now()
  from jsonb_to_recordset(coalesce(payload->'transactions', '[]'::jsonb)) as t(
    id uuid, date text, merchant text, category text, account text, flow text,
    amount numeric, "budgetImpact" numeric, "inSpending" boolean, "inCashFlow" boolean,
    "excludeReason" text, source text
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('transactions', v_count);

  insert into public.finance_balance_assertions (
    id,user_id,account_id,assertion_date,amount,note,adjustment_txn_id,created_at
  )
  select
    coalesce(b.id::uuid, gen_random_uuid()),
    v_uid,
    b."accountId", b.date::date, coalesce(b.amount, 0), b.note,
    b."adjustmentTxnId"::uuid, coalesce(b."createdAt", now()::text)::timestamptz
  from jsonb_to_recordset(coalesce(payload->'balanceAssertions', '[]'::jsonb)) as b(
    id text, "accountId" text, date text, amount numeric, note text,
    "adjustmentTxnId" text, "createdAt" text
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('balance_assertions', v_count);

  insert into public.finance_expected_occurrences (
    id,user_id,source_type,source_id,label,occurrence_date,expected_amount,account_id,state,
    matched_txn_id,actual_amount,actual_date,reconciled_period_id,variance_amount,variance_days,updated_at
  )
  select
    o.id, v_uid, o."sourceType", o."sourceId", coalesce(o.label, ''), o.date::date,
    coalesce(o."expectedAmount", 0), o."accountId", coalesce(o.state, 'planned'),
    o."matchedTxnId"::uuid, o."actualAmount", o."actualDate"::date,
    o."reconciledPeriodId"::uuid, o."varianceAmount", o."varianceDays", now()
  from jsonb_to_recordset(coalesce(payload->'expectedOccurrences', '[]'::jsonb)) as o(
    id text, "sourceType" text, "sourceId" text, label text, date text, "expectedAmount" numeric,
    "accountId" text, state text, "matchedTxnId" text, "actualAmount" numeric, "actualDate" text,
    "reconciledPeriodId" text, "varianceAmount" numeric, "varianceDays" integer
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('expected_occurrences', v_count);

  for snap in select * from jsonb_array_elements(coalesce(payload->'holdingsSnapshots', '[]'::jsonb))
  loop
    insert into public.finance_holdings_snapshots (
      user_id,id,account_id,institution,account_label,as_of_date,as_of_time_local,timezone,
      imported_at,source_type,source_description,note,needs_user_confirmation,reconciliation_status,
      holdings_market_value,implied_cost_basis,unrealized_gain,weighted_total_return_pct,
      today_return_amount_approx,today_return_pct_approx,position_count,stock_count,etf_count
    )
    values (
      v_uid,
      snap->>'id',
      nullif(snap->>'accountId', ''),
      nullif(snap->>'institution', ''),
      coalesce(snap->>'accountLabel', ''),
      (snap->>'asOfDate')::date,
      nullif(snap->>'asOfTimeLocal', ''),
      nullif(snap->>'timezone', ''),
      coalesce(snap->>'importedAt', now()::text)::timestamptz,
      coalesce(snap->>'sourceType', 'manual_snapshot_import'),
      nullif(snap->>'sourceDescription', ''),
      nullif(snap->>'note', ''),
      coalesce((snap->>'needsUserConfirmation')::boolean, false),
      coalesce(snap->>'reconciliationStatus', 'incomplete'),
      coalesce((snap->>'holdingsMarketValue')::numeric, 0),
      (snap->>'impliedCostBasis')::numeric,
      (snap->>'unrealizedGain')::numeric,
      (snap->>'weightedTotalReturnPct')::numeric,
      (snap->>'todayReturnAmountApprox')::numeric,
      (snap->>'todayReturnPctApprox')::numeric,
      coalesce((snap->>'positionCount')::int, 0),
      (snap->>'stockCount')::int,
      (snap->>'etfCount')::int
    );
    for pos in select * from jsonb_array_elements(coalesce(snap->'positions', '[]'::jsonb))
    loop
      insert into public.finance_holding_positions (
        user_id,snapshot_id,id,ticker,security_name,asset_type,shares,market_price,market_value,
        average_cost_per_share,implied_cost_basis,portfolio_weight_pct,portfolio_diversity_displayed_pct,
        today_return_amount,today_return_pct,total_return_amount,total_return_pct_displayed,source_captured_at
      )
      values (
        v_uid,
        snap->>'id',
        pos->>'id',
        coalesce(pos->>'ticker', ''),
        coalesce(pos->>'securityName', ''),
        coalesce(pos->>'assetType', 'other'),
        coalesce((pos->>'shares')::numeric, 0),
        coalesce((pos->>'marketPrice')::numeric, 0),
        coalesce((pos->>'marketValue')::numeric, 0),
        (pos->>'averageCostPerShare')::numeric,
        (pos->>'impliedCostBasis')::numeric,
        (pos->>'portfolioWeightPct')::numeric,
        (pos->>'portfolioDiversityDisplayedPct')::numeric,
        (pos->>'todayReturnAmount')::numeric,
        (pos->>'todayReturnPct')::numeric,
        (pos->>'totalReturnAmount')::numeric,
        (pos->>'totalReturnPctDisplayed')::numeric,
        nullif(pos->>'sourceCapturedAt', '')
      );
    end loop;
  end loop;
  v_restored := v_restored || jsonb_build_object(
    'holdings_snapshots', jsonb_array_length(coalesce(payload->'holdingsSnapshots', '[]'::jsonb))
  );

  insert into public.finance_decision_records (
    user_id,id,scenario_id,decision_status,decision_summary,reason,
    expected_outcome_json,actual_outcome_json,decided_at,review_on,reviewed_at,created_at,updated_at
  )
  select
    v_uid,
    d.id, d."scenarioId", d."decisionStatus", coalesce(d."decisionSummary", ''),
    d.reason, d."expectedOutcomeJson", d."actualOutcomeJson",
    d."decidedAt"::timestamptz, d."reviewOn"::date, d."reviewedAt"::timestamptz,
    coalesce(d."createdAt", now()::text)::timestamptz,
    coalesce(d."updatedAt", now()::text)::timestamptz
  from jsonb_to_recordset(coalesce(payload->'decisionRecords', '[]'::jsonb)) as d(
    id text, "scenarioId" text, "decisionStatus" text, "decisionSummary" text, reason text,
    "expectedOutcomeJson" jsonb, "actualOutcomeJson" jsonb, "decidedAt" text, "reviewOn" text,
    "reviewedAt" text, "createdAt" text, "updatedAt" text
  );
  get diagnostics v_count = row_count;
  v_restored := v_restored || jsonb_build_object('decision_records', v_count);

  return jsonb_build_object(
    'schemaVersion', v_schema_version,
    'restored', v_restored,
    'restoredAt', now()
  );
end;
$$;

create or replace function public.apply_scenario_to_plan_v1(payload jsonb)
returns table (
  applied_count integer,
  inserted_event_ids jsonb,
  applied_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid;
  src_scenario text;
  selected_ids text[];
  inserted_ids jsonb := '[]'::jsonb;
  row_count integer := 0;
  audit_applied_at timestamptz := now();
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid payload';
  end if;
  src_scenario := nullif(payload ->> 'scenario_id', '');
  if src_scenario is null then
    raise exception 'scenario_id required';
  end if;
  if src_scenario = 'scenario_baseline' then
    raise exception 'baseline scenario cannot be applied to itself';
  end if;
  if not exists (
    select 1
    from public.finance_scenarios s
    where s.user_id = uid
      and s.id = src_scenario
  ) then
    raise exception 'scenario not found';
  end if;
  if jsonb_typeof(payload -> 'selected_event_ids') <> 'array' then
    raise exception 'selected_event_ids must be an array';
  end if;

  select coalesce(array_agg(v), '{}') into selected_ids
  from jsonb_array_elements_text(payload -> 'selected_event_ids') as t(v);
  if cardinality(selected_ids) = 0 then
    raise exception 'at least one selected event required';
  end if;

  with source_events as (
    select e.*
    from public.finance_scenario_events e
    where e.user_id = uid
      and e.scenario_id = src_scenario
      and e.id = any(selected_ids)
  ),
  inserted as (
    insert into public.finance_scenario_events (
      user_id,
      id,
      scenario_id,
      name,
      event_type,
      enabled,
      month_offset,
      amount,
      date,
      percent,
      contribution_percent,
      expense_category,
      funding_source,
      reconciled
    )
    select
      uid,
      'evt_apply_' || replace(substr(gen_random_uuid()::text, 1, 8), '-', ''),
      'scenario_baseline',
      se.name,
      se.event_type,
      se.enabled,
      se.month_offset,
      se.amount,
      se.date,
      se.percent,
      se.contribution_percent,
      se.expense_category,
      se.funding_source,
      se.reconciled
    from source_events se
    returning id
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(id), '[]'::jsonb)
  into row_count, inserted_ids
  from inserted;

  if row_count = 0 then
    raise exception 'no events were applied';
  end if;

  insert into public.finance_scenario_apply_audits (
    user_id,
    source_scenario_id,
    selected_event_ids,
    inserted_event_ids,
    applied_at
  ) values (
    uid,
    src_scenario,
    to_jsonb(selected_ids),
    inserted_ids,
    audit_applied_at
  );

  return query
  select row_count, inserted_ids, audit_applied_at;
end;
$$;

create or replace function public.undo_latest_scenario_apply_v1()
returns table (
  undone_count integer,
  undone_event_ids jsonb,
  undone_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid;
  audit_id uuid;
  inserted_ids jsonb;
  ts timestamptz := now();
  rows_deleted integer := 0;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;

  select a.id, a.inserted_event_ids
  into audit_id, inserted_ids
  from public.finance_scenario_apply_audits a
  where a.user_id = uid
    and a.undone_at is null
  order by a.applied_at desc
  limit 1;

  if audit_id is null then
    raise exception 'no apply operation available to undo';
  end if;

  delete from public.finance_scenario_events e
  where e.user_id = uid
    and e.scenario_id = 'scenario_baseline'
    and e.id in (
      select value::text
      from jsonb_array_elements_text(inserted_ids)
    );
  get diagnostics rows_deleted = row_count;

  update public.finance_scenario_apply_audits
  set undone_at = ts
  where id = audit_id;

  return query
  select rows_deleted, inserted_ids, ts;
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

create or replace function public.finalize_transaction_import_v1(payload jsonb)
returns table (
  import_id uuid,
  status text,
  accepted_row_count integer,
  excluded_row_count integer,
  review_row_count integer,
  date_min date,
  date_max date
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid;
  import_row_id uuid;
  accepted_count integer := 0;
  excluded_count integer := 0;
  review_count integer := 0;
  min_date date;
  max_date date;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid payload';
  end if;
  if jsonb_typeof(payload -> 'acceptedRows') <> 'array' then
    raise exception 'invalid acceptedRows';
  end if;

  if exists (
    select 1
    from public.finance_transaction_imports ti
    where ti.user_id = uid
      and ti.status = 'finalized'
      and ti.source_file_hash = coalesce(payload ->> 'sourceFileHash', '')
  ) then
    raise exception 'same-file reimport blocked';
  end if;

  insert into public.finance_transaction_imports (
    user_id,
    status,
    source_type,
    source_file_name_masked,
    source_file_hash,
    raw_row_count,
    schema_version
  )
  values (
    uid,
    'draft',
    'csv',
    left(coalesce(payload ->> 'sourceFileNameMasked', 'csv'), 200),
    left(coalesce(payload ->> 'sourceFileHash', ''), 128),
    greatest(coalesce((payload ->> 'rawRowCount')::integer, 0), 0),
    greatest(coalesce((payload ->> 'schemaVersion')::integer, 1), 1)
  )
  returning id into import_row_id;

  insert into public.finance_transactions (
    user_id,
    import_id,
    transaction_fingerprint,
    occurred_on,
    original_date,
    source_account_label,
    source_account_masked,
    institution,
    account_type,
    merchant_name,
    description,
    source_category,
    normalized_category,
    source_amount,
    amount,
    budget_impact,
    net_worth_impact,
    account_balance_impact,
    flow_type,
    flow,
    include_in_spending_analytics,
    in_spending,
    include_in_cash_flow_history,
    in_cash_flow,
    review_status,
    review_flags,
    txn_date,
    merchant,
    category,
    account,
    source
  )
  select
    uid,
    import_row_id,
    left(coalesce(x.transaction_fingerprint, ''), 200),
    x.occurred_on,
    x.original_date,
    nullif(left(coalesce(x.source_account_label, ''), 200), ''),
    nullif(left(coalesce(x.source_account_masked, ''), 64), ''),
    nullif(left(coalesce(x.institution, ''), 200), ''),
    nullif(left(coalesce(x.account_type, ''), 80), ''),
    left(coalesce(x.merchant_name, ''), 200),
    left(coalesce(x.description, ''), 500),
    nullif(left(coalesce(x.source_category, ''), 200), ''),
    left(coalesce(x.normalized_category, 'Uncategorized'), 200),
    x.source_amount,
    x.source_amount,
    x.budget_impact,
    x.net_worth_impact,
    x.account_balance_impact,
    left(coalesce(x.flow_type, 'unknown'), 40),
    left(coalesce(x.flow_type, 'unknown'), 40),
    coalesce(x.include_in_spending_analytics, false),
    coalesce(x.include_in_spending_analytics, false),
    coalesce(x.include_in_cash_flow_history, true),
    coalesce(x.include_in_cash_flow_history, true),
    left(coalesce(x.review_status, 'open'), 20),
    coalesce(x.review_flags, '[]'::jsonb),
    x.occurred_on,
    left(coalesce(x.merchant_name, ''), 200),
    left(coalesce(x.normalized_category, 'Uncategorized'), 200),
    left(coalesce(x.source_account_label, 'Imported account'), 200),
    'import'
  from jsonb_to_recordset(payload -> 'acceptedRows') as x(
    occurred_on date,
    original_date date,
    source_account_label text,
    source_account_masked text,
    institution text,
    account_type text,
    merchant_name text,
    description text,
    source_category text,
    normalized_category text,
    source_amount numeric,
    budget_impact numeric,
    net_worth_impact numeric,
    account_balance_impact numeric,
    flow_type text,
    include_in_spending_analytics boolean,
    include_in_cash_flow_history boolean,
    review_status text,
    review_flags jsonb,
    transaction_fingerprint text
  )
  where x.occurred_on is not null
    and x.source_amount is not null
    and x.description is not null;

  get diagnostics accepted_count = row_count;

  if jsonb_typeof(payload -> 'reviewItems') = 'array' then
    insert into public.finance_review_items (
      user_id,
      import_id,
      transaction_id,
      review_type,
      severity,
      status,
      reason,
      suggested_action
    )
    select
      uid,
      import_row_id,
      t.id,
      left(coalesce(r.review_type, ''), 80),
      case when r.severity in ('high', 'medium', 'low') then r.severity else 'low' end,
      case when r.status in ('open', 'resolved', 'ignored') then r.status else 'open' end,
      left(coalesce(r.reason, ''), 500),
      left(coalesce(r.suggested_action, ''), 500)
    from jsonb_to_recordset(payload -> 'reviewItems') as r(
      transaction_fingerprint text,
      review_type text,
      severity text,
      status text,
      reason text,
      suggested_action text
    )
    left join public.finance_transactions t
      on t.user_id = uid
      and t.import_id = import_row_id
      and t.transaction_fingerprint = r.transaction_fingerprint;
    get diagnostics review_count = row_count;
  end if;

  if jsonb_typeof(payload -> 'merchantRules') = 'array' then
    insert into public.finance_merchant_rules (
      user_id,
      match_type,
      match_value,
      normalized_category,
      flow_type_override,
      include_in_spending_analytics_override
    )
    select
      uid,
      case when m.match_type in ('exact', 'contains', 'prefix', 'regex') then m.match_type else 'exact' end,
      left(coalesce(m.match_value, ''), 200),
      nullif(left(coalesce(m.normalized_category, ''), 200), ''),
      case
        when m.flow_type_override in ('expense', 'income', 'refund_or_reversal', 'internal_transfer', 'credit_card_payment', 'ignored', 'zero_activity', 'unknown')
        then m.flow_type_override
        else null
      end,
      m.include_in_spending_analytics_override
    from jsonb_to_recordset(payload -> 'merchantRules') as m(
      match_type text,
      match_value text,
      normalized_category text,
      flow_type_override text,
      include_in_spending_analytics_override boolean
    )
    where nullif(coalesce(m.match_value, ''), '') is not null;
  end if;

  select min(t.occurred_on), max(t.occurred_on) into min_date, max_date
  from public.finance_transactions t
  where t.user_id = uid and t.import_id = import_row_id;

  select count(*) into excluded_count
  from public.finance_transactions t
  where t.user_id = uid
    and t.import_id = import_row_id
    and t.include_in_spending_analytics = false;

  update public.finance_transaction_imports
  set
    status = 'finalized',
    accepted_row_count = accepted_count,
    excluded_row_count = excluded_count,
    review_row_count = review_count,
    date_min = min_date,
    date_max = max_date,
    finalized_at = now()
  where id = import_row_id;

  return query
  select
    import_row_id,
    'finalized'::text,
    accepted_count,
    excluded_count,
    review_count,
    min_date,
    max_date;
end;
$$;

create or replace function public.delete_all_financial_data_v1()
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_transactions int := 0;
  v_events int := 0;
  v_cash_flows int := 0;
  v_goals int := 0;
  v_accounts int := 0;
  v_settings int := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.finance_transactions where user_id = v_uid;
  get diagnostics v_transactions = row_count;

  delete from public.finance_scenario_events where user_id = v_uid;
  get diagnostics v_events = row_count;

  delete from public.finance_cash_flows where user_id = v_uid;
  get diagnostics v_cash_flows = row_count;

  delete from public.finance_goals where user_id = v_uid;
  get diagnostics v_goals = row_count;

  delete from public.finance_accounts where user_id = v_uid;
  get diagnostics v_accounts = row_count;

  delete from public.finance_user_settings where user_id = v_uid;
  get diagnostics v_settings = row_count;

  return jsonb_build_object(
    'deleted', jsonb_build_object(
      'transactions', v_transactions,
      'scenario_events', v_events,
      'cash_flows', v_cash_flows,
      'goals', v_goals,
      'accounts', v_accounts,
      'user_settings', v_settings
    ),
    'deletedAt', now()
  );
end;
$$;

create or replace function public.restore_finance_backup_v1(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_schema_version int;
  v_data_version int;
  v_assumptions jsonb;
  v_privacy boolean;
  v_accounts int := 0;
  v_cash_flows int := 0;
  v_events int := 0;
  v_goals int := 0;
  v_transactions int := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if payload is null then
    raise exception 'payload is required';
  end if;

  v_schema_version := coalesce((payload->>'schemaVersion')::int, -1);
  if v_schema_version <> 1 then
    raise exception 'unsupported schemaVersion: %', v_schema_version;
  end if;

  v_data_version := coalesce((payload->>'dataVersion')::int, 6);
  v_assumptions := payload->'assumptions';
  v_privacy := coalesce((payload->>'privacy')::boolean, false);

  -- Atomic replace in one transaction scope.
  delete from public.finance_transactions where user_id = v_uid;
  delete from public.finance_scenario_events where user_id = v_uid;
  delete from public.finance_cash_flows where user_id = v_uid;
  delete from public.finance_goals where user_id = v_uid;
  delete from public.finance_accounts where user_id = v_uid;
  delete from public.finance_user_settings where user_id = v_uid;

  insert into public.finance_user_settings (user_id, assumptions, privacy, data_version, updated_at)
  values (v_uid, coalesce(v_assumptions, '{}'::jsonb), v_privacy, v_data_version, now());

  insert into public.finance_accounts (
    user_id,id,name,type,balance,annual_return,apr,liquid,credit_mode,
    statement_balance,due_day,auto_pay_mode,payment_account_id,annual_fee,annual_fee_date,
    monthly_payment,term_months,basis,note,updated_at
  )
  select
    v_uid,
    a.id, coalesce(a.name, ''), a.type, coalesce(a.balance, 0), a."annualReturn",
    a.apr, a.liquid, a."creditMode", a."statementBalance", a."dueDay", a."autoPayMode",
    a."paymentAccountId", a."annualFee", a."annualFeeDate", a."monthlyPayment", a."termMonths",
    a.basis, a.note, coalesce(a."updatedAt", now()::text)::timestamptz
  from jsonb_to_recordset(coalesce(payload->'accounts', '[]'::jsonb)) as a(
    id text, name text, type text, balance numeric, "annualReturn" numeric,
    apr numeric, liquid boolean, "creditMode" text, "statementBalance" numeric,
    "dueDay" integer, "autoPayMode" text, "paymentAccountId" text,
    "annualFee" numeric, "annualFeeDate" text, "monthlyPayment" numeric,
    "termMonths" integer, basis numeric, note text, "updatedAt" text
  );
  get diagnostics v_accounts = row_count;

  insert into public.finance_cash_flows (
    user_id,id,name,type,frequency,amount,essential,start_month,end_month,category,pay_frequency,anchor_date,due_day
  )
  select
    v_uid,
    c.id, coalesce(c.name, ''), c.type, c.frequency, coalesce(c.amount, 0), c.essential,
    c."startMonth", c."endMonth", c.category, c."payFrequency", c."anchorDate", c."dueDay"
  from jsonb_to_recordset(coalesce(payload->'cashFlows', '[]'::jsonb)) as c(
    id text, name text, type text, frequency text, amount numeric, essential boolean,
    "startMonth" integer, "endMonth" integer, category text, "payFrequency" text,
    "anchorDate" text, "dueDay" integer
  );
  get diagnostics v_cash_flows = row_count;

  insert into public.finance_scenario_events (
    user_id,id,name,event_type,enabled,month_offset,amount,date,percent,contribution_percent,expense_category,funding_source,reconciled
  )
  select
    v_uid,
    e.id, coalesce(e.name, ''), e."eventType", coalesce(e.enabled, true), coalesce(e."monthOffset", 0),
    e.amount, e.date, e.percent, e."contributionPercent", e."expenseCategory", e."fundingSource", e.reconciled
  from jsonb_to_recordset(coalesce(payload->'events', '[]'::jsonb)) as e(
    id text, name text, "eventType" text, enabled boolean, "monthOffset" integer,
    amount numeric, date text, percent numeric, "contributionPercent" numeric,
    "expenseCategory" text, "fundingSource" text, reconciled boolean
  );
  get diagnostics v_events = row_count;

  insert into public.finance_goals (
    user_id,id,name,metric,target,current,priority,funding_account_id,monthly_allocation,
    monthly_allocation_day,target_date,reserve_policy,reserve
  )
  select
    v_uid,
    g.id, coalesce(g.name, ''), g.metric, coalesce(g.target, 0), g.current, g.priority,
    g."fundingAccountId", g."monthlyAllocation", g."monthlyAllocationDay", g."targetDate",
    g."reservePolicy", g.reserve
  from jsonb_to_recordset(coalesce(payload->'goals', '[]'::jsonb)) as g(
    id text, name text, metric text, target numeric, current numeric, priority text,
    "fundingAccountId" text, "monthlyAllocation" numeric, "monthlyAllocationDay" integer,
    "targetDate" text, "reservePolicy" text, reserve boolean
  );
  get diagnostics v_goals = row_count;

  insert into public.finance_transactions (
    id,user_id,txn_date,merchant,category,account,flow,amount,budget_impact,in_spending,in_cash_flow,exclude_reason,source,updated_at
  )
  select
    coalesce(t.id, gen_random_uuid()),
    v_uid,
    t.date::date,
    coalesce(t.merchant, ''),
    coalesce(t.category, 'Uncategorized'),
    coalesce(t.account, 'Unknown'),
    coalesce(t.flow, 'expense'),
    coalesce(t.amount, 0),
    coalesce(t."budgetImpact", 0),
    coalesce(t."inSpending", false),
    coalesce(t."inCashFlow", false),
    t."excludeReason",
    coalesce(t.source, 'import'),
    now()
  from jsonb_to_recordset(coalesce(payload->'transactions', '[]'::jsonb)) as t(
    id uuid, date text, merchant text, category text, account text, flow text,
    amount numeric, "budgetImpact" numeric, "inSpending" boolean, "inCashFlow" boolean,
    "excludeReason" text, source text
  );
  get diagnostics v_transactions = row_count;

  return jsonb_build_object(
    'schemaVersion', v_schema_version,
    'restored', jsonb_build_object(
      'accounts', v_accounts,
      'cash_flows', v_cash_flows,
      'scenario_events', v_events,
      'goals', v_goals,
      'transactions', v_transactions
    ),
    'restoredAt', now()
  );
end;
$$;

create or replace function public.enforce_device_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  slot_count integer;
begin
  select count(distinct device_class) into slot_count
  from public.core_allowed_devices
  where user_id = new.user_id;

  if slot_count >= 2 and not exists (
    select 1 from public.core_allowed_devices
    where user_id = new.user_id and device_class = new.device_class
  ) then
    raise exception 'device limit reached (max 1 desktop + 1 mobile)';
  end if;

  return new;
end;
$$;

create or replace function private.fitness_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into fitness.fitness_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into fitness.fitness_user_state (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;



-- 3) 更新表级对照视图
create or replace view public.life_os_table_catalog
with (security_invoker = true)
as
select
  n.nspname as table_schema,
  c.relname as table_name,
  coalesce(
    (
      select a.attname || ' = ' || coalesce(
        pg_get_expr(ad.adbin, ad.adrelid),
        '（无默认）'
      )
      from pg_attribute a
      left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
      where a.attrelid = c.oid
        and a.attname = 'os_module'
        and not a.attisdropped
    ),
    '（无 os_module 列）'
  ) as os_module_default,
  m.display_name as os_display_name,
  m.description as os_description
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join public.life_os_modules m on m.slug = (
  case
    when n.nspname = 'fitness' then 'fitness'
    when c.relname like 'planner_%' then 'planner'
    when c.relname like 'core_%' then 'core'
    when n.nspname = 'public'
      and c.relname like 'finance_%' then 'finance'
    else null
  end
)
where c.relkind = 'r'
  and n.nspname in ('public', 'fitness')
  and c.relname not in ('life_os_modules')
order by m.slug nulls last, n.nspname, c.relname;

comment on view public.life_os_table_catalog is 'Life OS 表级模块对照（配合各表 os_module 列使用）';

grant select on public.life_os_table_catalog to anon, authenticated, service_role;
