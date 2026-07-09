-- Web Push subscriptions for reliable task reminders (iOS 16.4+ installed PWAs).

create table if not exists public.planner_push_subscriptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

create index if not exists planner_push_subscriptions_user_idx
  on public.planner_push_subscriptions (user_id);

-- Dedupe server-sent reminders (cron may overlap windows).
create table if not exists public.planner_reminder_push_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id text not null,
  fire_at bigint not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, task_id, fire_at)
);

alter table public.planner_push_subscriptions enable row level security;
alter table public.planner_reminder_push_log enable row level security;

drop policy if exists "planner_push_subscriptions_select_own" on public.planner_push_subscriptions;
create policy "planner_push_subscriptions_select_own"
  on public.planner_push_subscriptions for select
  using ((select auth.uid()) = user_id);

drop policy if exists "planner_push_subscriptions_insert_own" on public.planner_push_subscriptions;
create policy "planner_push_subscriptions_insert_own"
  on public.planner_push_subscriptions for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "planner_push_subscriptions_update_own" on public.planner_push_subscriptions;
create policy "planner_push_subscriptions_update_own"
  on public.planner_push_subscriptions for update
  using ((select auth.uid()) = user_id);

drop policy if exists "planner_push_subscriptions_delete_own" on public.planner_push_subscriptions;
create policy "planner_push_subscriptions_delete_own"
  on public.planner_push_subscriptions for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "planner_reminder_push_log_select_own" on public.planner_reminder_push_log;
create policy "planner_reminder_push_log_select_own"
  on public.planner_reminder_push_log for select
  using ((select auth.uid()) = user_id);

-- Cron uses service role; no insert policy for authenticated clients.
