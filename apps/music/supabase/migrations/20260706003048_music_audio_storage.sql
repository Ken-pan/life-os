-- Private audio storage for MUSIC.OS
-- Metadata stays in music.music_track_meta; binaries in private Storage bucket `music`.
-- Object path: {auth.uid}/{track_id}.{ext}

alter table music.music_track_meta
  add column if not exists storage_path text not null default '',
  add column if not exists mime_type text not null default '',
  add column if not exists size_bytes bigint not null default 0;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'music',
  'music',
  false,
  104857600, -- 100 MiB per file (enough for FLAC)
  array[
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a',
    'audio/aac',
    'audio/flac',
    'audio/x-flac',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/opus',
    'audio/webm',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "music_audio_select_own" on storage.objects;
drop policy if exists "music_audio_insert_own" on storage.objects;
drop policy if exists "music_audio_update_own" on storage.objects;
drop policy if exists "music_audio_delete_own" on storage.objects;

create policy "music_audio_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "music_audio_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Upsert requires UPDATE + SELECT in addition to INSERT.
create policy "music_audio_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "music_audio_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
