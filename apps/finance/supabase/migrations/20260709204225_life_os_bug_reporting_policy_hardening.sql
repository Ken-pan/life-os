-- Harden bug reporting RLS policies for existing environments.
-- Keep this as a follow-up migration so already-applied instances get updated.

grant select, insert, update, delete on public.bug_logs to authenticated;

drop policy if exists bug_logs_select_own on public.bug_logs;
create policy bug_logs_select_own
  on public.bug_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists bug_logs_insert_own on public.bug_logs;
create policy bug_logs_insert_own
  on public.bug_logs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists bug_logs_update_own on public.bug_logs;
create policy bug_logs_update_own
  on public.bug_logs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists bug_logs_delete_own on public.bug_logs;
create policy bug_logs_delete_own
  on public.bug_logs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists bug_attachments_select_own on storage.objects;
drop policy if exists bug_attachments_insert_own on storage.objects;
drop policy if exists bug_attachments_update_own on storage.objects;
drop policy if exists bug_attachments_delete_own on storage.objects;

create policy bug_attachments_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'bug-attachments'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy bug_attachments_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'bug-attachments'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy bug_attachments_update_own
on storage.objects for update
to authenticated
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
to authenticated
using (
  bucket_id = 'bug-attachments'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);