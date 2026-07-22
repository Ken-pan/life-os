# Project Spine Dogfood 日志(Phase B · B5)

> 规程:三个真实项目,连续 ≥7 个自然日;记录 created/selected · tasks linked · notes linked · next action changes · focus sessions · activity events · waiting states · completed outcomes · user friction。
> 数据面全部走生产 RPC(kenos_project_spine_action / kenos_*_plan_task_action),零 fixture。

## 选定的三个真实项目(planner_projects 既有行)

| 项目 | project_id | context_type | Outcome |
|---|---|---|---|
| Ingram · Search Experience | 244436ae-49f1-4d96-ad11-a44b84e31299 | work | 把当前迭代推进到可评审:下一步清晰、阻塞与等待显式化 |
| Life OS · AIOS | project-lifeos-aios | development | Kenos 生产力脊柱上线:执行地基收口 + Project Spine 纵向切片可日用 |
| Photo Organizor | 1cd0c24a-5a5f-4998-8eba-3f26337ff232 | personal | 照片库整理出一套可持续的月度流程,7 月新照片全部归档 |

## Day 1 — 2026-07-22

- **project selected/context created ×3**(project.set_context,review_at=2026-07-29)
- **tasks created & linked ×3**(plan.create_task → plan.update_task_project → project.set_next_action → project.link_object relation=next):
  - AIOS:「Spine 验收:Project Cockpit 首版走查 + 记录 dogfood 第 1 天摩擦」(due 07-23,P1)
  - Ingram:「Ingram Search:整理当前迭代 Next/阻塞/等待清单」(due 07-23,P1)
  - Photo:「Photo Organizor:跑一轮 7 月照片整理批处理并归档」(due 07-26,P1)
- **activity events**:13 条 spine/plan 动作全部入 kenos_plan_activity + outbox → worker 投递 life_events(25/25 published,含 Ken 当日 Planner 真实 create/complete 流量)
- **notes linked**:0(待 Ken 在 Cockpit 关联 Vault 笔记标题——UI 已支持)
- **focus sessions**:0(入口已接 /focus)
- **waiting states**:0
- **completed outcomes**:0
- **friction 记录**:
  1. `/projects` 首版路由标题落了 +layout 标题表,曾显示「页面未找到」(当日修复)。
  2. 非脊柱项目较多(50 个),列表需要折叠「其他 Planner 项目」才不淹没——已做,但「接入脊柱」动作值不值得批量化待观察。
  3. 生产站 www.kenos.space 的 writer flags 未开(Owner gate):Day 1 的 Cockpit 操作面在 localhost(.env.local 开 canary flag)完成,数据面是生产 Supabase。

## Day 2..7 —(待记录)

> 模板:日期 · 使用了哪些操作 · next action 变化 · focus · waiting · 摩擦。
> 7 天未满前,B5 exit gate 记 **未通过**;不以模拟数据充数。

## Exit gate 追踪

- REAL PROJECTS ≥3:✅(3,全为既有真实项目)
- TASK/PROJECT/NOTE OWNER 单一:✅(见 PROJECT_SPINE_CONTRACT.md)
- PROJECT CAN LINK TASK+NOTE+ACTIVITY:✅(task/URL 已有实链;note 链 UI 就绪)
- NEXT ACTION 端到端:✅(设定→Today 呈现→完成走 Planner RPC→activity/事件可见)
- DOGFOOD DAYS ≥7:❌(1/7,时间门,不可加速)
- FIXTURE DATA = 0:✅
