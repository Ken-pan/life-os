-- HomeOS · 扫描照片与原始结构云存储(私有 bucket `home-scan-photos`)
-- iOS 扫描应用上传:
--   {auth.uid}/{scanId}/{uuid}.jpg      机位照片(设备端已压到 ≤2048px JPEG)
--   {auth.uid}/{scanId}/structure.json  原始 CapturedStructure(备将来重处理,可到数 MB)
-- 网页端拉取扫描时按签名 URL 逐张下载照片,写进本机 IndexedDB 后即与云端无关。
-- upsert 需要 INSERT + SELECT + UPDATE 三条策略,少一条替换会静默失败。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'home-scan-photos',
  'home-scan-photos',
  false,
  20971520, -- 20 MiB per file(structure.json 可能到数 MB;照片通常几百 KB)
  array['image/jpeg', 'image/png', 'application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "home_scan_photos_select_own" on storage.objects;
drop policy if exists "home_scan_photos_insert_own" on storage.objects;
drop policy if exists "home_scan_photos_update_own" on storage.objects;
drop policy if exists "home_scan_photos_delete_own" on storage.objects;

create policy "home_scan_photos_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'home-scan-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "home_scan_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'home-scan-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "home_scan_photos_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'home-scan-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'home-scan-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "home_scan_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'home-scan-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
