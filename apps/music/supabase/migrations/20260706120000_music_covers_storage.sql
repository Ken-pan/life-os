insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'music-covers',
  'music-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists music_covers_public_select on storage.objects;
drop policy if exists music_covers_insert_own on storage.objects;
drop policy if exists music_covers_update_own on storage.objects;
drop policy if exists music_covers_delete_own on storage.objects;

create policy music_covers_public_select
on storage.objects for select
using (bucket_id = 'music-covers');

create policy music_covers_insert_own
on storage.objects for insert
with check (
  bucket_id = 'music-covers'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy music_covers_update_own
on storage.objects for update
using (
  bucket_id = 'music-covers'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'music-covers'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy music_covers_delete_own
on storage.objects for delete
using (
  bucket_id = 'music-covers'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
