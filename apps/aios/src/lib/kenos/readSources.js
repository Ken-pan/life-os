import { isCloudAuthorized } from '$lib/cloud.svelte.js'
import { lifeOsReadClient } from '$lib/lifeos.js'
import { readCanonicalApprovalSource } from './approvalReadSource.core.js'
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

const SOURCE = Object.freeze({
  today: 'public.portal_today_summary',
  inbox: 'public.life_events:pending',
  approvals: 'public.kenos_list_action_approvals',
  activity: 'public.life_events',
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
  if (!isCloudAuthorized()) return result('summary', null, unavailableWithoutAuth(SOURCE.today))
  if (!online()) return result('summary', null, unavailableWithoutAuth(SOURCE.today))
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
      return result(
        'summary',
        null,
        sourceState('empty', {
          source: SOURCE.today,
          message: '摘要来源可用，但今天没有可展示的领域摘要。',
        }),
      )
    }
    const freshness = freshnessState(data.asOf, { now })
    return result(
      'summary',
      data,
      sourceState(freshness.stale ? 'stale' : 'ready', {
        source: SOURCE.today,
        message: freshness.stale ? '摘要已超过 freshness 阈值；领域链接仍可安全打开。' : '',
        lastUpdated: freshness.lastUpdated,
        stale: freshness.stale,
        retryable: true,
        availableCount: 1,
      }),
    )
  } catch (error) {
    return result('summary', null, classifyReadError(error, { online: online(), source: SOURCE.today }))
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

export async function readActivitySource({ client = lifeOsReadClient() } = {}) {
  if (!isCloudAuthorized()) return result('items', [], unavailableWithoutAuth(SOURCE.activity))
  if (!online()) return result('items', [], unavailableWithoutAuth(SOURCE.activity))
  try {
    const { data, error } = await client
      .from('life_events')
      .select('id,type,payload,status,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    const projected = projectActivityEvents(data ?? [])
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
  }
  return settleReadSources(
    Object.fromEntries(
      Object.entries(implementations).map(([key, reader]) => [
        key,
        async () => {
          try {
            return await reader()
          } catch (error) {
            return result(
              key === 'today' ? 'summary' : 'items',
              key === 'today' ? null : [],
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
