# Finance OS — P1A Live Verification Gate

## Executive result

**`P1A CONDITIONAL PASS`**

Live Supabase migration、RLS/RPC 核心隔离、Security Advisor 与合成数据浏览器 QA 已实跑。以下项未满足正式 **`P1A PASS`** 门槛：Review Queue / Merchant Rules / Recurring 的完整交互矩阵、部分截图证据、Owner 真实 CSV 本地预览、以及线上 DB 与代码在 `scenarios` 表维度上的漂移（已通过 `repo.ts` 防御性修复 unblock QA，但 P2A migration 仍未在线上应用）。

---

## Test environment

| Item | Value |
| --- | --- |
| App | Finance OS local dev (`http://localhost:5174/`) |
| Stack | Vite + React 19 + Supabase JS |
| Live DB | Supabase project（project ref 已 mask，见 `.env.local`） |
| QA 账户 | Disposable test user（身份与凭证仅由环境变量提供；历史密码视为已泄露并须轮换） |
| Primary owner | UUID 前缀 `c2831538…`（仅用于 source-of-truth 计数对比，未在截图中暴露商户/账户后缀） |
| Migration 版本 | `20260531023517 migration_p1a_reality_loop` + `20260531023715 p1a_fix_finalize_import_ambiguity` |
| Gate 时间 | 2026-05-30（本地） |

---

## Evidence index

| Artifact | Path | Status |
| --- | --- | --- |
| Import — choose file | `screenshots/p1a-live/qa_p1a_import_choose_file.png` | ✅ |
| Import — mapping | `screenshots/p1a-live/qa_p1a_import_mapping.png` | ✅ |
| Import — preview | `screenshots/p1a-live/qa_p1a_import_preview.png` | ✅ |
| Import — review buckets | `screenshots/p1a-live/qa_p1a_import_review_buckets.png` | ✅ |
| Import — confirmation | `screenshots/p1a-live/qa_p1a_import_confirmation.png` | ✅ |
| Import — complete | `screenshots/p1a-live/qa_p1a_import_complete.png` | ✅ |
| Review queue desktop | `screenshots/p1a-live/qa_p1a_review_queue_desktop.png` | ✅ |
| Review queue mobile 390px | `screenshots/p1a-live/qa_p1a_review_queue_mobile_390.png` | ✅ |
| Baseline 3/6/12 | `screenshots/p1a-live/qa_p1a_baseline_3_6_12.png` | ✅ |
| Baseline confidence | `screenshots/p1a-live/qa_p1a_baseline_confidence.png` | ✅ |
| Plan calibration diff | `screenshots/p1a-live/qa_p1a_plan_calibration_diff.png` | ✅ |
| Plan calibration forecast | `screenshots/p1a-live/qa_p1a_plan_calibration_forecast_preview.png` | ✅ |
| Review batch preview | — | ❌ BLOCKED（UI 未实现 batch preview/confirm） |
| Merchant rule preview | — | ❌ BLOCKED（无独立 Merchant Rules 管理 UI） |
| Recurring candidate | — | ❌ BLOCKED（仅检测，无 confirm/edit 持久化 UI） |
| Security Advisor | — | ❌ BLOCKED（MCP 已跑；Dashboard 截图需 Owner 手动） |

---

## Live migration results

| Migration | Applied | Notes |
| --- | --- | --- |
| `migration_p1a_reality_loop` | ✅ | 新表 + RPC + RLS + 索引 + 5258 行历史 `transactions` backfill |
| `p1a_fix_finalize_import_ambiguity` | ✅ | 修复 RPC `import_id` 列歧义（`RETURNS TABLE` vs `transactions.import_id`） |

---

## Live schema verification

