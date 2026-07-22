-- Code 域 cursor-bridge 配对分发:Mac 上报桥端点(host + 配对码),
-- 手机端用登录态自动发现,配对零手输。上云的是访问凭证与主机名,
-- Cursor 对话内容永不上云(红线不变,Owner 2026-07-22 确认凭证可上云)。
--
-- RLS 是唯一防线(aios schema 的 default privileges 已 grant all to
-- authenticated),必须 enable RLS + owner-only policy;不建视图
-- (见 core_trusted_devices definer 视图 RLS 绕过的教训)。

create table if not exists aios.code_bridge_endpoints (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 上报机器的主机名(一用户可多台 Mac,各占一行)
  hostname text not null,
  -- 连接地址,形如 "kens-mac.local:5273"
  host text not null,
  -- 桥配对码(~/.kenos/cursor-bridge.token);轮转后 Mac 端会重新上报
  token text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, hostname)
);

alter table aios.code_bridge_endpoints enable row level security;

drop policy if exists "code_bridge_endpoints_owner" on aios.code_bridge_endpoints;
create policy "code_bridge_endpoints_owner"
  on aios.code_bridge_endpoints
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
