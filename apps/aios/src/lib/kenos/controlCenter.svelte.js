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
import {
  SHADOW_SOURCE,
  attachSourceIdentity,
  legacyLifeEventsActivityShadowFixture,
  legacyLocalFocusShadowFixture,
  legacyLocalWorkShadowFixture,
  legacyPortalPendingShadowFixture,
} from './shadowLegacyFixtures.js'
import { buildCapabilityRegistry } from './capabilityRegistry.core.js'
import {
  isProdFocusReadEnabled,
  isProdShadowCompareEnabled,
  isProdWorkReadEnabled,
  prodReadFlagSnapshot,
} from './prodReadFlags.core.js'
import { recordShadowObservation } from './readObservability.core.js'
import { isWorkFoundationEnabled } from './workCommand.core.js'
import { FOCUS } from './focusStore.svelte.js'

const DEMO_STATE_KEY = 'kenos_phase2_control_demo_v1'

const DEMO_SUMMARY = Object.freeze({
  ok: true,
  asOf: new Date().toISOString(),
  planner: { todayOpen: 4, overdue: 1 },
  finance: { monthSurplus: 1840, monthIncome: 7800, monthExpense: 5960 },
  fitness: { workedOutToday: false, lastSessionDate: '昨天', lastDayId: 'B' },
  music: {
    trackTitle: 'A Walk',
    trackArtist: 'Tycho',
    playedAt: '2026-07-19T01:10:00Z',
  },
  home: { storageZoneCount: 12, reportedAt: '2026-07-19T01:00:00Z' },
})

const DEMO_INBOX = Object.freeze([
  {
    id: 'inbox-demo-1',
    status: 'open',
    ownerDomain: 'plan',
    source: 'plan',
    title: '整理 Phase 2 用户反馈',
    safeSummary: '捕获内容等待确认归属后，才会写入计划任务。',
    detail: '等待选择归属空间',
    receivedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    actionHints: ['open_owner'],
    deepLink: 'https://planner.kenos.space/inbox',
  },
  {
    id: 'inbox-demo-2',
    status: 'open',
    ownerDomain: 'training',
    source: 'training',
    title: '确认今晚训练调整',
    safeSummary: '训练根据恢复状态建议将腿部训练调整为上肢。',
    detail: '建议归入计划，并引用训练记录',
    receivedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
    actionHints: ['open_owner'],
    deepLink: 'https://fitness.kenos.space/',
  },
])

