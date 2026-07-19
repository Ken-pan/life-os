import { browser } from '$app/environment'
import { shouldSeedControlDemo } from '$lib/demoMode.js'
import { readAllControlSources } from './readSources.js'
import {
  buildLegacyTodayShadowProjection,
  buildTodayReadModel,
  buildTodayShadowProjection,
} from './controlCenter.core.js'
import {
  compareApprovalProjectionSets,
  compareProjectionSets,
  sourceState,
  summarizeShadowMismatches,
} from './readProjections.core.js'

const DEMO_STATE_KEY = 'kenos_phase2_control_demo_v1'

const DEMO_SUMMARY = Object.freeze({
  ok: true,
  asOf: new Date().toISOString(),
  planner: { todayOpen: 4, overdue: 1 },
  finance: { monthSurplus: 1840, monthIncome: 7800, monthExpense: 5960 },
  fitness: { workedOutToday: false, lastSessionDate: '昨天', lastDayId: 'B' },
  music: { trackTitle: 'A Walk', trackArtist: 'Tycho', playedAt: '2026-07-19T01:10:00Z' },
  home: { storageZoneCount: 12, reportedAt: '2026-07-19T01:00:00Z' },
})

const DEMO_INBOX = Object.freeze([
  {
    id: 'inbox-demo-1',
    status: 'open',
    source: 'Capture',
    title: '整理 Phase 2 用户反馈',
    detail: '等待选择归属 Space',
    receivedAt: '今天 09:42',
  },
  {
    id: 'inbox-demo-2',
    status: 'open',
    source: 'Assistant',
    title: '确认下周训练安排',
    detail: '建议归入 Plan，并引用 Training',
    receivedAt: '昨天 20:18',
  },
])

const DEMO_APPROVALS = Object.freeze([
  {
    id: 'approval-demo-1',
    status: 'pending',
    risk: 'R2',
    actionType: 'plan.reschedule_task',
    summary: '把「完成 Phase 2 review」移动到明天下午',
    impact: ['修改 1 个 Plan 任务', '保留原时间作为 Activity 记录', '可撤销'],
    source: 'Assistant suggestion',
    requestedAt: '今天 10:08',
  },
])

const DEMO_ACTIVITY = Object.freeze([
  {
    id: 'activity-demo-1',
    status: 'succeeded',
    actionType: 'plan.create_task',
    summary: '创建任务「审核 Kenos Phase 1」',
    result: 'Plan 已接受；Outbox 已记录',
    source: 'Assistant',
    occurredAt: new Date(Date.now() - 44 * 60_000).toISOString(),
    occurredLabel: '今天 10:02',
    reversible: true,
  },
  {
    id: 'activity-demo-2',
    status: 'failed',
    actionType: 'connector.refresh',
    summary: '刷新 Work connector',
    result: '连接不可用；没有写入任何数据',
    source: 'System',
    occurredAt: new Date(Date.now() - 66 * 60_000).toISOString(),
    occurredLabel: '今天 09:40',
    retryable: true,
  },
])

function clone(items) {
  return items.map((item) => ({
    ...item,
    impact: item.impact ? [...item.impact] : undefined,
  }))
}

function loadDemoControlState() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DEMO_STATE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray(parsed.inbox) || !Array.isArray(parsed.approvals) || !Array.isArray(parsed.activities)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function persistDemoControlState() {
  if (!CONTROL.demo) return
  try {
    sessionStorage.setItem(
      DEMO_STATE_KEY,
      JSON.stringify({
        inbox: CONTROL.inbox,
        approvals: CONTROL.approvals,
        activities: CONTROL.activities,
      }),
    )
  } catch {
    /* Demo persistence is optional and never leaves this browser session. */
  }
}

export const CONTROL = $state({
  loading: true,
  error: '',
  summary: null,
  inbox: [],
  approvals: [],
  activities: [],
  demo: false,
  refreshedAt: 0,
  sources: {
    today: sourceState('loading', { source: 'public.portal_today_summary' }),
    inbox: sourceState('loading', { source: 'public.life_events + public.planner_tasks' }),
    approvals: sourceState('loading', { source: 'public.kenos_list_action_approvals' }),
    activity: sourceState('loading', { source: 'public.life_events' }),
  },
  shadowMismatches: [],
  shadowSummary: { blocking: 0, warning: 0, expected: 0 },
})

let inflight = null

function applySourceResult(key, value) {
  if (!value?.state) return
  const failed = ['offline', 'unavailable', 'permission_denied'].includes(value.state.status)
  if (key === 'today') {
    if (value.summary) CONTROL.summary = value.summary
    else if (!CONTROL.summary) CONTROL.summary = null
  } else {
    const field = key === 'activity' ? 'activities' : key
    if (value.items?.length || !failed || !CONTROL[field]?.length) CONTROL[field] = value.items ?? []
  }
  CONTROL.sources[key] = failed && (
    (key === 'today' && CONTROL.summary) ||
    (key !== 'today' && CONTROL[key === 'activity' ? 'activities' : key]?.length)
  )
    ? {
        ...value.state,
        status: 'stale',
        stale: true,
        message: `${value.state.message} 正在显示上一次只读 projection。`,
      }
    : value.state
}

