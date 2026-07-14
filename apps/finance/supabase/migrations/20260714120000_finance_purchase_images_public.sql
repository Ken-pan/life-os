-- Re-assert the finance-purchase-images bucket as PUBLIC.
--
-- The bucket was created public by 20260707003000_finance_purchase_images_storage
-- (in migrations_legacy), but a later global storage settings change on 2026-07-10
-- flipped every bucket to public=false. With a private bucket the app's
-- `/storage/v1/object/public/...` thumbnail URLs return 404 ("Bucket not found"),
-- so every purchase line-item image silently fails to load even though the objects
-- exist. Product thumbnails are low-sensitivity and the read path is public-URL by
-- design (lineItemImageSrc), so the bucket must stay public. This migration is
-- idempotent and re-asserts the intended state.

update storage.buckets
set public = true
where id = 'finance-purchase-images';

-- Public read stays scoped to this bucket; writes remain owner-only (per-user
-- first path segment), unchanged from the original storage migration.
drop policy if exists finance_purchase_images_public_select on storage.objects;
create policy finance_purchase_images_public_select
on storage.objects for select
using (bucket_id = 'finance-purchase-images');
