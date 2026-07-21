# 格式 / 澄清预算守卫 · 有效性 A/B

**日期：** 2026-07-21  
**改动：**
- `replyGuard.core.js`：`strict-format` / `clarify-budget` 检测 + scrub + rewrite prompt（既有）
- `chat.svelte.js`：有图时不再整表关工具，改 `filterToolsForVision` 白名单
- 单测：`node --test apps/aios/src/lib/replyGuard.core.test.js` → **10/10 通过**

**网关：** `127.0.0.1:18888` 可达；`ONLY=MT03,MT04,MT05` × `GUARD=0|1`，模型 `llm-fast`

**原始日志：**
- [`logs/ab-format-clarify-OFF.json`](./logs/ab-format-clarify-OFF.json)
- [`logs/ab-format-clarify-ON.json`](./logs/ab-format-clarify-ON.json)

## 对照

| 场景 | 守卫目标 | GUARD=0 | GUARD=1 | 结论 |
|------|----------|---------|---------|------|
| **MT03** 写作修订 | `strict-format`（≤50 字） | **partial**：T2 去空白 **55** 字，硬探针 shortened 失败 | **pass**：检测到 `strict-format` 并重写，T2 **36** 字 | **真实有效** |
| **MT04** 模糊澄清 | `clarify-budget` | **pass**：模型本身 3 问 + 假设方案 | **pass**：仍触发 `clarify-budget`（编号项把假设步骤也算进去），正文实质未伤 | **本轮基线已好**；检测有假阳性风险 |
| **MT05** 改需求 | （非本切片主目标；「只要清单 / 只答一词」） | **fail**：末轮答「中文」 | **fail**：同 | **未改善**（语言切换确认，非字数/澄清守卫） |

### MT03 关键摘录

| 臂 | T2 正文 | 去空白字数 | guarded |
|----|---------|------------|---------|
| OFF | AI.OS 是本地私人助手，推理全在设备内…轻松搞定日常需求。 | 55 | 否 |
| ON | AI.OS 本地推理保隐私，可选联网查资讯。轻松搞定日常需求，安全又灵活。 | 36 | 是（`strict-format`） |

## 结论

1. **`strict-format` 真实有效**：关守卫超字数；开守卫截断/重写到约束内，MT03 partial → pass。  
2. **`clarify-budget` 本轮未证明「从坏变好」**：OFF 已过；ON 因 `countClarifyingQuestions` 把假设方案内的编号步骤计入，存在假阳性，但 scrub 未破坏已有好回复。  
3. **MT05 仍 fail**，属需求切换/末轮一词确认，不在本切片主张范围内。  
4. **Vision 工具白名单**仅有单测覆盖，本 A/B 未跑带图对话。

## 剩余风险

- 澄清问题计数对「假设方案」内嵌编号列表过敏（MT04 假阳性）。  
- `finalize` 截断字数可能切掉关键事实词（本地/联网）；本轮 MT03 ON 仍保留。  
- Vision 白名单是否过严/过松需带图实机再验。
