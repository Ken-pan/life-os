-- AI.OS · 按需生成图片云存储(私有 bucket `aios-images`)
-- 本地优先:生成图默认只在本机(内联在对话里的 WebP dataURL)。用户在图片
-- 查看器主动「上传到云端」时,才把该图存进这里,路径写回对话 payload(会同步);
-- 别的设备打开对话时按需从这里 fetch。对象路径:{auth.uid}/{uuid}.webp
-- upsert 需要 INSERT + SELECT + UPDATE 三条策略,少一条替换会静默失败。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'aios-images',
  'aios-images',
  false,
  10485760, -- 10 MiB per file(生成图为 WebP,通常几百 KB)
  array['image/webp', 'image/png', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "aios_images_select_own" on storage.objects;
drop policy if exists "aios_images_insert_own" on storage.objects;
drop policy if exists "aios_images_update_own" on storage.objects;
drop policy if exists "aios_images_delete_own" on storage.objects;

create policy "aios_images_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'aios-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "aios_images_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'aios-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "aios_images_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'aios-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'aios-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "aios_images_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'aios-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
