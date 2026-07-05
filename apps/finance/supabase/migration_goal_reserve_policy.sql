-- P0 cash reliability: explicit reserve policy fields
alter table if exists public.goals
  add column if not exists monthly_allocation_day integer,
  add column if not exists reserve_policy text;

update public.goals
set reserve_policy = case
  when reserve = true then 'earmarked_operating_cash'
  else 'milestone_only'
end
where reserve_policy is null;

alter table if exists public.user_settings
  alter column data_version set default 6;
