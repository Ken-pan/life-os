# @life-os/sync

Life OS 共享运行时：云同步、Auth 存储键、**I-P0 身份**（`coreIdentity`）、**跨子域 SSO**（`setupCrossDomainSSO`）。

- **Planner / Fitness / Finance：** 完整双向同步路径
- **Music：** 仅用 auth/visibility/debounce 原语；Dexie 同步在 app 内
- **Portal（WIP）：** auth + SSO + core identity，无业务 sync

## 安装

```json
{ "dependencies": { "@life-os/sync": "*" } }
```

Monorepo 根目录 `npm install` 链接 workspace。

## 导出

| API                                           | 用途                                                       |
| --------------------------------------------- | ---------------------------------------------------------- |
| `LIFE_OS_AUTH_STORAGE_KEY`                    | 四站统一 localStorage 键 `life_os_auth`                    |
| `LIFE_OS_APP_IDS`                             | `finance` \| `fitness` \| `planner` \| `music` \| `portal` |
| `createLifeOsSupabaseClient`                  | 五端统一 client 工厂：env + auth 选项 + SSO + 可选 schema  |
| `LIFE_OS_SUPABASE_URL` / `…_PUBLISHABLE_KEY`  | 生产项目 URL / key 唯一定义处（换 key 只改本包）           |
| `createLifeOsAuth`                            | auth 生命周期工厂：getSession 引导 + authSync/coreIdentity 接线 + sign in/up/out |
| `resolveSupabaseEnv`                          | 读 `PUBLIC_SUPABASE_*` 或 `VITE_SUPABASE_*`                |
| `createSupabaseAuthOptions`                   | persistSession + autoRefreshToken + storageKey             |
| `setupCrossDomainSSO`                         | 跨 `*.kenos.space` 子域 Cookie SSO（见 `src/sso.js`）      |
| `createCoreIdentityHandler`                   | 登录时写 `core_profiles` / `last_opened_at`                |
| `ensureCoreProfile` / `touchAppLastOpened`    | 身份底层 API                                               |
| `createBidirectionalSync`                     | 双向同步（cooldown + debounce）                            |
| `createAuthSyncHandler`                       | Supabase auth 事件 → sync                                  |
| `readSyncMeta` / `writeSyncMeta`              | 按 appId 读写 sync meta                                    |
| `bindVisibilitySync`                          | 页面可见时触发 sync                                        |
| `createSyncNotify` / `formatSyncErrorMessage` | 错误通知                                                   |

Presentation 契约（`SyncErrorPresentation` 等）在 `@life-os/contracts`；实现留本包。

## SSO 行为

`setupCrossDomainSSO` 在 `*.kenos.space` 下将 access/refresh token 写入父域 Cookie `lifeos_shared_session`；新子域加载时若 localStorage 无 session 则从 Cookie 恢复。

- **生产：** `.kenos.space` 四站 + Portal（上线后）可共享登录态
- **本地：** `localhost` 不设置 cookie domain，各端口独立 session
- **验收：** Finance 登录 → 打开 Planner，确认同一 `auth.uid()`（roadmap I-P0）

## 文档

- 路线图（I-P0 / I-P1 / I-P1.5）：[`../../docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md)
- Supabase 运维：[`../../docs/SUPABASE.md`](../../docs/SUPABASE.md)
- 身份验收脚本：`../../scripts/verify-life-os-identity-p0.sh`

同目录：`@life-os/theme`（`packages/theme`）。
