-- I-P1.5 Events Layer: life_events table & transactional outbox

begin;

-- 1. Create life_events table
create table if not exists public.life_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for efficient querying by user and polling
create index if not exists life_events_user_status_idx on public.life_events(user_id, status);
create index if not exists life_events_type_idx on public.life_events(type);

-- RLS
alter table public.life_events enable row level security;
drop policy if exists life_events_select on public.life_events;
create policy life_events_select on public.life_events for select using (auth.uid() = user_id);
drop policy if exists life_events_insert on public.life_events;
create policy life_events_insert on public.life_events for insert with check (auth.uid() = user_id);
drop policy if exists life_events_update on public.life_events;
create policy life_events_update on public.life_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists life_events_delete on public.life_events;
create policy life_events_delete on public.life_events for delete using (auth.uid() = user_id);

-- 2. Transactional Outbox Trigger for Finance Bills
create or replace function public.trg_finance_bill_to_event()
returns trigger as $$
begin
  -- Only trigger for card bills
  if NEW.source_type = 'card_bill' then
    insert into public.life_events (
      user_id,
      type,
      payload
    ) values (
      NEW.user_id,
      'finance.bill_due',
      jsonb_build_object(
        'occurrence_id', NEW.id,
        'label', NEW.label,
        'expected_amount', NEW.expected_amount,
        'occurrence_date', NEW.occurrence_date
      )
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

-- Attach to Finance expected occurrences (finance_expected_occurrences since 20260705212000)
drop trigger if exists finance_bill_event_trigger on public.finance_expected_occurrences;
create trigger finance_bill_event_trigger
  after insert on public.finance_expected_occurrences
  for each row
  execute function public.trg_finance_bill_to_event();

commit;
