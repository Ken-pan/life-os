import { isCloudAuthorized } from '$lib/cloud.svelte.js'
import { lifeOsReadClient } from '$lib/lifeos.js'
import { readCanonicalApprovalSource } from './approvalReadSource.core.js'
import {
  isProdPlanActivityReadEnabled,
  mergeActivityRecords,
  readPlanActivitySource,
} from './planActivityReadSource.core.js'
import { readCanonicalFocusSource } from './focusReadSource.core.js'
import { readCanonicalWorkSource } from './workReadSource.core.js'
import {
  classifyReadError,
  freshnessState,
  projectActivityEvents,
  projectInboxEvents,
  projectPlannerInboxTasks,
  mergeInboxProjections,
  sourceState,
  settleReadSources,
} from './readProjections.core.js'
import { newCorrelationId, recordReadObservation } from './readObservability.core.js'

const SOURCE = Object.freeze({
  today: 'public.portal_today_summary',
  inbox: 'public.life_events:pending',
  approvals: 'public.kenos_list_action_approvals',
  activity: 'public.life_events',
  focus: 'public.kenos_list_focus_contexts',
  work: 'public.kenos_list_work_projects',
})

function online() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function unavailableWithoutAuth(source) {
  return sourceState(online() ? 'permission_denied' : 'offline', {
    source,
    message: online()
      ? '登录 Life OS 后才能读取这个用户范围内的来源。'
      : '设备当前离线；登录态恢复后可安全重试。',
    retryable: !online(),
  })
}

function result(itemsKey, items, state, extra = {}) {
  return { [itemsKey]: items, state, ...extra }
}

export async function readTodaySource({ client = lifeOsReadClient(), now = Date.now() } = {}) {
  const correlationId = newCorrelationId('today')
  const started = Date.now()
  const observe = (state) => {
    recordReadObservation({
      domain: 'plan',
      source: SOURCE.today,
      status: state.status,
      latencyMs: Date.now() - started,
      correlationId,
      flagOn: true,
      sourceOfTruth: SOURCE.today,
    })
  }
  if (!isCloudAuthorized()) {
    const state = unavailableWithoutAuth(SOURCE.today)
    observe(state)
    return result('summary', null, state, { correlationId })
  }
  if (!online()) {
    const state = unavailableWithoutAuth(SOURCE.today)
    observe(state)
    return result('summary', null, state, { correlationId })
  }
  try {
    let timezone = 'America/Los_Angeles'
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone
    } catch {
      /* stable fallback */
    }
    const { data, error } = await client.rpc('portal_today_summary', { p_timezone: timezone })
    if (error) throw error
    if (!data || typeof data !== 'object' || data.ok === false) {
      const state = sourceState('empty', {
        source: SOURCE.today,
        message: '摘要来源可用，但今天没有可展示的领域摘要。',
      })
      observe(state)
      return result('summary', null, state, { correlationId })
    }
    const freshness = freshnessState(data.asOf, { now })
    const state = sourceState(freshness.stale ? 'stale' : 'ready', {
      source: SOURCE.today,
      message: freshness.stale ? '摘要可能不是最新的；各领域入口仍可打开。' : '',
      lastUpdated: freshness.lastUpdated,
      stale: freshness.stale,
      retryable: true,
      availableCount: 1,
    })
    observe(state)
    return result('summary', data, state, { correlationId })
  } catch (error) {
    const state = classifyReadError(error, { online: online(), source: SOURCE.today })
    observe(state)
    return result('summary', null, state, { correlationId })
  }
}

