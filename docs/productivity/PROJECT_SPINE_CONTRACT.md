# Project Spine 契约(Phase B · B1/B2/B3/B4)

> 日期:2026-07-22。迁移:`apps/finance/supabase/migrations/20260722191728_kenos_project_spine.sql`(已应用生产)。

## B1 · Canonical ownership(硬边界)

```text
planner_projects   = canonical Project(Planner 拥有;Spine 永不写此表)
planner_tasks      = canonical Task(只经 kenos_*_plan_task_action 命令 RPC 写)
Knowledge Vault    = canonical Note content(Spine 只存标题引用,不复制正文)
life_events / kenos_plan_activity = canonical 事件源
```

明确不存在:core_projects、新 Work 真源、Kenos 自有 task 存储、笔记内容镜像。`work.*` 动作在 Registry 中 frozen+deny。

## B2 · 两个窄模型

**public.kenos_project_context**(PK user_id+project_id;RLS select own;写仅经 RPC)
`outcome text · status(active|paused|waiting|completed|archived) · next_action_task_id → planner_tasks.id · review_at date · context_type(personal|work|home|development) · created_at/updated_at`

**public.kenos_project_links**(uuid id;活链唯一约束 (user,project,object_type,object_id) where deleted_at is null;软删)
`source_domain(plan|knowledge|activity|external) · object_type(plan.task|knowledge.note|activity.event|url) · object_id · relation(reference|waiting_on|next|output) · display_metadata jsonb · deleted_at`

支持的关联(第一阶段):Project→Planner Task(object_id=task uuid)、Project→Vault Note(**object_id=笔记标题**,深链 `knowledge.kenos.space/library?title=`,经 @life-os/platform-web/wikilinks 的 `knowledgeNoteUrl`;正文永不入库)、Project→Activity(经 entity_ref 归因,无需显式链)、Project→External URL。

## 写路径:kenos_project_spine_action(单一原子 RPC)

与 plan.* 命令同款信封(schemaVersion/actor/deviceId/idempotencyKey/correlationId/requestedRisk=R1)。动作:`project.set_context`(部分字段 upsert)· `project.set_next_action`(校验 task 存在)· `project.link_object`(活链去重/复活)· `project.unlink_object`(软删)。每次调用单事务完成:幂等表 → context/links 变更 → outbox(pending) → activity。项目必须已存在于 planner_projects(`project_not_found` 拒绝)。

客户端:`apps/aios/src/lib/kenos/projectSpine.core.js`(信封构造+读模型,单测)与 `.host.js`(读集合 + RPC 执行;任务的创建/完成/归属走既有 plan 命令 RPC)。Writer flag:`VITE_KENOS_PROD_WRITES=1` + `VITE_KENOS_PROJECT_SPINE_WRITER=1`(fail-closed,read-canary 恒关)。

## B3 · Project Cockpit(apps/aios /projects,Kenos 内原生路由)

页面回答:Outcome · Next Action · Tasks(开放/完成)· Notes(标题引用→Knowledge 深链)· Waiting(waiting_on 链)· Recent Activity(activity 按 entity_ref 归因:plan.project 直接、plan.task 经 task.projectId)· Decisions(approval.* activity)· Review date。
第一版操作:编辑 outcome/status/type/review · 设/换下一步 · 关联既有任务(设为下一步)· 创建任务(→Planner RPC)· 关联 Vault 笔记标题 · 关联 URL · 完成下一步(→plan.complete_task RPC)· 开始 Focus(深链 /focus)· 查看 Activity。
明确不做:gantt、stakeholder CRM、resource planning、任意关系图谱、AI 自主拆解、多人权限、fixture connector。
注册点:spacesList.core.js(HOSTED_SPACES + TODAY_SPACE_SHORTCUTS)、domainIdentity.core.js(projects,紫色 target)、+layout.svelte 标题表、iconRegistry(lucide target)。

## B4 · Today 集成(最小)

组件 `ProjectSpineToday.svelte`(挂在 Today level-2 区,自包含读),只呈现四组:Active project next actions(可一键完成→Planner RPC)· Waiting projects · Projects needing review(review_at≤今日)· Recently progressed(48h 内有 activity)。空态不渲染,不复制 Domain 数据,所有跳转回 canonical owner(/projects、Planner、Knowledge)。

## 读模型纯函数

`buildCockpitModel({projects, contexts, links, tasks, activity})` 与 `buildProjectTodayModel(cockpit)`(projectSpine.core.js,7 条单测):软删/墓碑过滤、活动归因、脊柱项目优先排序、完成的下一步自动退出 Today 清单。
