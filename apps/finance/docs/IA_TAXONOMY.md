# Finance OS 元数据词表（Taxonomy）

源码：`src/lib/taxonomy.ts`

六组**正交**元数据，供导航过滤、审查标签、报表与推荐复用。一级导航域（首页/资金/规划/审查/设置）与这些 facet **不混用**。

| 分组       | 键                 | 用途示例               |
| ---------- | ------------------ | ---------------------- |
| 账户类型   | `accountType`      | 账户列表过滤、总览分组 |
| 资金流类型 | `cashflowType`     | 记录/审查流水线分类    |
| 时间视角   | `timePerspective`  | 今日 vs 预测 vs 情景   |
| 目标类型   | `goalType`         | 目标卡片、预留计算     |
| 数据可信度 | `dataConfidence`   | 审查队列、Today 提醒   |
| 决策模板   | `decisionTemplate` | 决策工作室模板筛选     |

## 扩展规则

1. 新值先加入 `TAXONOMY` 常量，再接入 UI；避免 ad-hoc 字符串。
2. 标签/filter URL 若对外分享，遵循 pathname 路由，不用 hash facet。
3. 与 Supabase 枚举列变更时，同步 migration + 本文件。
