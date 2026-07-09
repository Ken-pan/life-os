# PORTAL.OS（Life OS 统一入口）

> **阶段：** I-P1 · **状态：** ✅ 生产 · UI 走查 P-1–P-12 已关闭（G-P8/G-P9）
> **生产 URL：** https://portal.kenos.space
> **Netlify 默认域：** https://portal-ken.netlify.app
> **Dev 端口：** 5195（勿与 Fitness E2E 5173 冲突）
> **路线图：** [`docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md) · 细节：[`docs/roadmap/apps/portal.md`](../../docs/roadmap/apps/portal.md) · UI 走查：[`docs/qa/portal-screenshot-audit.md`](../../docs/qa/portal-screenshot-audit.md)

Life OS 应用切换器：复用 `@life-os/theme` shell / `settings-block` 卡片与各端真实品牌 icon，接入 `@life-os/sync` 身份与跨域 SSO。

## 当前能力

| 能力                                                                | 状态         |
| ------------------------------------------------------------------- | ------------ |
| 五站入口（四生产 + Home 实验）+ 左边框品牌色                        | ✅           |
| **今日摘要五卡**（Planner / Finance / Fitness / Music / Home 实验） | ✅ G-P4b-M/H |
| `app-shell` + `PORTAL.OS` 顶栏品牌                                  | ✅           |
| 顶栏用户邮箱 + ⌘K 搜索 + pending 角标                               | ✅ G-P2      |
| compact 顶栏 **More sheet**（主题 / 账号 / 退出）                   | ✅ P-5b      |
| Launcher / 摘要实验卡 **虚线** 左边框统一                           | ✅ P-12      |
| **⌘K 跨站深链**（14 路由）+ 最近搜索                                | ✅ G-P6      |
| Portal 内登录 / 注册（Supabase Auth）                               | ✅           |
| 继续 / 默认应用 / 跳过自动跳转（`core_*`）                          | ✅ G-P1/G-P3 |
| SSO 状态 chip + Lucide icon registry                                | ✅           |
| PWA manifest + 六站安装引导                                         | ✅ G-P5      |
| `createCoreIdentityHandler('portal')`                               | ✅           |
| Netlify 生产部署                                                    | ✅           |
| `svelte-check`                                                      | ✅ 0 errors  |
| `test:cp` 深链单测                                                  | ✅           |
| `qa:screenshot` UI 截图走查（12 张 + manifest）                     | ✅           |
| `qa:smoke` 登录+五卡+深链+⌘K                                        | ✅ G-P9      |

## 开发

```bash
cd "/Users/kenpan/「Projects」/life-os"
npm install
cd apps/portal && npm run dev   # 或 preview --port 5195
```

需与四站相同的 Supabase env（`PUBLIC_SUPABASE_*` 或 `VITE_SUPABASE_*`）。

## QA

```bash
cd apps/portal
npm run test:cp
npm run check
npm run preview -- --host 127.0.0.1 --port 5195
PORTAL_QA_URL=http://127.0.0.1:5195 npm run qa:screenshot
PORTAL_QA_URL=http://127.0.0.1:5195 npm run qa:smoke
```

截图输出 → `docs/ui-qa-screenshots/portal/main/latest/`（含 `manifest.json` — G-P8 inbox href 校验）

## 上线 checklist

见 [`docs/roadmap/INTEGRATION.md`](../../docs/roadmap/INTEGRATION.md#i-p1) I-P1 收尾项。

**Netlify：** `portal-ken` · Site ID `a5df5c3e-0e42-4f82-aca8-8d6802da357f` · https://portal-ken.netlify.app
