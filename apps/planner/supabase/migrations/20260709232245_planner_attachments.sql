-- PLANNER.OS 附件表与 Storage Bucket

create table if not exists public.planner_attachments (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  owner_type text not null,
  owner_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),

  primary key (user_id, id),

  constraint planner_attachments_owner_type_check
    check (owner_type in ('task', 'project'))
);

create index if not exists planner_attachments_owner_idx
  on public.planner_attachments (user_id, owner_type, owner_id);

alter table public.planner_attachments enable row level security;

drop policy if exists "planner_attachments_select_own" on public.planner_attachments;
create policy "planner_attachments_select_own"
  on public.planner_attachments for select
  using ((select auth.uid()) = user_id);

drop policy if exists "planner_attachments_insert_own" on public.planner_attachments;
create policy "planner_attachments_insert_own"
  on public.planner_attachments for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "planner_attachments_update_own" on public.planner_attachments;
create policy "planner_attachments_update_own"
  on public.planner_attachments for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "planner_attachments_delete_own" on public.planner_attachments;
create policy "planner_attachments_delete_own"
  on public.planner_attachments for delete
  using ((select auth.uid()) = user_id);

-- 创建 Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('planner-attachments', 'planner-attachments', false, 26214400, '{"image/*", "application/pdf", "text/plain", "text/markdown", "application/json", "text/csv"}')
on conflict (id) do nothing;

-- Supabase owns `storage.objects` as `supabase_storage_admin` and creates it
-- with RLS already enabled. The migration role may create scoped policies but
-- must not try to take ownership or alter the extension-managed table.

drop policy if exists "planner_attachments_object_select" on storage.objects;
create policy "planner_attachments_object_select"
  on storage.objects for select
  using ( bucket_id = 'planner-attachments' and (select auth.uid()::text) = (string_to_array(name, '/'))[1] );

drop policy if exists "planner_attachments_object_insert" on storage.objects;
create policy "planner_attachments_object_insert"
  on storage.objects for insert
  with check ( bucket_id = 'planner-attachments' and (select auth.uid()::text) = (string_to_array(name, '/'))[1] );

drop policy if exists "planner_attachments_object_update" on storage.objects;
create policy "planner_attachments_object_update"
  on storage.objects for update
  using ( bucket_id = 'planner-attachments' and (select auth.uid()::text) = (string_to_array(name, '/'))[1] )
  with check ( bucket_id = 'planner-attachments' and (select auth.uid()::text) = (string_to_array(name, '/'))[1] );

drop policy if exists "planner_attachments_object_delete" on storage.objects;
create policy "planner_attachments_object_delete"
  on storage.objects for delete
  using ( bucket_id = 'planner-attachments' and (select auth.uid()::text) = (string_to_array(name, '/'))[1] );
