# Finance OS

一块面向决策的个人财务驾驶舱（Supabase-backed）。随时回答三个问题：

1. 我现在实际拥有多少钱，哪些钱可以动？
2. 保持当前生活方式，未来 1/5/10/20 年会积累多少资产？
3. 现在多花一笔钱，未来会少多少钱、延迟哪个目标多久？

> 由原「租房 vs 买房」分析工具重构而来。旧工具已归档至 `public/legacy/`，构建后仍可通过 `/legacy` 访问。

## 技术栈

- SvelteKit 2 + Svelte 5 + Vite
- Supabase（Auth + Postgres + RLS）
- LayerChart v2 图表（预测轨迹）；SVG 图表（花销趋势、配置趋势）
- Vitest 单元测试
- `@life-os/finance-enrichment-contract`：purchase-enrichment display classification 与 web-state read model 的规则对齐

## 开发

```bash
npm install
npm run dev        # 本地开发
npm run test       # 运行引擎单测
npm run check      # Svelte/TS 类型检查
npm run build      # 生产构建 -> build/
```

## 架构

```
src/
  types.ts              数据模型 (Account/CashFlowItem/ScenarioEvent/Goal/AssumptionSet)
  lib/repo.ts           Supabase 数据访问层（关系表 <-> 前端模型映射）
  engine/
    finance.ts          金融数学原语 + 机会成本闭式公式
    monthly.ts          月度推演引擎 (按月模拟，10 步顺序)
    metrics.ts          派生指标 (Safe-to-spend / 应急跑道 / Spend Impact 三层)
    transactions.ts     交易分析纯函数（接收 Txn[]，不依赖静态文件）
    *.test.ts           引擎单测 (复利差额表作回归基准)
  store/                FinanceStore + TransactionsStore（定点落库）
  hooks/useProjection   记忆化的基准 + 三档收益率区间带投影
  components/           Today/Overview/History/Forecast/Plan/Accounts/Settings
                        + 常驻 Spend Impact 抽屉 + History 手动记账
```

### 核心引擎

`engine/monthly.ts` 按月模拟，每月顺序：读余额 → 加税后收入 → 扣支出 → 扣债务还款
→ 应用事件 → 检查应急金下限 → 分配剩余现金 (维持 buffer → 补应急金 → 还滚动债 → 投资)
→ 各账户应用收益 → 保存快照。信用卡区分「全额还清」与「滚动余额」，避免重复扣款。

## 数据与隐私

- 财务主数据使用 Supabase Postgres 关系表存储（`accounts` / `cash_flows` / `scenario_events` / `goals` / `user_settings` / `transactions`）。
- 当前账户余额以**手动刷新快照**为准；历史交易用于分析和计划偏差检查，不会在后台静默重建余额。
- 所有表都启用了 RLS，仅允许 `auth.uid() = user_id` 访问自己的数据。
- `finance_data` 旧 jsonb 表保留为历史备份，不再作为主读写路径。

Monorepo 文档入口见 [`../../docs/README.md`](../../docs/README.md)。Finance IA 见 [`docs/INFORMATION_ARCHITECTURE.md`](docs/INFORMATION_ARCHITECTURE.md)。

## Life OS 集成

| 主线                | 状态 | 说明                                                                                                                       |
| ------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| **I-P0** 身份       | ✅   | `createCoreIdentityHandler('finance')` + `setupCrossDomainSSO`                                                             |
| **I-P1.5** 事件     | 🟡   | Outbox 远程 ✅（`test-outbox-trigger.sh --smoke`）；Planner 消费端仍缺                                                     |
| **C-P1+** contracts | 🟡   | purchase 展示用 `@life-os/finance-enrichment-contract`（Finance-owned）；跨应用业务事件 Zod 在 `@life-os/contracts/events` |

Supabase 迁移 canonical 源：**本目录** `supabase/`（全 Life OS 共享 public 表亦在此维护）。运维见 [`../../docs/ops/supabase.md`](../../docs/ops/supabase.md)。

```bash
# I-P0 验收
../../scripts/verify-life-os-identity-p0.sh

# I-P1.5 Outbox（结构 + smoke）
../../scripts/test-outbox-trigger.sh --smoke
```
