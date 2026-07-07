-- Regression: extension sync JSON helpers tolerate empty / junk strings (no 22P02).
-- Run: ./scripts/supabase-sql.sh -f apps/finance/scripts/test-extension-sync-rpc-regression.sql

do $$
declare
  v_elem jsonb := jsonb_build_object(
    'date', '2026-07-01',
    'merchant', 'Test Merchant',
    'category', '',
    'account', '',
    'flow_type', 'expense',
    'amount', '',
    'budget_impact', '',
    'include_in_spending_analytics', '',
    'include_in_cash_flow_history', '',
    'exclude_reason', '',
    'source', '',
    'platform_id', '',
    'sort_order', '',
    'installment_number', ''
  );
begin
  if public.fos_ext_json_date(v_elem, 'date') is distinct from '2026-07-01'::date then
    raise exception 'fos_ext_json_date failed on valid date';
  end if;
  if public.fos_ext_json_date('{"date":""}'::jsonb, 'date') is not null then
    raise exception 'fos_ext_json_date should null empty string';
  end if;
  if public.fos_ext_json_bool(v_elem, 'include_in_spending_analytics', false) is distinct from false then
    raise exception 'fos_ext_json_bool empty string should default false';
  end if;
  if public.fos_ext_json_numeric(v_elem, 'amount', 0) is distinct from 0::numeric then
    raise exception 'fos_ext_json_numeric empty string should default 0';
  end if;
  if public.fos_ext_json_int(v_elem, 'sort_order') is not null then
    raise exception 'fos_ext_json_int empty string should null';
  end if;
  if public.fos_ext_json_bigint(v_elem, 'installment_number') is not null then
    raise exception 'fos_ext_json_bigint empty string should null';
  end if;
  raise notice 'extension sync RPC regression helpers OK';
end;
$$;
