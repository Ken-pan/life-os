-- AI.OS · aios schema · 壳偏好 / 空间连续性 per-key LWW 同步(shell_state)
-- 目标:iOS 原生壳与 Web 端共享 domain 固定(pin)/最近使用/续播描述符,
-- 登录即同步,换设备不用重复配置。
--
-- 建模:每用户多行,key 命名空间:
--   spaces.pinned          → { ids: string[] }(整表 LWW)
--   spaces.recent          → { ids: string[] }(整表 LWW)
--   spaces.resume.<listKey> → ResumeDescriptor(逐 key LWW,删除走墓碑)
-- updated_at 为客户端毫秒时间戳,与 user_state/conversations 同源,便于 LWW。
-- 删除用墓碑(deleted=true)而非物理删除:离线设备上线后不会复活已删续播。
-- 消费方:apps/aios/src/lib/kenos/shellStateSync.core.js(Web)
--        clients/apple/Apps/Shared/KenosShellStateSync.swift(iOS 原生)

create table if not exists aios.shell_state (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at bigint not null default 0,
  deleted boolean not null default false,
  primary key (user_id, key)
);

alter table aios.shell_state enable row level security;

grant select, insert, update, delete on aios.shell_state to authenticated;

create policy "shell_state_select_own" on aios.shell_state
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "shell_state_insert_own" on aios.shell_state
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "shell_state_update_own" on aios.shell_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "shell_state_delete_own" on aios.shell_state
  for delete to authenticated
  using ((select auth.uid()) = user_id);
