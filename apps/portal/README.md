# PORTAL.OS（Life OS 统一入口）

> **阶段：** I-P1 · **状态：** 🟡 已部署，持续打磨
> **生产 URL：** https://portal.kenos.space
> **Netlify 默认域：** https://portal-ken.netlify.app
> **路线图：** [`docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md) §I-P1

Life OS 应用切换器：复用 `@life-os/theme` shell / `settings-block` 卡片与各端真实品牌 icon，接入 `@life-os/sync` 身份与跨域 SSO。

## 当前能力

| 能力                                    | 状态   |
| --------------------------------------- | ------ |
| 四 App 入口（2×2 网格 + 左边框品牌色）  | ✅     |
| `app-shell` + `PORTAL.OS` 顶栏品牌      | ✅     |
| 顶栏用户邮箱 + ⌘K 搜索按钮              | ✅     |
| Portal 内登录 / 注册（Supabase Auth）   | ✅     |
| 最近打开应用（localStorage）            | ✅     |
| SSO 状态 chip + CommandPalette          | ✅     |
| PWA manifest                            | ✅     |
| `LIFE_OS_SITE_META.portal`              | ✅     |
| `setupCrossDomainSSO`                   | ✅     |
| `createCoreIdentityHandler('portal')`   | ✅     |
| Netlify 生产部署                        | ✅     |

## 开发

```bash
cd "/Users/kenpan/「Projects」/life-os"
npm install
cd apps/portal && npm run dev
```

需与四站相同的 Supabase env（`PUBLIC_SUPABASE_*` 或 `VITE_SUPABASE_*`）。

## 上线 checklist

见 [`docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md) I-P1：GoDaddy `portal` CNAME → `portal-ken.netlify.app` → Supabase 加 `portal.kenos.space/**` redirect → 扩 `core_user_app_settings.app_id` 含 `portal`。

**Netlify：** `portal-ken` · Site ID `a5df5c3e-0e42-4f82-aca8-8d6802da357f` · https://portal-ken.netlify.app
