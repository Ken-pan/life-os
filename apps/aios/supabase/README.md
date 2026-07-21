# AIOS 云端同步(Life OS 统一 Supabase)

AIOS 与 home / portal / music / fitness 等共用同一个 Life OS Supabase 项目和账户体系
(URL/key 硬编码在 `@life-os/sync`,共享 auth storage key)。设置页登录 Life OS
账户(邮箱 + 密码)即启用同步,零配置;注册在 Portal/Fitness 侧完成。

本地优先不变:数据仍存 localStorage;登录后按客户端时间戳 LWW 合并、删除走墓碑。
AIOS 刻意不接 `app_memberships` 门禁——未登录一切照常,登录只是加同步。

## 云端只读版(Netlify)

**https://www.kenos.space**（rollback: `https://kenos-www.netlify.app`）— 登录后查看已同步的对话/记忆/图片。推理仍在本机,
故这是只读查看器:生成新回复需连回运行本地 AI 网关的机器(手机等纯只读)。
构建注入 `VITE_AIOS_CLOUD=1`(见 `apps/aios/netlify.toml`),前端据此切云端文案 + 登录引导。

- 站点 = CLI 手动部署(site id `5bfa64b2-7108-479d-b9e2-45f9c4d9f791`,team `jpan28`),
  **非 Git 集成**,`git push` 不会自动更新。
- 重新部署:`cd apps/aios && VITE_AIOS_CLOUD=1 npx vite build` 然后
  `NETLIFY_SITE_ID=5bfa64b2-7108-479d-b9e2-45f9c4d9f791 npx netlify deploy --prod --dir apps/aios/build --filter aios-os`
  (netlify CLI 在 monorepo 里会弹交互选包,必须带 `--filter aios-os` + `< /dev/null`)。
- 若想改成像其它六个 app 那样 push 自动构建:Netlify 控制台把该站点连到 GitHub 仓库、
  base 设 `apps/aios`,`netlify.toml` 会接管构建。

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
