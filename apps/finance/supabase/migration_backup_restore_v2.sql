-- 全量备份/删除 v2：覆盖持仓、情景、决策、对账断言、时间线条目等

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

  delete from public.expected_occurrences where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('expected_occurrences', v_count);

  delete from public.holding_positions where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('holding_positions', v_count);

  delete from public.holdings_snapshots where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('holdings_snapshots', v_count);

  delete from public.holding_price_trails where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('holding_price_trails', v_count);

  delete from public.review_items where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('review_items', v_count);

  delete from public.decision_records where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('decision_records', v_count);

  delete from public.scenario_apply_audits where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('scenario_apply_audits', v_count);

  delete from public.scenario_snapshots where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('scenario_snapshots', v_count);

  delete from public.transactions where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('transactions', v_count);

  delete from public.balance_assertions where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('balance_assertions', v_count);

  delete from public.scenario_events where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('scenario_events', v_count);

  delete from public.scenarios where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('scenarios', v_count);

  delete from public.cash_flows where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('cash_flows', v_count);

  delete from public.goals where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('goals', v_count);

  delete from public.accounts where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('accounts', v_count);

  delete from public.user_settings where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('user_settings', v_count);

  return jsonb_build_object('deleted', v_deleted, 'deletedAt', now());
end;
$$;

revoke all on function public.delete_all_financial_data_v2() from public;
revoke all on function public.delete_all_financial_data_v2() from anon;
grant execute on function public.delete_all_financial_data_v2() to authenticated;

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

  insert into public.user_settings (
    user_id, assumptions, privacy, data_version, active_scenario_id,
    portfolio_allocation_target, updated_at
  )
  values (
    v_uid, coalesce(v_assumptions, '{}'::jsonb), v_privacy, v_data_version,
    v_active_scenario_id, v_portfolio_target, now()
  );

  insert into public.accounts (
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

  insert into public.scenarios (
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

  insert into public.cash_flows (
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

  insert into public.scenario_events (
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

  insert into public.goals (
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

  insert into public.transactions (
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

  insert into public.balance_assertions (
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

  insert into public.expected_occurrences (
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
    insert into public.holdings_snapshots (
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
      insert into public.holding_positions (
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

  insert into public.decision_records (
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

revoke all on function public.restore_finance_backup_v2(jsonb) from public;
revoke all on function public.restore_finance_backup_v2(jsonb) from anon;
grant execute on function public.restore_finance_backup_v2(jsonb) to authenticated;
