-- FINC.PURCHASE.6.a hardening: purchase review RPCs must not be executable by anon.
-- Invoker RLS still applies for authenticated; anon should fail at EXECUTE, not deeper.

revoke execute on function public.purchase_review_get(uuid) from anon, public;
revoke execute on function public.purchase_review_decide(uuid, text, integer, text) from anon, public;
revoke execute on function public.purchase_review_undo(uuid, uuid, integer, text) from anon, public;

grant execute on function public.purchase_review_get(uuid) to authenticated;
grant execute on function public.purchase_review_decide(uuid, text, integer, text) to authenticated;
grant execute on function public.purchase_review_undo(uuid, uuid, integer, text) to authenticated;
