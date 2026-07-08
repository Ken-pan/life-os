# HOME.OS（Life OS 统一入口）

> **阶段：** I-P1 · **状态：** 🟡 本地 WIP，未上线
> **计划 URL：** https://home.kenos.space
> **路线图：** [`docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md) §I-P1

Life OS 应用切换器：复用 `@life-os/theme` shell / `settings-block` 卡片与各端真实品牌 icon，接入 `@life-os/sync` 身份与跨域 SSO。

## 当前能力

| 能力                                   | 状态                       |
| -------------------------------------- | -------------------------- |
| 四 App 入口（真实 icon + 品牌色左边框） | ✅                         |
| `app-shell` + `HOME.OS` 顶栏品牌       | ✅                         |
| `LIFE_OS_SITE_META.portal`             | ✅                         |
| `setupCrossDomainSSO`                  | ✅                         |
| `createCoreIdentityHandler('portal')`  | ✅                         |
| `@life-os/platform-web` CommandPalette | ✅                         |
| Portal 内独立登录 UI                   | ❌（未登录时跳转 Finance） |
| Netlify 生产部署                       | ❌                         |

## 开发

```bash
cd "/Users/kenpan/「Projects」/life-os"
npm install
cd apps/portal && npm run dev
```

需与四站相同的 Supabase env（`PUBLIC_SUPABASE_*` 或 `VITE_SUPABASE_*`）。

## 上线 checklist

见 [`docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md) I-P1 表格：commit → `homeos-ken` Netlify 站 → DNS → auth redirect（[`SUPABASE.md`](../../docs/SUPABASE.md)）→ 扩 `core_user_app_settings.app_id` 含 `portal`。
