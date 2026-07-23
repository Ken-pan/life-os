-- Kenos 诊断 triage:崩溃 / 错误日志的「已解决 / 忽略」状态闭环。
--
-- 背景:bug_logs 自带 status(open/fixed/ignored),但崩溃(kenos_crash_events 是
-- kenos_app_logs 上的 view)与普通错误日志没有解决状态的概念 —— 只能反复重看同一堆。
-- 这张表按「问题指纹」记录 owner 的处置,triage 面据此把已解决的默认折叠。
--
-- 建模:每用户 × 问题类型 × 指纹一行。
--   issue_type: 'crash' | 'log'
--   issue_key : 崩溃用 metadata.fingerprint;日志用读模型算的稳定分组键(见 diagnosticsModel.core.js)
--   status    : 'open' | 'resolved' | 'ignored'
-- 消费方:apps/aios/src/lib/kenos/diagnosticsReadSource.js + diagnosticsStore.svelte.js
-- 仅诊断处置,不在 read-canary 写 denylist(非 domain 变更)。

create table if not exists public.kenos_issue_resolutions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  issue_type text not null check (issue_type = any (array['crash'::text, 'log'::text])),
  issue_key text not null check (char_length(issue_key) between 1 and 400),
  status text not null default 'resolved'
    check (status = any (array['open'::text, 'resolved'::text, 'ignored'::text])),
  note text check (note is null or char_length(note) <= 2000),
  -- 处置时锁定的样本上下文(展示用:出现次数、末次时间、构建版本),便于日后回看
  sample jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, issue_type, issue_key)
);

alter table public.kenos_issue_resolutions enable row level security;

grant select, insert, update, delete on public.kenos_issue_resolutions to authenticated;

create policy "kenos_issue_resolutions_select_own" on public.kenos_issue_resolutions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "kenos_issue_resolutions_insert_own" on public.kenos_issue_resolutions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "kenos_issue_resolutions_update_own" on public.kenos_issue_resolutions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "kenos_issue_resolutions_delete_own" on public.kenos_issue_resolutions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.kenos_issue_resolutions is
  'Owner triage dispositions for Kenos crashes / error logs (resolved/ignored), keyed by issue fingerprint.';
