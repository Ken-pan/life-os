-- Life OS: 为各业务表增加 os_module 列，便于在 Supabase Table Editor 中识别记录所属模块。
-- 模块: finance | fitness | planner | core

create table if not exists public.life_os_modules (
  slug text primary key,
  display_name text not null,
  schema_name text not null default 'public',
  description text not null default ''
);

insert into public.life_os_modules (slug, display_name, schema_name, description) values
  ('finance', 'Finance OS', 'public', '个人财务、交易、场景、持仓与回顾'),
  ('fitness', 'Fitness OS', 'fitness', '健身训练计划、重量与训练记录'),
  ('planner', 'Planner OS', 'public', '任务清单与 Planner 用户状态'),
  ('core', 'Life OS Core', 'public', '跨模块共享基础设施（如设备授权）')
on conflict (slug) do update set
  display_name = excluded.display_name,
  schema_name = excluded.schema_name,
  description = excluded.description;

alter table public.life_os_modules enable row level security;

drop policy if exists "life_os_modules_select_all" on public.life_os_modules;
create policy "life_os_modules_select_all"
  on public.life_os_modules for select
  using (true);

comment on table public.life_os_modules is 'Life OS 模块注册表：finance / fitness / planner / core';

create or replace function private.add_os_module_column(
  p_schema text,
  p_table text,
  p_module text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  execute format(
    'alter table %I.%I add column if not exists os_module text not null default %L',
    p_schema, p_table, p_module
  );
  execute format(
    'alter table %I.%I drop constraint if exists %I',
    p_schema, p_table, p_table || '_os_module_check'
  );
  execute format(
    'alter table %I.%I add constraint %I check (os_module = %L)',
    p_schema, p_table, p_table || '_os_module_check', p_module
  );
  execute format(
    'comment on column %I.%I.os_module is %L',
    p_schema, p_table, '所属 Life OS 模块（' || p_module || '）'
  );
end;
$$;

-- Finance OS（public，非 planner_* / allowed_devices）
select private.add_os_module_column('public', 'accounts', 'finance');
select private.add_os_module_column('public', 'balance_assertions', 'finance');
select private.add_os_module_column('public', 'cash_flows', 'finance');
select private.add_os_module_column('public', 'decision_records', 'finance');
select private.add_os_module_column('public', 'expected_occurrences', 'finance');
select private.add_os_module_column('public', 'extension_processed_captures', 'finance');
select private.add_os_module_column('public', 'finance_data', 'finance');
select private.add_os_module_column('public', 'goals', 'finance');
select private.add_os_module_column('public', 'holding_daily_candles', 'finance');
select private.add_os_module_column('public', 'holding_positions', 'finance');
select private.add_os_module_column('public', 'holding_price_trails', 'finance');
select private.add_os_module_column('public', 'holdings_snapshots', 'finance');
select private.add_os_module_column('public', 'merchant_rules', 'finance');
select private.add_os_module_column('public', 'recurring_items', 'finance');
select private.add_os_module_column('public', 'review_items', 'finance');
select private.add_os_module_column('public', 'scenario_apply_audits', 'finance');
select private.add_os_module_column('public', 'scenario_events', 'finance');
select private.add_os_module_column('public', 'scenario_snapshots', 'finance');
select private.add_os_module_column('public', 'scenarios', 'finance');
select private.add_os_module_column('public', 'transaction_imports', 'finance');
select private.add_os_module_column('public', 'transactions', 'finance');
select private.add_os_module_column('public', 'user_settings', 'finance');

-- Planner OS
select private.add_os_module_column('public', 'planner_lists', 'planner');
select private.add_os_module_column('public', 'planner_tasks', 'planner');
select private.add_os_module_column('public', 'planner_user_state', 'planner');

-- Life OS Core
select private.add_os_module_column('public', 'allowed_devices', 'core');

-- Fitness OS
select private.add_os_module_column('fitness', 'profiles', 'fitness');
select private.add_os_module_column('fitness', 'user_state', 'fitness');
select private.add_os_module_column('fitness', 'exercise_weights', 'fitness');
select private.add_os_module_column('fitness', 'workout_sessions', 'fitness');
select private.add_os_module_column('fitness', 'exercise_logs', 'fitness');

drop function private.add_os_module_column(text, text, text);

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
    when c.relname = 'allowed_devices' then 'core'
    when n.nspname = 'public'
      and c.relname not in ('life_os_modules', 'life_os_table_catalog')
      and c.relkind = 'r' then 'finance'
    else null
  end
)
where c.relkind = 'r'
  and n.nspname in ('public', 'fitness')
  and c.relname not in ('life_os_modules')
order by m.slug nulls last, n.nspname, c.relname;

comment on view public.life_os_table_catalog is 'Life OS 表级模块对照（配合各表 os_module 列使用）';

grant select on public.life_os_table_catalog to anon, authenticated, service_role;
