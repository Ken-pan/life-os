# Open Questions for Owner

| Question | Why it matters | Options | Recommended default | Blocks release? |
| --- | --- | --- | --- | --- |
| 产品 purely personal local-first，还是 cloud-backed multi-device？ | 决定架构与隐私叙事 | A local-only B Supabase personal C 未来 multi-user | **B**（与现状一致） | Yes（文档） |
| 当前余额的 source of truth？ | 预测全依赖它 | A 手动 B 交易重建 C 混合 | **A 手动**（代码现状） | Yes |
| 所有信用卡是否每月全额还清？ | 影响 daily 日历与 surplus | A 全部 paid-in-full B 混合 C 默认 revolving | **B 按卡配置** | Medium |
| Safe-to-spend 应急底线用哪个？ | STS 公式 | A assumptions.emergencyReserveTarget B goal reserve current C 两者取 max | **PTO  workshop** | Yes |
| 券商/退休账户是否 ever 计入 STS？ | 流动性定义 | A 永不 B 用户 toggle C 紧急时 sell | **A 永不**（现状） | Medium |
| 哪些 goals .reserve 实际扣现金？ | 专款逻辑 | A 仅 monthlyAllocation B current balance C both | **需定稿** | Yes |
| 移动 vs 桌面优先哪些 flow？ | 导航与布局 | A 今日+试算 mobile B 全 parity | **A** | No |
| 交易历史是否保持全量云端？ | 隐私/成本 | A 全 Supabase B 本地 IndexedDB C 混合 | **A**（现状） | Medium |
| 最重要 scenario 类型？ |  roadmap | purchase / rent / home / travel / career break | **purchase + rent/expense-change 已有** | No |
| UI 财务精度（小数/四舍五入）？ | 信任 | A 整数美元 B 两位小数 C 区间代替点估计 | **A 整数 + 区间带** | No |
| 历史交易导入谁负责？ | 运维 vs 产品 | A 用户 CSV B 开发者 SQL C 第三方 | **短期 B + runbook** | Yes for new users |
| 未配置 Supabase 时是否允许离线 demo？ | 开发/演示 | A  block B localStorage demo | **A**（现状） | No |
| 目标 monthlyAllocation 是否应减少 simulated investable surplus？ | 引擎正确性 | A 是 B 仅 UI STS C 否 | **A 若专款真实** | Medium |
| Legacy /legacy 工具是否仍维护？ | 范围 | A 归档 B 并行 | **A 归档**（README 说法） | No |
