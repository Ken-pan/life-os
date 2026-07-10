do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bug_logs_app_check'
      and conrelid = 'public.bug_logs'::regclass
  ) then
    alter table public.bug_logs
    add constraint bug_logs_app_check
    check (app in ('portal', 'planner', 'fitness', 'music', 'finance', 'home'))
    not valid;
  end if;
end $$;

alter table public.bug_logs validate constraint bug_logs_app_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bug_logs_severity_check'
      and conrelid = 'public.bug_logs'::regclass
  ) then
    alter table public.bug_logs
    add constraint bug_logs_severity_check
    check (severity in ('low', 'medium', 'high'))
    not valid;
  end if;
end $$;

alter table public.bug_logs validate constraint bug_logs_severity_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bug_logs_status_check'
      and conrelid = 'public.bug_logs'::regclass
  ) then
    alter table public.bug_logs
    add constraint bug_logs_status_check
    check (status in ('open', 'fixed', 'ignored'))
    not valid;
  end if;
end $$;

alter table public.bug_logs validate constraint bug_logs_status_check;