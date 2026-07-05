-- P0.5 release hardening: atomic restore + delete RPCs

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

  delete from public.transactions where user_id = v_uid;
  get diagnostics v_transactions = row_count;

  delete from public.scenario_events where user_id = v_uid;
  get diagnostics v_events = row_count;

  delete from public.cash_flows where user_id = v_uid;
  get diagnostics v_cash_flows = row_count;

  delete from public.goals where user_id = v_uid;
  get diagnostics v_goals = row_count;

  delete from public.accounts where user_id = v_uid;
  get diagnostics v_accounts = row_count;

  delete from public.user_settings where user_id = v_uid;
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

revoke all on function public.delete_all_financial_data_v1() from public;
revoke all on function public.delete_all_financial_data_v1() from anon;
grant execute on function public.delete_all_financial_data_v1() to authenticated;

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
  delete from public.transactions where user_id = v_uid;
  delete from public.scenario_events where user_id = v_uid;
  delete from public.cash_flows where user_id = v_uid;
  delete from public.goals where user_id = v_uid;
  delete from public.accounts where user_id = v_uid;
  delete from public.user_settings where user_id = v_uid;

  insert into public.user_settings (user_id, assumptions, privacy, data_version, updated_at)
  values (v_uid, coalesce(v_assumptions, '{}'::jsonb), v_privacy, v_data_version, now());

  insert into public.accounts (
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
  get diagnostics v_cash_flows = row_count;

  insert into public.scenario_events (
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
  get diagnostics v_goals = row_count;

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

revoke all on function public.restore_finance_backup_v1(jsonb) from public;
revoke all on function public.restore_finance_backup_v1(jsonb) from anon;
grant execute on function public.restore_finance_backup_v1(jsonb) to authenticated;
