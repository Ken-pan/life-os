-- 设备持久化 ID 迁移：为 allowed_devices 增加 device_id 列，
-- 让登录校验能用浏览器端持久化的 localStorage 指纹「真正识别同一台设备」，
-- 而不再仅凭 user_agent / 设备类型（换浏览器或 UA 变化也能认出本机）。
--
-- 在 Supabase SQL Editor 执行一次即可（已有项目升级用）。
-- 该变更向后兼容：device_id 可为空，旧记录会在设备下次登录时自动回填。

alter table public.allowed_devices
  add column if not exists device_id text;

create index if not exists allowed_devices_device_id_idx
  on public.allowed_devices (user_id, device_id);
