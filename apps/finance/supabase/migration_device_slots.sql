-- 设备槽位迁移：从「每个浏览器 = 一台设备」改为「电脑 / 手机 两个逻辑槽位」
-- 在 Supabase SQL Editor 执行一次即可（已有项目升级用）。

-- 1) 新增 device_class 列
alter table public.allowed_devices
  add column if not exists device_class text;

-- 2) 根据旧 label 回填
update public.allowed_devices
set device_class = case
  when label like '手机%' then 'mobile'
  else 'desktop'
end
where device_class is null;

-- 3) 合并重复槽位：同一用户同类型只保留最近活跃的一条
delete from public.allowed_devices d
using (
  select id,
    row_number() over (
      partition by user_id, device_class
      order by last_seen_at desc nulls last, created_at desc
    ) as rn
  from public.allowed_devices
  where device_class is not null
) ranked
where d.id = ranked.id
  and ranked.rn > 1;

-- 4) 统一显示名称
update public.allowed_devices
set label = case device_class
  when 'mobile' then '手机'
  else '电脑'
end
where device_class is not null;

-- 5) 约束：每用户最多一个 desktop + 一个 mobile
alter table public.allowed_devices
  alter column device_class set not null;

alter table public.allowed_devices
  drop constraint if exists allowed_devices_device_class_check;

alter table public.allowed_devices
  add constraint allowed_devices_device_class_check
  check (device_class in ('desktop', 'mobile'));

drop index if exists allowed_devices_user_class_uidx;
create unique index allowed_devices_user_class_uidx
  on public.allowed_devices (user_id, device_class);

-- 6) 触发器改为按槽位类型计数（desktop + mobile 最多 2）
create or replace function public.enforce_device_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  slot_count integer;
begin
  select count(distinct device_class) into slot_count
  from public.allowed_devices
  where user_id = new.user_id;

  if slot_count >= 2 and not exists (
    select 1 from public.allowed_devices
    where user_id = new.user_id and device_class = new.device_class
  ) then
    raise exception 'device limit reached (max 1 desktop + 1 mobile)';
  end if;

  return new;
end;
$$;
