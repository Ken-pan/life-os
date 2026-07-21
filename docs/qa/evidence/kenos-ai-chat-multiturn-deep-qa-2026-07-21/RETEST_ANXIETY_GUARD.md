# 焦虑首轮守卫（MT10）· 有效性 A/B

**日期：** 2026-07-21  
**改动：** `replyGuard.core.js` 新增 `anxiety-today-only`  
- 检测：用户焦虑/阻塞 + 回复含多周路线图表格/标题  
- 处置：LLM 修订（最多 2 轮）+ `scrubLongPlanDump` 切掉长计划尾  
- Prompt 同步：首轮不要附带 12 周/三个月表格  
- 单测：7/7 通过  

**对照：**

| 臂 | 日志 | T1 长度 | 多周表 | 守卫 | 违规残留 |
|----|------|---------|--------|------|----------|
| GUARD=0 | [`ab-anxiety-OFF.json`](./logs/ab-anxiety-OFF.json) | 1132 | **有** | 否 | `anxiety-today-only` |
| GUARD=1 | [`ab-anxiety-ON.json`](./logs/ab-anxiety-ON.json) | ~620 | **无** | 是 | 无 |

**结论：真实有效。** 关守卫仍甩 12 周表；开守卫只留「今天 2 小时一件事」+「需要的话再给分周计划」。

对比摘要：[`logs/ab-anxiety-comparison.json`](./logs/ab-anxiety-comparison.json)