const DEMO_APPROVALS = Object.freeze([
  {
    id: 'approval-demo-1',
    status: 'pending',
    risk: 'R2',
    requestedOperation: 'plan.reschedule_task',
    safeImpactSummary: '把「完成 Phase 2 review」移动到明天下午',
    impact: ['修改 1 个 Plan 任务', '保留原时间作为 Activity 记录', '可撤销'],
    requestingDomain: 'assistant',
    whyApprovalNeeded: 'R2 跨域可逆写入需要明确预览',
    requestedAt: '2026-07-19T17:08:00.000Z',
    expiresAt: '2026-07-19T19:08:00.000Z',
    executorAvailable: false,
    entityReferences: [
      {
        id: 'task-demo-1',
        type: 'plan.task',
        ownerDomain: 'plan',
        ownerId: 'task-demo-1',
      },
    ],
  },
  {
    id: 'approval-demo-expired',
    status: 'expired',
    risk: 'R3',
    requestedOperation: 'money.export_report',
    safeImpactSummary: '一项已过期的敏感报表导出请求',
    requestingDomain: 'money',
    decisionReason: '已过期，不可当作已批准。',
    requestedAt: '2026-07-19T14:00:00.000Z',
    expiresAt: '2026-07-19T15:00:00.000Z',
    executorAvailable: false,
  },
  {
    id: 'approval-demo-superseded',
    status: 'superseded',
    risk: 'R2',
    requestedOperation: 'plan.reschedule_task',
    safeImpactSummary: `已被新 payload-bound Approval 取代的长摘要：${'这段内容用于验证窄屏换行、聚焦顺序与脱敏边界。'.repeat(9)}`,
    requestingDomain: 'assistant',
    decisionReason: '已被新的 payload-bound Approval 取代。',
    requestedAt: '2026-07-19T13:00:00.000Z',
    expiresAt: '2026-07-19T18:00:00.000Z',
    executorAvailable: false,
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

function approvalDemoSourceState() {
  try {
    const requested = new URLSearchParams(location.search).get(
      'kenosApprovalState',
    )
    return ['ready', 'empty', 'partial', 'stale', 'offline'].includes(requested)
      ? requested
      : 'ready'
  } catch {
    return 'ready'
  }
}

function loadDemoControlState() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DEMO_STATE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return null
    if (
      !Array.isArray(parsed.inbox) ||
      !Array.isArray(parsed.approvals) ||
      !Array.isArray(parsed.activities)
    ) {
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
  focusContexts: [],
  workProjects: [],
  workCards: [],
  demo: false,
  refreshedAt: 0,
  sources: {
    today: sourceState('loading', { source: 'public.portal_today_summary' }),
    inbox: sourceState('loading', {
      source: 'public.life_events + public.planner_tasks',
    }),
    approvals: sourceState('loading', {
      source: 'public.kenos_list_action_approvals',
    }),
    activity: sourceState('loading', { source: 'public.life_events' }),
    focus: sourceState('loading', {
      source: 'public.kenos_list_focus_contexts',
    }),
    focusDeferred: sourceState('unsupported', {
      source: 'public.kenos_deferred_items',
    }),
    focusSuggestions: sourceState('unsupported', {
      source: 'public.kenos_proactive_suggestions',
    }),
    work: sourceState('loading', { source: 'public.kenos_list_work_projects' }),
  },
  capabilities: buildCapabilityRegistry(),
  shadowMismatches: [],
  shadowSummary: { blocking: 0, warning: 0, expected: 0 },
  flags: prodReadFlagSnapshot(),
})

let inflight = null

function applySourceResult(key, value) {
  if (!value?.state) return
  const failed = ['offline', 'unavailable', 'permission_denied'].includes(
    value.state.status,
  )
  if (key === 'today') {
    if (value.summary) CONTROL.summary = value.summary
    else if (!CONTROL.summary) CONTROL.summary = null
  } else if (key === 'focus') {
    if (value.contexts?.length || !failed || !CONTROL.focusContexts?.length) {
      CONTROL.focusContexts = value.contexts ?? []
    }
    const side = value.sideCapabilities || {}
    const mapSide = (cap, source) => {
      if (cap === 'unavailable') return sourceState('unsupported', { source })
      if (cap === 'error')
        return sourceState('unavailable', {
          source,
          message: '读取失败',
          retryable: true,
        })
      if (cap === 'empty')
        return sourceState('empty', { source, availableCount: 0 })
      if (cap === 'ready')
        return sourceState('ready', { source, availableCount: 1 })
      return sourceState('unsupported', { source })
    }
    CONTROL.sources.focusDeferred = mapSide(
      side.deferred,
      'public.kenos_deferred_items',
    )
    CONTROL.sources.focusSuggestions = mapSide(
      side.suggestions,
      'public.kenos_proactive_suggestions',
    )
  } else if (key === 'work') {
    if (
      value.projects?.length ||
      value.cards?.length ||
      !failed ||
      !CONTROL.workProjects?.length
    ) {
      CONTROL.workProjects = value.projects ?? []
      CONTROL.workCards = value.cards ?? []
    }
  } else {
    const field = key === 'activity' ? 'activities' : key
    if (value.items?.length || !failed || !CONTROL[field]?.length)
      CONTROL[field] = value.items ?? []
  }
  const retained =
    (key === 'today' && CONTROL.summary) ||
    (key === 'focus' && CONTROL.focusContexts?.length) ||
    (key === 'work' &&
      (CONTROL.workProjects?.length || CONTROL.workCards?.length)) ||
    (key !== 'today' &&
      key !== 'focus' &&
      key !== 'work' &&
      CONTROL[key === 'activity' ? 'activities' : key]?.length)
  CONTROL.sources[key] =
    failed && retained
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
  if (
    !force &&
    CONTROL.refreshedAt &&
    Date.now() - CONTROL.refreshedAt < 30_000
  )
    return
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
            sourceState('loading', {
              source: state.source,
              lastUpdated: state.lastUpdated,
            }),
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
        const approvalState = approvalDemoSourceState()
        CONTROL.approvals =
          approvalState === 'empty'
            ? []
            : clone(savedDemo?.approvals ?? DEMO_APPROVALS)
        CONTROL.activities = clone(savedDemo?.activities ?? DEMO_ACTIVITY)
      }
      const demoApprovalState = demo ? approvalDemoSourceState() : null
      CONTROL.sources = demo
        ? {
            today: sourceState('ready', {
              source: 'local opt-in rehearsal',
              availableCount: 1,
            }),
            inbox: sourceState('ready', {
              source: 'local opt-in rehearsal',
              availableCount: CONTROL.inbox.length,
            }),
            approvals: sourceState(demoApprovalState, {
              source: 'local opt-in rehearsal',
              availableCount: CONTROL.approvals.length,
              malformedCount: demoApprovalState === 'partial' ? 1 : 0,
              stale: demoApprovalState === 'stale',
              retryable: ['partial', 'stale', 'offline'].includes(
                demoApprovalState,
              ),
              message:
                demoApprovalState === 'partial'
                  ? '一项 QA fixture 被安全降级；其余 projection 仍只读。'
                  : demoApprovalState === 'stale'
                    ? 'QA projection 已超过 freshness 阈值；未执行任何动作。'
                    : demoApprovalState === 'offline'
                      ? '设备离线；仅显示上一次 QA projection。'
                      : '',
            }),
            activity: sourceState('ready', {
              source: 'local opt-in rehearsal',
              availableCount: CONTROL.activities.length,
            }),
            focus: sourceState('unsupported', {
              source: 'local opt-in rehearsal',
            }),
            work: sourceState('unsupported', {
              source: 'local opt-in rehearsal',
            }),
          }
        : CONTROL.sources
      let healthReadiness = null
      try {
        const { loadHealthReadiness } =
          await import('./healthReadiness.host.js')
        healthReadiness = loadHealthReadiness({ now: Date.now() })
      } catch {
        healthReadiness = null
      }
      const todayModel = buildTodayReadModel(CONTROL.summary, {
        healthReadiness,
      })
      const toShadowShape = (item) => ({
        id: item.id,
        ownerDomain: item.ownerDomain,
        status: item.status,
        freshness: item.stale ? 'stale' : 'fresh',
        deepLink: item.deepLink,
        classification: item.classification,
      })
      const shadowEnabled = !demo && isProdShadowCompareEnabled(import.meta.env)
      CONTROL.shadowMismatches = !shadowEnabled
        ? []
        : [
            ...compareProjectionSets({
              comparisonType: 'portal_today_vs_assistant_today',
              ownerDomain: 'system',
              oldSourceId: SHADOW_SOURCE.legacyPortalToday,
              newSourceId: SHADOW_SOURCE.kenosTodayProjection,
              oldItems: attachSourceIdentity(
                buildLegacyTodayShadowProjection(CONTROL.summary),
                SHADOW_SOURCE.legacyPortalToday,
              ),
              newItems: attachSourceIdentity(
                buildTodayShadowProjection(todayModel),
                SHADOW_SOURCE.kenosTodayProjection,
              ),
            }),
            ...compareProjectionSets({
              comparisonType: 'portal_pending_vs_assistant_inbox',
              ownerDomain: 'system',
              oldSourceId: SHADOW_SOURCE.legacyPortalPending,
              newSourceId: SHADOW_SOURCE.kenosInboxProjection,
              oldItems: legacyPortalPendingShadowFixture(),
              newItems: attachSourceIdentity(
                CONTROL.inbox.map(toShadowShape),
                SHADOW_SOURCE.kenosInboxProjection,
              ),
            }),
            ...compareProjectionSets({
              comparisonType: 'life_events_vs_assistant_activity',
              ownerDomain: 'system',
              oldSourceId: SHADOW_SOURCE.legacyLifeEventsActivity,
              newSourceId: SHADOW_SOURCE.kenosActivityProjection,
              oldItems: legacyLifeEventsActivityShadowFixture(),
              newItems: attachSourceIdentity(
                CONTROL.activities.map(toShadowShape),
                SHADOW_SOURCE.kenosActivityProjection,
              ),
            }),
            ...compareApprovalProjectionSets({
              canonicalItems: sources?.approvals?.shadowItems ?? [],
              legacyItems: sources?.inbox?.shadowItems ?? [],
              legacySourceSupported: false,
            }),
            ...(isProdFocusReadEnabled(import.meta.env)
              ? compareProjectionSets({
                  comparisonType: 'local_focus_vs_kenos_focus',
                  ownerDomain: 'focus',
                  oldSourceId: SHADOW_SOURCE.legacyLocalFocus,
                  newSourceId: SHADOW_SOURCE.kenosFocusContexts,
                  oldItems: legacyLocalFocusShadowFixture(),
                  newItems: attachSourceIdentity(
                    (sources?.focus?.shadowItems ?? []).map(toShadowShape),
                    SHADOW_SOURCE.kenosFocusContexts,
                  ),
                })
              : []),
            ...(isProdWorkReadEnabled(import.meta.env)
              ? compareProjectionSets({
                  comparisonType: 'local_work_vs_kenos_work',
                  ownerDomain: 'work',
                  oldSourceId: SHADOW_SOURCE.legacyLocalWork,
                  newSourceId: SHADOW_SOURCE.kenosWorkProjects,
                  oldItems: legacyLocalWorkShadowFixture(),
                  newItems: attachSourceIdentity(
                    (sources?.work?.shadowItems ?? []).map(toShadowShape),
                    SHADOW_SOURCE.kenosWorkProjects,
                  ),
                })
              : []),
          ]
      CONTROL.shadowSummary = summarizeShadowMismatches(
        CONTROL.shadowMismatches,
      )
      if (shadowEnabled) {
        recordShadowObservation({
          domain: 'control',
          blocking: CONTROL.shadowSummary.blocking,
          warning: CONTROL.shadowSummary.warning,
        })
      }
      CONTROL.flags = prodReadFlagSnapshot(import.meta.env)
      CONTROL.capabilities = buildCapabilityRegistry({
        flags: CONTROL.flags,
        sources: CONTROL.sources,
        workFoundationEnabled: isWorkFoundationEnabled(import.meta.env),
        focusLocalActive: Boolean(
          FOCUS?.focus?.status && FOCUS.focus.status !== 'idle',
        ),
      })
      CONTROL.refreshedAt = Date.now()
      void import('./nativeLocalAlerts.js')
        .then((m) =>
          m.syncApprovalAlerts(CONTROL.approvals || [], { demo: CONTROL.demo }),
        )
        .catch(() => {})
    } catch (error) {
      CONTROL.error =
        error instanceof Error ? error.message : 'Today 暂时无法刷新'
      CONTROL.summary = null
    } finally {
      CONTROL.loading = false
      inflight = null
    }
  })()

  return inflight
}

export function resolveDemoApproval(id, decision) {
  // Production Approval decision / Executor remain unavailable — demo path only.
  if (!CONTROL.demo || !['approved', 'rejected'].includes(decision))
    return false
  const approval = CONTROL.approvals.find((item) => item.id === id)
  if (!approval || approval.status !== 'pending') return false
  approval.status = decision
  CONTROL.activities = [
    {
      id: `activity-${id}-${decision}`,
      status: decision === 'approved' ? 'succeeded' : 'cancelled',
      actionType: approval.requestedOperation ?? approval.actionType,
      summary: approval.safeImpactSummary ?? approval.summary,
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
  if (!activity || activity.status !== 'failed' || !activity.retryable)
    return false
  activity.status = 'queued'
  activity.result = '本地 UI 演练已加入重试队列；未连接生产 worker'
  persistDemoControlState()
  return true
}