| Object | Exists | RLS enabled | Relevant indexes | Grants reviewed | Notes |
| --- | --- | --- | --- | --- | --- |
| `transaction_imports` | ✅ | ✅ | `transaction_imports_user_idx`, `transaction_imports_user_file_hash_finalized_uidx` | authenticated CRUD via RLS | own-row policies ×4 |
| `transactions` (P1A cols) | ✅ | ✅ | `transactions_user_*` 系列 | authenticated CRUD via RLS | 继承既有表 RLS |
| `merchant_rules` | ✅ | ✅ | `merchant_rules_user_idx` | authenticated CRUD via RLS | |
| `review_items` | ✅ | ✅ | `review_items_user_idx`, `review_items_import_idx` | authenticated CRUD via RLS | |
| `recurring_items` | ✅ | ✅ | `recurring_items_user_idx` | authenticated CRUD via RLS | |
| `finalize_transaction_import_v1(jsonb)` | ✅ | n/a | n/a | `authenticated` EXECUTE only | `SECURITY INVOKER`, `search_path=''` |

所有新表均含 `user_id` 列。`anon` / `public` 对 RPC 无 EXECUTE 权限。

---

## RLS A/B isolation matrix

测试方法：`SET LOCAL ROLE authenticated` + `request.jwt.claim.sub` 模拟 User A（owner 前缀 `c2831538…`）与 User B（`aaaaaaaa…`）。

| Table | Own insert | Own read | Own update | Own delete | Cross-user read blocked | Cross-user write blocked | Wrong-owner insert blocked | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `transaction_imports` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `transactions` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `merchant_rules` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `review_items` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `recurring_items` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **PASS** |

证据：User A 对 User B 的 `transaction_imports` cross-read = 0；cross-update 后 B 行 status 仍为原值。

---

## RPC authorization and atomicity

| RPC case | Expected | Actual | Pass / fail | Evidence |
| --- | --- | --- | --- | --- |
| Authenticated own-data import | 持久化 accepted / review / rules | accepted=2, excluded=1, review=1 | ✅ PASS | User B synthetic payload |
| Same-file reimport | blocked | `same-file reimport blocked` | ✅ PASS | 第二次同 hash 调用 |
| Cross-user finalize | blocked | RLS + `auth.uid()` 绑定 | ✅ PASS | invoker 模式，无法写 B 数据 |
| Payload fake `user_id` | ignored | 行 ownership = `auth.uid()` | ✅ PASS | 函数内无 client `user_id` 信任 |
| `anon` execute | denied | `permission denied for function` | ✅ PASS | `has_function_privilege` + live SQL |
| `public` execute | denied | revoke 生效 | ✅ PASS | migration grants |
| Invalid payload (`null`) | no import row | imports count 不变 | ✅ PASS | live SQL DO block |
| Malformed nested row mid-flight | no partial finalize | **未完整实测** | ⚠️ PARTIAL | RPC 先 insert draft import 再写子表；pre-validation 失败安全，mid-flight DB 错误可能留 draft |
| `import_id` ambiguity | success | hotfix 后 RPC 返回正常 | ✅ PASS | `p1a_fix_finalize_import_ambiguity` |

RPC 属性：`SECURITY INVOKER`（非 DEFINER），使用 `auth.uid()`，固定 `search_path = ''`。

---

## Security Advisor results

| Advisor finding | Severity | Object | Release blocking | Resolution or backlog |
| --- | --- | --- | --- | --- |
| Leaked Password Protection Disabled | WARN | Auth | **No**（P0.5 已知项，非 P1A 新增） | Owner 在 Supabase Dashboard 启用 HaveIBeenPwned 检查 |
| P1A 新表 RLS 缺失 | — | — | **No** | 未发现 high-severity RLS 缺失 |

- Timestamp：2026-05-30 gate 期间 MCP `get_advisors(type=security)`
- Advisor completed：✅
- High / medium P1A-specific：**0**
- Dashboard 截图：`BLOCKED` — Owner 步骤：Supabase → Advisors → Security → 截图保存为 `screenshots/p1a-live/qa_p1a_security_advisor.png`

---

## Import Wizard browser QA

环境：Test User B + 合成 `small-valid.csv`（Playwright headless，session 注入 `finance_os_auth`）。

| Step | Verified | Result |
| --- | --- | --- |
| 1 Choose file | `.csv` 接受、行数/大小展示 | ✅ |
| 2 Map columns | 必填 Date/Amount/Description、可编辑映射 | ✅ |
| 3 Preview normalization | accepted / excluded / review 计数 | ✅ |
| 4 Review buckets | 高价值分桶、可继续 | ✅ |
| 5 Confirm | 显式确认、余额不变警告 | ✅ |
| 6 Complete | persisted 计数 + baseline CTA | ✅ |

