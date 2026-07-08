# Integration 主线（I-_ / H-_）

Hub 状态见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)。

---

## I-P0: 统一身份 {#i-p0}

**目标：** 四生产站 + Portal 共用 `auth.uid()` 与 `core_profiles`，跨 `.kenos.space` SSO。

| 子项                                       | 状态    | 证据                                      |
| ------------------------------------------ | ------- | ----------------------------------------- |
| `core_profiles` + `core_user_app_settings` | ✅ 远程 | migration `20260707230000`                |
| 四站 Auth hooks                            | ✅      | `createCoreIdentityHandler`               |
| 客户端 profile 兜底                        | ✅      | `packages/sync/src/coreIdentity.js`       |
| 跨子域 SSO Cookie                          | 🟡      | `setupCrossDomainSSO`；待生产 E2E         |
| `schema.sql`（`core_*`）                   | ❌      | 仅 migration，未 merge canonical          |
| 验收脚本                                   | ✅      | `./scripts/verify-life-os-identity-p0.sh` |

**SSO 下一步：**

- 生产 `.kenos.space` 跨站免登人工验收
- `localhost` / preview 跨站仍有限（Cookie 仅 `*.kenos.space`）
- 可选：环境变量动态 cookie domain；或 `@supabase/ssr` Server Client

---

## I-P1: Portal 统一入口 {#i-p1}

**URL：** https://portal.kenos.space（Netlify `portal-ken`，`a5df5c3e-0e42-4f82-aca8-8d6802da357f`）

| 子项                        | 状态 | 证据                                               |
| --------------------------- | ---- | -------------------------------------------------- |
| SvelteKit app               | 🟡   | Launcher + `PortalLauncherCard` + `CommandPalette` |
| SSO / coreIdentity          | ✅   | `createCoreIdentityHandler('portal')`              |
| Netlify + DNS               | ✅   | 生产五站；HTTP 200 已验证                          |
| Turbo / GHA build           | ✅   | `npm run build` 含 `portal`                        |
| Auth redirect               | 🟡   | `*.netlify.app/**` 已覆盖；自定义域建议显式加入    |
| Portal 内登录               | ✅   | `PortalUnauth` + `createLifeOsAuth`                |
| DB `app_id` / `default_app` | 🟡   | check 仍限四生产 app                               |

**收尾：** Supabase `portal.kenos.space/**` → 扩 DB constraint 含 `portal` → Launcher/PWA QA

---

## I-P1.5: 跨应用事件中心 {#i-p15}

**示例链路：** Finance 账单到期 → Planner 任务

| 子项                   | 状态 | 证据                                                           |
| ---------------------- | ---- | -------------------------------------------------------------- |
| Zod 事件契约           | ✅   | `packages/contracts/src/events.ts`                             |
| DB + Outbox 触发器     | ✅   | `finance_bill_event_trigger` on `finance_expected_occurrences` |
| 远程 migration         | ✅   | `20260708000000`                                               |
| Planner 消费端         | ✅   | `lifeEventsInbox.js`                                           |
| 集成测试               | ✅   | `./scripts/test-outbox-trigger.sh --smoke`                     |
| `schema.sql`（I-P1.5） | ✅   | DDL 已在 `apps/finance/supabase/schema.sql`                    |

**架构（Outbox + consume）：**

1. `@life-os/contracts/events` — `finance.bill_due` + envelope
2. `finance_expected_occurrences` insert → `life_events` 同事务
3. Planner poll → `parseLifeEvent` → 幂等任务 → `processed`

RFC：[`../LIFEOS_EVENTS_RFC.md`](../LIFEOS_EVENTS_RFC.md)

---

## I-P2: 跨应用智能

⏸️ 搁置。待更多 `life_events` 消费端后再评估。

---

## H-P0: Home OS（实验）{#h-p0}

与 Portal 独立。早期 archive 曾 portal/home 二选一，现并存。

| 子项               | 状态 | 证据                                    |
| ------------------ | ---- | --------------------------------------- |
| SvelteKit app      | 🟡   | 户型预览 / 储藏区 / spatial 编辑        |
| 共享包             | ✅   | contracts + platform-web + sync + theme |
| design-tokens      | ✅   | `tokens/brands/home.json`               |
| Turbo build        | ✅   | `npm run build:home`                    |
| 部署 / Integration | ❌   | 未链 Netlify；未接 `coreIdentity`       |

**提交纪律：** 勿将 `apps/home/**` 与 platform/catalog 变更混 PR（除非明确做 Home）。