export async function refreshControlCenter({ force = false } = {}) {
  if (!browser) return
  if (!force && CONTROL.refreshedAt && Date.now() - CONTROL.refreshedAt < 30_000) return
  if (inflight) return inflight

  inflight = (async () => {
    CONTROL.loading = true
    CONTROL.error = ''
    try {
      const demo = shouldSeedControlDemo()
      if (!demo) {
        CONTROL.sources = Object.fromEntries(
          Object.entries(CONTROL.sources).map(([key, state]) => [
            key,
            sourceState('loading', { source: state.source, lastUpdated: state.lastUpdated }),
          ]),
        )
      }
      const sources = demo
        ? null
        : await readAllControlSources({}, { onSettled: applySourceResult })
      const savedDemo = demo ? loadDemoControlState() : null
      if (demo) CONTROL.summary = DEMO_SUMMARY
      CONTROL.demo = demo
      if (demo) {
        CONTROL.inbox = clone(savedDemo?.inbox ?? DEMO_INBOX)
        CONTROL.approvals = clone(savedDemo?.approvals ?? DEMO_APPROVALS)
        CONTROL.activities = clone(savedDemo?.activities ?? DEMO_ACTIVITY)
      }
      CONTROL.sources = demo
        ? {
            today: sourceState('ready', { source: 'local opt-in rehearsal', availableCount: 1 }),
            inbox: sourceState('ready', { source: 'local opt-in rehearsal', availableCount: CONTROL.inbox.length }),
            approvals: sourceState('ready', { source: 'local opt-in rehearsal', availableCount: CONTROL.approvals.length }),
            activity: sourceState('ready', { source: 'local opt-in rehearsal', availableCount: CONTROL.activities.length }),
          }
        : CONTROL.sources
      const todayModel = buildTodayReadModel(CONTROL.summary)
      const toShadowShape = (item) => ({
        id: item.id,
        ownerDomain: item.ownerDomain,
        status: item.status,
        freshness: item.stale ? 'stale' : 'fresh',
        deepLink: item.deepLink,
        classification: item.classification,
      })
      CONTROL.shadowMismatches = demo
        ? []
        : [
            ...compareProjectionSets({
              comparisonType: 'portal_today_vs_assistant_today',
              ownerDomain: 'system',
              oldItems: buildLegacyTodayShadowProjection(CONTROL.summary),
              newItems: buildTodayShadowProjection(todayModel),
            }),
            ...compareProjectionSets({
              comparisonType: 'portal_pending_vs_assistant_inbox',
              ownerDomain: 'system',
              oldItems: sources.inbox.shadowItems ?? [],
              newItems: CONTROL.inbox.map(toShadowShape),
            }),
            ...compareProjectionSets({
              comparisonType: 'life_events_vs_assistant_activity',
              ownerDomain: 'system',
              oldItems: sources.activity.shadowItems ?? [],
              newItems: CONTROL.activities.map(toShadowShape),
            }),
            ...compareApprovalProjectionSets({
              canonicalItems: sources.approvals.shadowItems ?? [],
              legacyItems: sources.inbox.shadowItems ?? [],
              legacySourceSupported: false,
            }),
          ]
      CONTROL.shadowSummary = summarizeShadowMismatches(CONTROL.shadowMismatches)
      CONTROL.refreshedAt = Date.now()
    } catch (error) {
      CONTROL.error = error instanceof Error ? error.message : 'Today 暂时无法刷新'
      CONTROL.summary = null
    } finally {
      CONTROL.loading = false
      inflight = null
    }
  })()

  return inflight
}

export function resolveDemoApproval(id, decision) {
  if (!CONTROL.demo || !['approved', 'rejected'].includes(decision)) return false
  const approval = CONTROL.approvals.find((item) => item.id === id)
  if (!approval || approval.status !== 'pending') return false
  approval.status = decision
  CONTROL.activities = [
    {
      id: `activity-${id}-${decision}`,
      status: decision === 'approved' ? 'succeeded' : 'cancelled',
      actionType: approval.actionType,
      summary: approval.summary,
      result:
        decision === 'approved'
          ? '本地 UI 演练已确认；未调用 Executor'
          : '本地 UI 演练已拒绝；没有数据变更',
      source: 'User preview',
      occurredAt: new Date().toISOString(),
      occurredLabel: '刚刚',
      reversible: false,
    },
    ...CONTROL.activities,
  ]
  persistDemoControlState()
  return true
}

export function retryDemoActivity(id) {
  if (!CONTROL.demo) return false
  const activity = CONTROL.activities.find((item) => item.id === id)
  if (!activity || activity.status !== 'failed' || !activity.retryable) return false
  activity.status = 'queued'
  activity.result = '本地 UI 演练已加入重试队列；未连接生产 worker'
  persistDemoControlState()
  return true
}
