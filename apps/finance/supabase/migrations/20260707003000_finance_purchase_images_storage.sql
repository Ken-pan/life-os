-- Public thumbnails for Finance OS purchase enrichment line items.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'finance-purchase-images',
  'finance-purchase-images',
  true,
  262144,
  array['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists finance_purchase_images_public_select on storage.objects;
drop policy if exists finance_purchase_images_insert_own on storage.objects;
drop policy if exists finance_purchase_images_update_own on storage.objects;
drop policy if exists finance_purchase_images_delete_own on storage.objects;

create policy finance_purchase_images_public_select
on storage.objects for select
using (bucket_id = 'finance-purchase-images');

create policy finance_purchase_images_insert_own
on storage.objects for insert
with check (
  bucket_id = 'finance-purchase-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy finance_purchase_images_update_own
on storage.objects for update
using (
  bucket_id = 'finance-purchase-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'finance-purchase-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy finance_purchase_images_delete_own
on storage.objects for delete
using (
  bucket_id = 'finance-purchase-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

comment on column public.finance_transactions.purchase_enrichment is
  'Optional purchase context: { source, orderId, detailUrl, lineItems[{ title, imageUrl, imageStoragePath }], returnInfo, matchConfidence, matchedAt }';