export async function readInboxSource({ client = lifeOsReadClient(), now = Date.now() } = {}) {
  if (!isCloudAuthorized()) return result('items', [], unavailableWithoutAuth(SOURCE.inbox))
  if (!online()) return result('items', [], unavailableWithoutAuth(SOURCE.inbox))
  try {
    const [eventsResult, tasksResult] = await Promise.all([
      client
        .from('life_events')
        .select('id,type,payload,status,created_at,updated_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200),
      client.from('planner_tasks').select('data').limit(2000),
    ])
    if (eventsResult.error) throw eventsResult.error
    const eventProjection = projectInboxEvents(eventsResult.data ?? [], { now })
    const taskProjection = tasksResult.error
      ? { items: [], malformedCount: 0 }
      : projectPlannerInboxTasks(tasksResult.data ?? [], { now })
    const projected = mergeInboxProjections(eventProjection, taskProjection)
    const status = tasksResult.error
      ? 'partial'
      : projected.items.length
        ? projected.malformedCount || projected.truncatedCount
        ? 'partial'
        : projected.items.some((item) => item.stale)
          ? 'stale'
          : 'ready'
        : 'empty'
    return result(
      'items',
      projected.items,
      sourceState(status, {
        source: SOURCE.inbox,
        message: tasksResult.error
          ? 'Plan task projection 暂不可用；life_events 仍可读取。'
          : projected.truncatedCount
            ? `只显示最近 100 项；另有 ${projected.truncatedCount} 项留在原来源。`
            : '',
        lastUpdated: projected.items[0]?.receivedAt,
        stale: status === 'stale',
        retryable: true,
        availableCount: projected.items.length,
        malformedCount: projected.malformedCount,
        duplicateCount: projected.duplicateCount,
      }),
      {
        ...projected,
        shadowItems: projected.items.map((item) => ({
          id: item.id,
          ownerDomain: item.ownerDomain,
          status: item.status,
          freshness: item.stale ? 'stale' : 'fresh',
          deepLink: item.deepLink,
          classification: item.classification,
        })),
      },
    )
  } catch (error) {
    return result('items', [], classifyReadError(error, { online: online(), source: SOURCE.inbox }))
  }
}

export async function readApprovalSource({ client = lifeOsReadClient(), now = Date.now() } = {}) {
  return readCanonicalApprovalSource({
    client,
    authorized: isCloudAuthorized(),
    online: online(),
    now,
  })
}

export async function readFocusSource({ client = lifeOsReadClient(), now = Date.now() } = {}) {
  return readCanonicalFocusSource({
    client,
    authorized: isCloudAuthorized(),
    online: online(),
    now,
  })
}

export async function readWorkSource({ client = lifeOsReadClient(), now = Date.now() } = {}) {
  return readCanonicalWorkSource({
    client,
    authorized: isCloudAuthorized(),
    online: online(),
    now,
  })
}

export async function readActivitySource({ client = lifeOsReadClient() } = {}) {
  if (!isCloudAuthorized()) return result('items', [], unavailableWithoutAuth(SOURCE.activity))
  if (!online()) return result('items', [], unavailableWithoutAuth(SOURCE.activity))
  try {
    const kenosEnabled = isProdPlanActivityReadEnabled()
    const [{ data, error }, kenosRead] = await Promise.all([
      client
        .from('life_events')
        .select('id,type,payload,status,created_at,updated_at')
        .order('created_at', { ascending: false })
        .limit(200),
      kenosEnabled
        ? readPlanActivitySource({ client, authorized: true, online: online() })
        : Promise.resolve(null),
    ])
    if (error) throw error
    const legacy = projectActivityEvents(data ?? [])
    // Canonical Plan activity merge is additive and fail-open: a Kenos read
    // error keeps the legacy feed intact (its state stays visible via counts).
    const projected = kenosRead?.items?.length
      ? (() => {
          const merged = mergeActivityRecords(legacy.records, kenosRead.items)
          return {
            records: merged.records,
            malformedCount: legacy.malformedCount + (kenosRead.malformedCount ?? 0),
            duplicateCount: legacy.duplicateCount + merged.duplicateCount,
            truncatedCount: legacy.truncatedCount + merged.truncatedCount,
          }
        })()
      : legacy
    const status = projected.records.length
      ? projected.malformedCount || projected.truncatedCount
        ? 'partial'
        : 'ready'
      : 'empty'
    return result(
      'items',
      projected.records,
      sourceState(status, {
        source: SOURCE.activity,
        message: projected.truncatedCount
          ? `只显示最近 100 项；另有 ${projected.truncatedCount} 项未复制到 Assistant。`
          : '',
        lastUpdated: projected.records[0]?.occurredAt,
        retryable: true,
        availableCount: projected.records.length,
        malformedCount: projected.malformedCount,
        duplicateCount: projected.duplicateCount,
      }),
      {
        ...projected,
        shadowItems: projected.records.map((item) => ({
          id: item.id,
          ownerDomain: item.ownerDomain,
          status: item.status,
          freshness: 'fresh',
          deepLink: item.deepLink,
          classification: item.classification,
        })),
      },
    )
  } catch (error) {
    return result('items', [], classifyReadError(error, { online: online(), source: SOURCE.activity }))
  }
}

export async function readAllControlSources(readers = {}, { onSettled = () => {} } = {}) {
  const implementations = {
    today: readers.today ?? readTodaySource,
    inbox: readers.inbox ?? readInboxSource,
    approvals: readers.approvals ?? readApprovalSource,
    activity: readers.activity ?? readActivitySource,
    focus: readers.focus ?? readFocusSource,
    work: readers.work ?? readWorkSource,
  }
  return settleReadSources(
    Object.fromEntries(
      Object.entries(implementations).map(([key, reader]) => [
        key,
        async () => {
          try {
            return await reader()
          } catch (error) {
            const emptyKey = key === 'today' ? 'summary' : key === 'focus' ? 'contexts' : key === 'work' ? 'projects' : 'items'
            const emptyVal = key === 'today' ? null : []
            return result(
              emptyKey,
              emptyVal,
              classifyReadError(error, { online: online(), source: SOURCE[key] }),
            )
          }
        },
      ]),
    ),
    onSettled,
  )
}

export const KENOS_READ_SOURCES = SOURCE
