import {
  classifyReadError,
  freshnessState,
  sourceState,
} from './readProjections.core.js'
import { newCorrelationId, recordReadObservation } from './readObservability.core.js'
import { isProdFocusReadEnabled } from './prodReadFlags.core.js'
import {
  FOCUS_DEFERRED_SELECT,
  FOCUS_DEFERRED_SOURCE,
  FOCUS_SUGGESTION_SOURCE,
  FOCUS_SUGGESTIONS_SELECT,
  isFocusSideReadAvailable,
} from './focusSideReads.core.js'

export const CANONICAL_FOCUS_READ_SOURCE = 'public.kenos_list_focus_contexts'
export { FOCUS_DEFERRED_SOURCE, FOCUS_SUGGESTION_SOURCE }

function text(value, fallback = '') {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, 180) : fallback
}

function projectFocusRows(rows = [], { now = Date.now() } = {}) {
  const contexts = []
  let malformedCount = 0
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object') {
      malformedCount += 1
      continue
    }
    const id = text(row.id)
    const ownerId = text(row.owner_id)
    if (!id || !ownerId) {
      malformedCount += 1
      continue
    }
    const updated = row.updated_at || row.started_at || row.created_at
    const freshness = freshnessState(updated, { now })
    contexts.push({
      id,
      ownerId,
      ownerDomain: 'focus',
      mode: text(row.mode, 'custom'),
      status: text(row.status, 'unknown'),
      activeSpace: text(row.active_space),
      safeSummary: text(row.safe_summary || row.title || row.mode, 'Focus 会话'),
      startedAt: row.started_at ?? null,
      lastUpdated: freshness.lastUpdated,
      stale: freshness.stale,
      sourceFreshness: freshness.stale ? 'stale' : 'fresh',
      deepLink: '/focus',
      classification: 'personal',
      source: CANONICAL_FOCUS_READ_SOURCE,
    })
  }
  return { contexts, malformedCount }
}

function projectSideRows(rows = [], kind) {
  const items = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const id = text(row.id)
    if (!id) continue
    items.push({
      id,
      kind,
      ownerId: text(row.owner_id),
      ownerDomain: 'focus',
      status: text(row.status, 'open'),
      safeSummary: text(row.safe_summary || row.title, kind),
      focusContextId: text(row.focus_context_id) || null,
      deepLink: '/focus',
      source: kind === 'deferred' ? FOCUS_DEFERRED_SOURCE : FOCUS_SUGGESTION_SOURCE,
    })
  }
  return items
}

/**
 * Production Focus read. Never writes. Flag default Off → unsupported.
 */
export async function readCanonicalFocusSource({
  client,
  authorized = true,
  online = true,
  now = Date.now(),
  env = import.meta.env,
} = {}) {
  const correlationId = newCorrelationId('focus')
  const started = Date.now()
  const flagOn = isProdFocusReadEnabled(env)

  const finish = (payload) => {
    recordReadObservation({
      domain: 'focus',
      source: CANONICAL_FOCUS_READ_SOURCE,
      status: payload.state.status,
      latencyMs: Date.now() - started,
      correlationId,
      flagOn,
      sourceOfTruth: flagOn ? CANONICAL_FOCUS_READ_SOURCE : 'local.focus.session',
    })
    return { ...payload, correlationId }
  }

  if (!flagOn) {
    return finish({
      contexts: [],
      deferred: [],
      suggestions: [],
      state: sourceState('unsupported', {
        source: CANONICAL_FOCUS_READ_SOURCE,
        message: '生产 Focus 读取默认关闭；本机会话仍是设备本地状态。',
      }),
    })
  }
  if (!authorized) {
    return finish({
      contexts: [],
      deferred: [],
      suggestions: [],
      state: sourceState('permission_denied', {
        source: CANONICAL_FOCUS_READ_SOURCE,
        message: '登录 Korben 后才能读取你的 Focus。',
      }),
    })
  }
  if (!online) {
    return finish({
      contexts: [],
      deferred: [],
      suggestions: [],
      state: sourceState('offline', {
        source: CANONICAL_FOCUS_READ_SOURCE,
        message: '设备当前离线；本机 Focus 状态仍可单独查看。',
        retryable: true,
      }),
    })
  }

  try {
    const { data, error } = await client.rpc('kenos_list_focus_contexts')
    if (error) throw error
    const projected = projectFocusRows(Array.isArray(data) ? data : [], { now })

    const deferredAvailable = isFocusSideReadAvailable('deferred', env)
    const suggestionsAvailable = isFocusSideReadAvailable('suggestions', env)
    let deferred = []
    let suggestions = []
    /** @type {'unavailable'|'empty'|'ready'|'error'} */
    let deferredCap = deferredAvailable ? 'empty' : 'unavailable'
    /** @type {'unavailable'|'empty'|'ready'|'error'} */
    let suggestionsCap = suggestionsAvailable ? 'empty' : 'unavailable'
    let sideDegraded = false

    const sideJobs = []
    if (deferredAvailable) {
      sideJobs.push(
        client
          .from('kenos_deferred_items')
          .select(FOCUS_DEFERRED_SELECT)
          .order('deferred_at', { ascending: false })
          .limit(50)
          .then((res) => {
            if (res.error) {
              deferredCap = 'error'
              sideDegraded = true
              return
            }
            deferred = projectSideRows(res.data ?? [], 'deferred')
            deferredCap = deferred.length ? 'ready' : 'empty'
          }),
      )
    }
    if (suggestionsAvailable) {
      sideJobs.push(
        client
          .from('kenos_proactive_suggestions')
          .select(FOCUS_SUGGESTIONS_SELECT)
          .order('created_at', { ascending: false })
          .limit(50)
          .then((res) => {
            if (res.error) {
              suggestionsCap = 'error'
              sideDegraded = true
              return
            }
            suggestions = projectSideRows(res.data ?? [], 'suggestion')
            suggestionsCap = suggestions.length ? 'ready' : 'empty'
          }),
      )
    }
    if (sideJobs.length) {
      await Promise.all(sideJobs)
    }

    const active = projected.contexts.filter((item) =>
      ['active', 'paused', 'temporarily_left'].includes(item.status),
    )
    const stale = projected.contexts.some((item) => item.stale)
    const status = projected.malformedCount || sideDegraded
      ? 'partial'
      : stale
        ? 'stale'
        : projected.contexts.length
          ? 'ready'
          : 'empty'

    return finish({
      contexts: projected.contexts,
      activeContexts: active,
      deferred,
      suggestions,
      sideCapabilities: {
        deferred: deferredCap,
        suggestions: suggestionsCap,
      },
      state: sourceState(status, {
        source: CANONICAL_FOCUS_READ_SOURCE,
        message: projected.contexts.length
          ? sideDegraded
            ? 'Focus 会话已更新；部分相关来源异常，主会话仍可用。'
            : ''
          : '当前没有 Focus 会话。',
        lastUpdated: projected.contexts.map((c) => c.lastUpdated).filter(Boolean).sort().at(-1) ?? null,
        stale,
        retryable: true,
        availableCount: projected.contexts.length,
        malformedCount: projected.malformedCount,
      }),
      shadowItems: projected.contexts.map((item) => ({
        id: item.id,
        ownerDomain: item.ownerDomain,
        status: item.status,
        mode: item.mode,
        stale: item.stale,
        deepLink: item.deepLink,
      })),
    })
  } catch (error) {
    return finish({
      contexts: [],
      deferred: [],
      suggestions: [],
      state: classifyReadError(error, { online, source: CANONICAL_FOCUS_READ_SOURCE }),
    })
  }
}
