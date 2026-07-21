# Kenos Phone AI · 12 核心能力打分

- 时间: 2026-07-21T22:12:15.318Z
- 设备: iPhone 17 Pro (8097F071-CAB6-5AF0-8258-BCD985E9D79E)
- 通道: `http://kens-m5-max-macbook-pro.tail04e0e6.ts.net:5219/__localai` (MagicDNS /__localai)
- 模型: llm-fast
- 预检 models: {"ok":true,"status":200,"count":15}
- 手机 IP 流量(同期日志): models=0 chat=0
- **总分: 9.92/10 · 等级 A** (pass 12 / partial 0 / fail 0)

| ID | 能力 | 判定 | 分 | 延迟 | 备注 |
|----|------|------|----|------|------|
| C01 | 身份介绍与能力边界 | pass | 10 | 1640ms | 身份与本地助手定位清晰 |
| C02 | 多轮会话记忆 | pass | 10 | 314ms | 准确召回代号与日期 |
| C03 | 硬约束 / 严格格式 | pass | 10 | 472ms | 严格 JSON 无前后缀 |
| C04 | 中文写作成稿 | pass | 10 | 968ms | 成稿约 99 字 |
| C05 | 代码生成（可运行片段） | pass | 10 | 522ms | 带语言标注代码块 |
| C06 | 工具调用 · calculate | pass | 10 | 1098ms | tool args=17*19+3 |
| C07 | 流式输出（SSE） | pass | 10 | 8ms | chunks=39 chars=69 |
| C08 | Tiny 辅助标题（llm-tiny） | pass | 10 | 280ms | title=催稿邮件写作建议 |
| C09 | 时效问题诚实降级 | pass | 10 | 2957ms | 正确拒绝编造实时行情 |
| C10 | 结构化 Markdown 列表 | pass | 10 | 1172ms | listItems=3 |
| C11 | 规划且先别写代码 | pass | 9 | 6770ms | 规划到位且无代码 |
| C12 | 话题中断后再恢复 | pass | 10 | 935ms | 跑题后回到邮件标题任务 |
