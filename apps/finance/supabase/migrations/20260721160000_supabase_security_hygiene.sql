-- Security hygiene (2026-07-21 audit follow-up)
--
-- 1) Trigger helpers must not be callable as Data API RPCs.
--    They are SECURITY DEFINER and only needed as trigger bodies.
-- 2) paper_device_actions insert policy WITH CHECK (true) was a no-op for
--    service_role (bypasses RLS) but left anon/authenticated able to insert
--    arbitrary rows. Netlify paperService uses service_role; drop the policy.

revoke all on function public.trg_finance_bill_to_event() from public;
revoke all on function public.trg_finance_bill_to_event() from anon;
revoke all on function public.trg_finance_bill_to_event() from authenticated;

revoke all on function public.trg_fitness_workout_to_event() from public;
revoke all on function public.trg_fitness_workout_to_event() from anon;
revoke all on function public.trg_fitness_workout_to_event() from authenticated;

drop policy if exists paper_device_actions_service_insert on public.paper_device_actions;

notify pgrst, 'reload schema';
