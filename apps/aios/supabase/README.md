# AIOS 云端同步(Life OS 统一 Supabase)

AIOS 与 home / portal / music / fitness 等共用同一个 Life OS Supabase 项目和账户体系
(URL/key 硬编码在 `@life-os/sync`,共享 auth storage key)。设置页登录 Life OS
账户(邮箱 + 密码)即启用同步,零配置;注册在 Portal/Fitness 侧完成。

本地优先不变:对话与记忆仍存 localStorage;登录后按客户端时间戳 LWW 合并、
删除走墓碑。图片 / 文件附件不上云。AIOS 刻意不接 `app_memberships` 门禁——
未登录一切照常,登录只是加同步。

## 部署迁移(一次性)

1. `cd apps/aios && supabase link --project-ref iueozzuctstwvzbcxcyh && supabase db push`
   (或把 `migrations/20260713215222_aios_cloud_sync.sql` 粘到 Dashboard SQL Editor 执行)。
2. Dashboard → Settings → API → Exposed schemas 加上 `aios`
   (本地 dev 的 config.toml 已把 `aios` 加进 `api.schemas`)。

## 安全模型

- 数据在 `aios` schema(`conversations` / `memories`),schema 只 GRANT 给
  `authenticated` + `service_role`,匿名完全不可见。
- 两张表都开 RLS,select/insert/update/delete 四条策略全部限定
  `auth.uid() = user_id`;update 带 `with check`,行不可能改挂到别人名下。
- 前端只用 publishable key,行级隔离靠 RLS,不依赖客户端自觉。