未在本轮实跑（合成 fixture 已有单元测试）：unsupported extension、oversized、25k+ row reject — 见 `realityLoop.test.ts`。

---

## Source-of-truth protection

Primary owner（`c2831538…`）在 User B synthetic import 前后：

| Concept | Before import | After import | Expected unchanged? | Result |
| --- | ---: | ---: | --- | --- |
| Account balances (sum) | 210,109.15 | 210,109.15 | Yes | ✅ |
| Accounts count | 16 | 16 | Yes | ✅ |
| Cash flows count | 8 | 8 | Yes | ✅ |
| Goals count | 1 | 1 | Yes | ✅ |
| Owner transactions | 5,258 | 5,258 | Yes | ✅ |
| User B transactions | 2 | 2+（QA 导入后略增） | N/A（隔离用户） | ✅ |

导入不修改 `accounts.balance`、不静默改 STS / 计划 / 目标 — **PASS**（owner 侧零漂移）。

---

## Normalization verification

基于 `realityLoop.test.ts` + 合成 fixture 引擎跑数（非浏览器）：

| Fixture row type | Flow type | Budget impact | Spending included | Cash-flow history included | Result |
| --- | --- | ---: | --- | --- | --- |
| Expense | expense | negative | Yes | Yes | ✅ |
| Income | income | positive | No | Yes | ✅ |
| Refund | refund_or_reversal | positive | Reduces spending | Yes | ✅ |
| Internal transfer | internal_transfer | 0 | No | Optional | ✅ |
| Credit-card payment | credit_card_payment | 0 | No | No | ✅ |
| Ignored / zero / unknown | various | 0 | No until reviewed | varies | ✅ |

原始 source 字段保留在 `transactions` P1A 列；余额不从历史重建 — **PASS**。

---

## Duplicate and idempotency verification

| Duplicate case | Detection | User action available | Analytics protected | Audit metadata retained | Result |
| --- | --- | --- | --- | --- | --- |
| Same-file reimport | RPC hash 检查 | UI warning 部分 | RPC 层 block | prior import 可查 | ✅ RPC / ⚠️ UI |
| Same-account duplicate candidate | 引擎 flag | resolve/ignore 最小 | 不自动删除 | ✅ | ⚠️ PARTIAL |
| Cross-account mirror | 引擎 flag | exclude 最小 | 不自动删除 | ✅ | ⚠️ PARTIAL |

---

## Review Queue verification

| Requirement | Desktop | Mobile 390px | Result |
| --- | --- | --- | --- |
| Filters（7 种） | ✅ 可见 | ✅ 可读 | PASS |
| Confirm suggestion | ✅ | ✅ | PASS |
| Edit category / flow type | ❌ 未实现 | ❌ | **FAIL** |
| Exclude / mark duplicate | ❌ 未实现 | ❌ | **FAIL** |
| Apply rule to similar | ❌ 未实现 | ❌ | **FAIL** |
| Batch preview + confirm | ❌ 未实现 | ❌ | **FAIL** |
| Undo batch | ❌ 未实现 | ❌ | **FAIL** |

---

## Merchant Rules verification

| Test | Result |
| --- | --- |
| 本地 suggestion | ✅ 导入规范化阶段 |
| 确认前不持久化 | ✅ |
| 独立管理 UI / preview / enable-disable | ❌ **未实现** |

---

## Recurring Candidates verification

| Test | Result |
| --- | --- |
| 保守检测 (`detectRecurringCandidates`) | ✅ 单元测试 |
| 不自动确认 | ✅ |
| Confirm / edit / persist UI | ❌ **未实现** |

---

## Spending Baseline verification

| Test | Result |
| --- | --- |
| 3 / 6 / 12 月窗口 | ✅ 截图 |
| 仅 finalized + `include_in_spending_analytics` | ✅ 引擎逻辑 |
| Confidence states | ✅ 截图（B 用户数据量少 → 合理降级） |
| 高影响未解决 → 非 Ready | ✅ 逻辑 + 测试 |

