# AIOS 云端同步(Life OS 统一 Supabase)

AIOS 与 home / portal / music / fitness 等共用同一个 Life OS Supabase 项目和账户体系
(URL/key 硬编码在 `@life-os/sync`,共享 auth storage key)。设置页登录 Life OS
账户(邮箱 + 密码)即启用同步,零配置;注册在 Portal/Fitness 侧完成。

本地优先不变:数据仍存 localStorage;登录后按客户端时间戳 LWW 合并、删除走墓碑。
AIOS 刻意不接 `app_memberships` 门禁——未登录一切照常,登录只是加同步。

## 上云的数据(以及不上云的)

| 数据 | 位置 | 同步方式 |
|---|---|---|
| 对话正文 | `aios.conversations` | 每行 LWW + 墓碑;图片 dataURL 剥离 |
| 长期记忆 | `aios.memories` | 每行 LWW + 墓碑;向量本地重算 |
| 设置 + 用户画像 | `aios.user_state`(单行 jsonb) | 整包 LWW(`settingsUpdatedAt`) |
| 生成的图片 | 私有 Storage `aios-images` | **按需**:用户在查看器点「上传到云端」才存,别的设备懒加载 |

**不上云:** 记忆向量(本地重算)、代理会话(目标 app 属本机)、角色库(在
local-ai 网关)、草稿 / 活动会话 / dream 时间戳(临时或每标签页独立)。

多设备收敛:本地改动防抖推送 + **回前台自动拉一次**(`bindVisibilitySync`)。

## 部署状态

✅ 已在生产项目(Life OS `iueozzuctstwvzbcxcyh`)部署完成(2026-07-13):
- `aios` schema 三表(`conversations` / `memories` / `user_state`)+ RLS;
- 私有 Storage bucket `aios-images` + `storage.objects` 四条 RLS(按 `{uid}/` 前缀);
- 三条迁移历史已 `migration repair --status applied` 登记;
- Data API 的 exposed schemas 已加 `aios`(经 Management API PATCH `/postgrest`)。

登录你的 Life OS 账户即可用,无需其它操作。

### 从零复现(换项目 / 重建时)

1. `cd apps/aios && supabase link --project-ref <ref>`
2. 建表:逐个 `supabase db query --linked -f migrations/<file>.sql`
   (远端已有其它 app 迁移记录时 `db push` 会因历史不一致报错,直接 query 更稳;
   之后 `supabase migration repair --status applied <version>` 补登记)。
3. 暴露 schema:Dashboard → Settings → API → Exposed schemas 加 `aios`
   (或 Management API:`PATCH /v1/projects/<ref>/postgrest`,把 `aios` 追加进
   `db_schema` 与 `db_extra_search_path`)。本地 dev 的 config.toml 已含 `aios`。

## 安全模型

- 三张表都在 `aios` schema,schema 只 GRANT 给 `authenticated` + `service_role`,
  匿名完全不可见;都开 RLS,四条策略全部限定 `auth.uid() = user_id`,update 带
  `with check`,行不可能改挂到别人名下。
- Storage `aios-images` 私有,RLS 按对象路径首段 `{uid}` 隔离;跨设备读取用
  1 小时签名 URL,不公开。
- 前端只用 publishable key,行级隔离靠 RLS,不依赖客户端自觉。
