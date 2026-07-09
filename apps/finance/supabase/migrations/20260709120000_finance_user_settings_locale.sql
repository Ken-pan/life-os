-- UI locale preference (zh-CN / en-US), synced per user.
-- Table was renamed user_settings → finance_user_settings; locale was never added on prod.

alter table public.finance_user_settings
  add column if not exists locale text not null default 'zh-CN';

comment on column public.finance_user_settings.locale is
  'App UI locale (BCP 47), e.g. zh-CN or en-US';
