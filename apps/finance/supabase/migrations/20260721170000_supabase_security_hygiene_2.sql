-- Security hygiene slice 2 (2026-07-21)
--
-- 1) Pin search_path on touch/trigger helpers (Advisor 0011).
-- 2) Stop public listing of music-covers. Public object URLs still work via
--    bucket.public=true; app only upload()+getPublicUrl() on known paths.
--    Keep authenticated SELECT for own folder so storage upsert (INSERT+SELECT+UPDATE) works.

create or replace function public.planner_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.bug_logs_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.trg_finance_bill_to_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
$$;

-- Re-assert: trigger body only — not a Data API RPC.
revoke all on function public.trg_finance_bill_to_event() from public;
revoke all on function public.trg_finance_bill_to_event() from anon;
revoke all on function public.trg_finance_bill_to_event() from authenticated;

drop policy if exists music_covers_public_select on storage.objects;
drop policy if exists music_covers_select_own on storage.objects;

create policy music_covers_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'music-covers'
  and (storage.foldername(name))[1] = ((select auth.uid())::text)
  and private.has_app_access('music')
);

notify pgrst, 'reload schema';
