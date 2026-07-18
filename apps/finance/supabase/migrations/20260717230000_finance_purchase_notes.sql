-- FINC.PURCHASE.6b — user note + processing status ("已处理").
--
-- Closes the last two 6b pieces after the returned-purchase → refund-txn linking:
-- a private free-text note and a "handled / 已处理" flag per transaction, so the
-- user can close out "退货/退款后我怎么处理了这笔" directly on the ledger row.
--
-- Deliberately a small owner-scoped annotation table separate from
-- purchase_associations: that table is the transaction↔order *match* state machine
-- (proposed/confirmed/rejected, versioned, undoable). A personal note + handled
-- flag has none of that ceremony — it is a plain per-(user, transaction) upsert.
--
-- NOTE: purchase_enrichment JSONB stays enrichment-only (never authoritative
-- annotation state), same invariant as 6.a.

-- ─────────────────────────────── Table ───────────────────────────────

create table if not exists public.purchase_notes (
  user_id        uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.finance_transactions (id) on delete cascade,
  note           text not null default '',
  handled        boolean not null default false,
  handled_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- One annotation per (owner, transaction): the stable upsert conflict target.
  primary key (user_id, transaction_id)
);

comment on table public.purchase_notes is
  'FINC.PURCHASE.6b private per-transaction note + handled/已处理 flag. purchase_enrichment JSONB stays enrichment-only.';

create index if not exists purchase_notes_user_handled_idx
  on public.purchase_notes (user_id, handled);

-- ─────────────────────────────── RLS ───────────────────────────────
-- Same ownership rule as finance_transactions: owner + finance app access.

alter table public.purchase_notes enable row level security;

drop policy if exists purchase_notes_select on public.purchase_notes;
create policy purchase_notes_select on public.purchase_notes
  for select using (
    (select auth.uid()) = user_id and private.has_app_access('finance')
  );

drop policy if exists purchase_notes_insert on public.purchase_notes;
create policy purchase_notes_insert on public.purchase_notes
  for insert with check (
    (select auth.uid()) = user_id and private.has_app_access('finance')
  );

drop policy if exists purchase_notes_update on public.purchase_notes;
create policy purchase_notes_update on public.purchase_notes
  for update using (
    (select auth.uid()) = user_id and private.has_app_access('finance')
  ) with check (
    (select auth.uid()) = user_id and private.has_app_access('finance')
  );

drop policy if exists purchase_notes_delete on public.purchase_notes;
create policy purchase_notes_delete on public.purchase_notes
  for delete using (
    (select auth.uid()) = user_id and private.has_app_access('finance')
  );

-- ─────────────────────────────── RPCs ───────────────────────────────
-- security invoker: RLS above is the authority. user_id + handled_at are set
-- server-side so the client never fabricates ownership or the handled timestamp.

-- Read the note for a transaction. Returns defaults (ok=true, empty note, not
-- handled) when no row exists yet — a missing row is a valid "no annotation" state,
-- distinct from a transport error (which the client reads as "notes unavailable").
create or replace function public.purchase_note_get(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_row public.purchase_notes%rowtype;
begin
  select * into v_row
  from public.purchase_notes
  where user_id = (select auth.uid())
    and transaction_id = p_transaction_id;

  if not found then
    return jsonb_build_object(
      'ok', true, 'note', '', 'handled', false, 'handled_at', null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'note', v_row.note,
    'handled', v_row.handled,
    'handled_at', v_row.handled_at);
end;
$$;

-- Upsert the note + handled flag for a transaction. handled_at is stamped on the
-- transition into handled and kept stable while it stays handled; cleared on
-- unmark. note + handled from the client are authoritative (full-field write).
create or replace function public.purchase_note_set(
  p_transaction_id uuid,
  p_note           text,
  p_handled        boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.purchase_notes%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  insert into public.purchase_notes as pn (user_id, transaction_id, note, handled, handled_at)
  values (
    (select auth.uid()),
    p_transaction_id,
    coalesce(p_note, ''),
    coalesce(p_handled, false),
    case when coalesce(p_handled, false) then now() else null end
  )
  on conflict (user_id, transaction_id) do update
    set note = coalesce(p_note, ''),
        handled = coalesce(p_handled, false),
        handled_at = case
          when coalesce(p_handled, false) then coalesce(pn.handled_at, now())
          else null
        end,
        updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'note', v_row.note,
    'handled', v_row.handled,
    'handled_at', v_row.handled_at);
end;
$$;

-- ─────────────────────────────── Grants ───────────────────────────────

revoke all on function public.purchase_note_get(uuid) from public;
grant execute on function public.purchase_note_get(uuid) to authenticated;

revoke all on function public.purchase_note_set(uuid, text, boolean) from public;
grant execute on function public.purchase_note_set(uuid, text, boolean) to authenticated;

notify pgrst, 'reload schema';