---

## Plan Calibration verification

| Test | Result |
| --- | --- |
| 3/6/12 月选择 | ✅ |
| 分类 diff + 可编辑 proposed | ✅ |
| 取消不写 | ✅（未点 Apply） |
| Forecast preview | ✅ 截图 |
| 显式 Apply 才写 `cash_flows` | ✅ 设计 + repo 测试 |

---

## CSV-injection and untrusted-text verification

| Malicious input class | UI rendering safe | CSV export neutralized | Error safe | Result |
| --- | --- | --- | --- | --- |
| `= + - @` tab CR | ✅ React text | ✅ `neutralizeSpreadsheetCell` | ✅ | PASS |

见 `src/lib/repo.security.test.ts`。

---

## Scale verification

| Operation | Dataset size | Time | UI responsive | Notes |
| --- | ---: | ---: | --- | --- |
| Parse + normalize | 5,258 rows | ~30 ms | ✅ preview 可用 | 本地 Node benchmark |
| Review bucket generation | 5,258 rows | incl. above | ✅ | ~370 review rows |
| Finalize RPC | 5,258 rows | **未在本轮实跑 live** | — | 建议 Owner 本地 preview-only 测 finalization |

---

## Owner CSV local-only preview

**`BLOCKED`** — 按 gate 规则，Owner 真实 CSV 不得 commit / 上传 / 入报告。

Owner 步骤：

1. 本地 dev server 登录 owner 账户
2. Review → Import → 选择真实 CSV
3. 仅走到 Preview / Review buckets，**不要**点 Import accepted
4. 记录 masked 聚合：行数、账户数、日期范围、review 桶数量

---

## Test, type-check, lint, and build results

| Check | Result |
| --- | --- |
| `npm run test` | **101/101 PASS** |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS（3 既有 warning） |
| `npm run build` | PASS（chunk >500 kB warning） |
| New dependencies | 无产品依赖新增；gate 期间临时 `playwright`（`--no-save`） |
| Migration | 线上已应用（见上） |

---

## Remaining risks

1. **RPC 非全包裹事务**：validation 前失败安全；draft import 插入后若子步骤异常可能留 draft 行。
2. **Live DB 漂移**：代码引用 `scenarios` 表与 `scenario_events.scenario_id`，线上尚未应用 P2A migration — 新鲜登录曾失败；已加 `repo.ts` 防御性 fallback，应单独排期应用 P2A 或回滚代码引用。
3. **Review Queue MVP 缺口**：Gate prompt 要求的 edit/batch/undo 未实现，审核成本在大量 review 行时仍偏高。
4. **Test User B 手工创建**：Auth identity 需完整（`auth.identities` + 空 token 字段）；已修复，应文档化 disposable user runbook。
5. **Security Advisor 截图**：仅 MCP 文本证据，缺 Dashboard PNG。

---

## Deferred intentionally

- P1B Monthly Review
- AI categorization
- Bank API integration
- P2A scenarios migration（线上）
- 5258 行 live finalize 压测

---

## PTO decision required

1. 是否接受 **`P1A CONDITIONAL PASS`** 并先合并 Review Queue / Merchant Rules / Recurring UI 缺口，再发 **`P1A PASS`**？
2. 是否将 P2A `scenarios` migration 列为 **P1A 发布阻断**（推荐：是，或保留 repo fallback 并标注 tech debt）？
3. 是否要求 Owner 补交 Security Advisor + Owner CSV masked preview 后再进 P1B？
4. 是否 commit RPC hotfix migration 到 git（`p1a_fix_finalize_import_ambiguity` 已在线上，本地 `migration_p1a_reality_loop.sql` 已同步歧义修复）？

---

## Recommended next milestone

**不推荐立即进入 P1B。** 应先关闭：

- Review Queue 完整动作矩阵 + batch preview
- Merchant Rules / Recurring 持久化 UI
- Security Advisor Dashboard 截图
- Owner CSV masked preview
- （推荐）线上 P2A migration 或明确 tech-debt 接受书

全部 blocking gate 通过后，再开启：**P1B — Monthly Review and Actionable Reality Feedback**。
