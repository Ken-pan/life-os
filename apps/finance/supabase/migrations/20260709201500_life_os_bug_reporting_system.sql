-- Global Bug Logs table.
create table if not exists public.bug_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  app text not null,                          -- 'portal' | 'planner' | 'fitness' | 'music' | 'finance' | 'home'
  route text not null,                        -- current route pathname + search
  title text not null,
  notes text,
  screenshot_path text,                       -- path inside storage bucket
  severity text not null default 'medium',    -- 'low' | 'medium' | 'high'
  status text not null default 'open',        -- 'open' | 'fixed' | 'ignored'
  user_agent text,
  viewport_width int,
  viewport_height int,
  device_pixel_ratio numeric,
  console_summary text,
  error_message text,
  error_stack text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.bug_logs enable row level security;

-- Policies for bug_logs
drop policy if exists bug_logs_select_own on public.bug_logs;
create policy bug_logs_select_own
  on public.bug_logs for select
  using ((select auth.uid()) = user_id);

drop policy if exists bug_logs_insert_own on public.bug_logs;
create policy bug_logs_insert_own
  on public.bug_logs for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists bug_logs_update_own on public.bug_logs;
create policy bug_logs_update_own
  on public.bug_logs for update
  using ((select auth.uid()) = user_id);

drop policy if exists bug_logs_delete_own on public.bug_logs;
create policy bug_logs_delete_own
  on public.bug_logs for delete
  using ((select auth.uid()) = user_id);

-- Trigger for updated_at
create or replace function public.bug_logs_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bug_logs_updated_at on public.bug_logs;
create trigger bug_logs_updated_at
  before update on public.bug_logs
  for each row execute function public.bug_logs_touch_updated_at();

-- Index for sorting and performance
create index if not exists bug_logs_user_created_idx
  on public.bug_logs (user_id, created_at desc);

-- Private Storage Bucket for bug screenshots.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bug-attachments',
  'bug-attachments',
  false, -- private bucket
  6291456, -- 6MB file size limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS policies for storage objects in bug-attachments
drop policy if exists bug_attachments_select_own on storage.objects;
drop policy if exists bug_attachments_insert_own on storage.objects;
drop policy if exists bug_attachments_update_own on storage.objects;
drop policy if exists bug_attachments_delete_own on storage.objects;

create policy bug_attachments_select_own
on storage.objects for select
using (
  bucket_id = 'bug-attachments'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy bug_attachments_insert_own
on storage.objects for insert
with check (
  bucket_id = 'bug-attachments'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy bug_attachments_update_own
on storage.objects for update
using (
  bucket_id = 'bug-attachments'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'bug-attachments'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy bug_attachments_delete_own
on storage.objects for delete
using (
  bucket_id = 'bug-attachments'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
