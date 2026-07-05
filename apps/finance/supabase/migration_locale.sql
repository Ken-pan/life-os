-- UI locale preference (zh-CN / en-US), synced per user.
alter table public.user_settings
  add column if not exists locale text not null default 'zh-CN';

comment on column public.user_settings.locale is
  'App UI locale (BCP 47), e.g. zh-CN or en-US';
