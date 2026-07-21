/**
 * Runtime Production Capability Registry.
 * Distinguishes unavailable vs empty vs legacy-backed vs Kenos-backed vs shadow-only.
 */

import { prodReadFlagSnapshot } from './prodReadFlags.core.js'
import {
  focusDeferredCapability,
  focusSuggestionsCapability,
} from './focusSideReads.core.js'

/** @typedef {'available'|'unavailable'|'empty'|'loading'|'degraded'|'unauthorized'|'error'|'legacy-backed'|'kenos-backed'|'shadow-only'} CapabilitySurface */

/**
 * @typedef {{
 *   id: string,
 *   domain: string,
 *   operation: 'read'|'write'|'command'|'decision'|'delivery'|'execute',
 *   surface: CapabilitySurface,
 *   sourceOfTruth: string,
 *   userSafeLabel: string,
 *   userSafeDetail: string,
 *   productionReady: boolean,
 *   writesProduction: boolean,
 * }} CapabilityEntry
 */

/**
 * @param {Partial<CapabilityEntry> & Pick<CapabilityEntry, 'id'|'domain'|'operation'|'surface'|'sourceOfTruth'|'userSafeLabel'>} partial
 * @returns {CapabilityEntry}
 */
function entry(partial) {
  return {
    productionReady: false,
    writesProduction: false,
    userSafeDetail: '',
    ...partial,
  }
}

/**
 * Build the registry from live source states + flags.
 * @param {{
 *   flags?: ReturnType<typeof prodReadFlagSnapshot>,
 *   sources?: Record<string, { status?: string, source?: string, availableCount?: number } | undefined>,
 *   workFoundationEnabled?: boolean,
 *   focusLocalActive?: boolean,
 * }} [options]
 */
export function buildCapabilityRegistry(options = {}) {
  const flags = options.flags ?? prodReadFlagSnapshot()
  const sources = options.sources ?? {}
  const workFoundation = Boolean(options.workFoundationEnabled)
  const focusLocal = Boolean(options.focusLocalActive)

  /** @param {string} key */
  function readSurface(key, { kenosWhen, legacySource, kenosSource }) {
    const state = sources[key]
    if (!kenosWhen) {
      if (state?.status === 'permission_denied') {
        return entry({
          id: key,
          domain: key,
          operation: 'read',
          surface: 'unauthorized',
          sourceOfTruth: legacySource,
          userSafeLabel: '需要登录',
          userSafeDetail: '登录后才能读取你的数据。可在设置中登录。',
        })
      }
      if (state?.status === 'loading') {
        return entry({
          id: key,
          domain: key,
          operation: 'read',
          surface: 'loading',
          sourceOfTruth: legacySource,
          userSafeLabel: '正在更新',
        })
      }
      if (state?.status === 'unavailable' || state?.status === 'offline') {
        return entry({
          id: key,
          domain: key,
          operation: 'read',
          surface: state.status === 'offline' ? 'degraded' : 'unavailable',
          sourceOfTruth: legacySource,
          userSafeLabel: state.status === 'offline' ? '离线' : '暂时无法读取',
          userSafeDetail: '这不是「零条数据」。',
        })
      }
      if (state?.status === 'empty') {
        return entry({
          id: key,
          domain: key,
          operation: 'read',
          surface: 'empty',
          sourceOfTruth: legacySource,
          userSafeLabel: '暂无内容',
          productionReady: true,
        })
      }
      if (state?.status === 'ready' || state?.status === 'partial' || state?.status === 'stale') {
        return entry({
          id: key,
          domain: key,
          operation: 'read',
          surface: state.status === 'ready' ? 'legacy-backed' : 'degraded',
          sourceOfTruth: state.source || legacySource,
          userSafeLabel: state.status === 'stale' ? '内容可能过期' : '已更新',
          productionReady: true,
        })
      }
      return entry({
        id: key,
        domain: key,
        operation: 'read',
        surface: 'legacy-backed',
        sourceOfTruth: legacySource,
        userSafeLabel: '使用现有来源',
        productionReady: true,
      })
    }

    if (state?.status === 'permission_denied') {
      return entry({
        id: key,
        domain: key,
        operation: 'read',
        surface: 'unauthorized',
        sourceOfTruth: kenosSource,
        userSafeLabel: '需要登录',
        userSafeDetail: '登录后才能读取你的数据。可在设置中登录。',
      })
    }
    if (state?.status === 'unsupported') {
      return entry({
        id: key,
        domain: key,
        operation: 'read',
        surface: 'unavailable',
        sourceOfTruth: kenosSource,
        userSafeLabel: '尚未接入',
        userSafeDetail: '不会用空数量代替未接入。',
      })
    }
    if (state?.status === 'empty') {
      return entry({
        id: key,
        domain: key,
        operation: 'read',
        surface: 'empty',
        sourceOfTruth: kenosSource,
        userSafeLabel: '暂无内容',
        productionReady: true,
      })
    }
    if (state?.status === 'ready' || state?.status === 'partial' || state?.status === 'stale') {
      return entry({
        id: key,
        domain: key,
        operation: 'read',
        surface: state.status === 'ready' ? 'kenos-backed' : 'degraded',
        sourceOfTruth: kenosSource,
        userSafeLabel: '已更新',
        productionReady: true,
      })
    }
    if (state?.status === 'loading') {
      return entry({
        id: key,
        domain: key,
        operation: 'read',
        surface: 'loading',
        sourceOfTruth: kenosSource,
        userSafeLabel: '正在更新',
      })
    }
    return entry({
      id: key,
      domain: key,
      operation: 'read',
      surface: 'unavailable',
      sourceOfTruth: kenosSource,
      userSafeLabel: '暂时无法读取',
      userSafeDetail: '这不是「零条数据」。',
    })
  }

  const planRead = readSurface('today', {
    kenosWhen: false,
    legacySource: 'public.portal_today_summary',
    kenosSource: 'public.portal_today_summary',
  })
  planRead.id = 'plan.read'
  planRead.domain = 'plan'

  const approvalRead = readSurface('approvals', {
    kenosWhen: flags.approvals,
    legacySource: 'public.kenos_list_action_approvals',
    kenosSource: 'public.kenos_list_action_approvals',
  })
  approvalRead.id = 'approval.read'
  approvalRead.domain = 'approval'
  if (flags.approvals && (sources.approvals?.status === 'ready' || sources.approvals?.status === 'empty')) {
    approvalRead.surface = sources.approvals.status === 'empty' ? 'empty' : 'kenos-backed'
    approvalRead.productionReady = true
  }

  const focusRead = flags.focus
    ? readSurface('focus', {
        kenosWhen: true,
        legacySource: 'local.focus.session',
        kenosSource: 'public.kenos_list_focus_contexts',
      })
    : entry({
        id: 'focus.read',
        domain: 'focus',
        operation: 'read',
        surface: focusLocal ? 'legacy-backed' : 'shadow-only',
        sourceOfTruth: 'local.focus.session',
        userSafeLabel: focusLocal ? '本机 Focus 会话' : '生产 Focus 读取未开启',
        userSafeDetail: focusLocal
          ? '仅本设备状态；不是跨设备生产会话。'
          : '功能开关默认关闭；不会伪装成已同步。',
        productionReady: false,
      })
  focusRead.id = 'focus.read'
  focusRead.domain = 'focus'

  const focusDeferred = focusDeferredCapability()
  const focusSuggestions = focusSuggestionsCapability()
  // Live side-read outcomes override static flag surfaces when provided.
  const deferredLive = sources.focusDeferred?.status
  if (deferredLive === 'error') {
    focusDeferred.surface = 'error'
    focusDeferred.userSafeLabel = '延期事项读取异常'
    focusDeferred.userSafeDetail = '不会显示为空列表。'
  } else if (deferredLive === 'empty' && focusDeferred.surface === 'available') {
    focusDeferred.surface = 'empty'
    focusDeferred.userSafeLabel = '暂无延期事项'
  } else if (deferredLive === 'ready' && focusDeferred.surface === 'available') {
    focusDeferred.surface = 'kenos-backed'
    focusDeferred.productionReady = true
  }
  const suggestionsLive = sources.focusSuggestions?.status
  if (suggestionsLive === 'error') {
    focusSuggestions.surface = 'error'
    focusSuggestions.userSafeLabel = '建议读取异常'
    focusSuggestions.userSafeDetail = '不会显示为空列表。'
  } else if (suggestionsLive === 'empty' && focusSuggestions.surface === 'available') {
    focusSuggestions.surface = 'empty'
    focusSuggestions.userSafeLabel = '暂无建议'
  } else if (suggestionsLive === 'ready' && focusSuggestions.surface === 'available') {
    focusSuggestions.surface = 'kenos-backed'
    focusSuggestions.productionReady = true
  }

  const workRead = flags.work
    ? readSurface('work', {
        kenosWhen: true,
        legacySource: 'kenos_work_local_projection',
        kenosSource: 'public.kenos_list_work_projects',
      })
    : entry({
        id: 'work.read',
        domain: 'work',
        operation: 'read',
        surface: workFoundation ? 'legacy-backed' : 'unavailable',
        sourceOfTruth: workFoundation ? 'kenos_work_local_projection' : 'unset',
        userSafeLabel: workFoundation ? '本地 Work 草稿' : 'Work 读取未开启',
        userSafeDetail: workFoundation
          ? '仅本机草稿，尚未接入生产 Work 读模型。'
          : '不会显示为零条 Work。',
        productionReady: false,
      })
  workRead.id = 'work.read'
  workRead.domain = 'work'

  const activityRead = readSurface('activity', {
    kenosWhen: false,
    legacySource: 'public.life_events',
    kenosSource: 'public.life_events',
  })
  activityRead.id = 'activity.read'
  activityRead.domain = 'activity'

  /** @type {CapabilityEntry[]} */
  const entries = [
    planRead,
    entry({
      id: 'plan.command',
      domain: 'plan',
      operation: 'command',
      surface: 'unavailable',
      sourceOfTruth: 'public.kenos_create_plan_task_action',
      userSafeLabel: '写入未开启',
      userSafeDetail: '生产 Plan command 需单独 writer canary 批准。',
      writesProduction: true,
    }),
    approvalRead,
    entry({
      id: 'approval.decision',
      domain: 'approval',
      operation: 'decision',
      surface: 'unavailable',
      sourceOfTruth: 'executor.disabled',
      userSafeLabel: '审批动作未开启',
      userSafeDetail: 'Executor / Approval write 尚未批准。',
      writesProduction: true,
    }),
    focusRead,
    focusDeferred,
    focusSuggestions,
    entry({
      id: 'focus.write',
      domain: 'focus',
      operation: 'write',
      surface: 'unavailable',
      sourceOfTruth: 'unset',
      userSafeLabel: 'Focus 写入未开启',
      writesProduction: true,
    }),
    workRead,
    entry({
      id: 'work.write',
      domain: 'work',
      operation: 'write',
      surface: 'unavailable',
      sourceOfTruth: 'unset',
      userSafeLabel: 'Work 写入未开启',
      userSafeDetail: 'OPEN-002：禁止把 Work body 镜像进 Plan。',
      writesProduction: true,
    }),
    activityRead,
    entry({
      id: 'outbox.delivery',
      domain: 'plan',
      operation: 'delivery',
      surface: 'unavailable',
      sourceOfTruth: 'kenos_outbox_worker',
      userSafeLabel: '投递未开启',
      userSafeDetail: 'Worker 仍为 nologin；无生产投递。',
    }),
    entry({
      id: 'assistant.action',
      domain: 'assistant',
      operation: 'command',
      surface: 'unavailable',
      sourceOfTruth: 'assistant.local',
      userSafeLabel: 'Assistant 动作未接生产写入',
    }),
    entry({
      id: 'executor.production',
      domain: 'system',
      operation: 'execute',
      surface: 'unavailable',
      sourceOfTruth: 'executor.disabled',
      userSafeLabel: '生产 Executor 未批准',
      writesProduction: true,
    }),
  ]

  if (flags.shadow) {
    entries.push(
      entry({
        id: 'shadow.compare',
        domain: 'system',
        operation: 'read',
        surface: 'shadow-only',
        sourceOfTruth: 'independent-legacy-vs-kenos',
        userSafeLabel: '内部比对（非主界面）',
        userSafeDetail: '仅供诊断；不作为日常内容来源。',
      }),
    )
  }

  return Object.freeze({
    flags,
    generatedAt: new Date().toISOString(),
    entries: Object.freeze(entries),
    byId: Object.freeze(Object.fromEntries(entries.map((item) => [item.id, item]))),
  })
}

/**
 * User-facing copy: never render unavailable as zero.
 * @param {CapabilityEntry | undefined} capability
 */
export function capabilityEmptyCopy(capability) {
  if (!capability) return { kind: 'unavailable', title: '暂时无法读取', body: '这不是空列表。' }
  if (capability.surface === 'empty') {
    return { kind: 'empty', title: '暂无内容', body: '数据源正常，当前没有可展示的内容。' }
  }
  if (capability.surface === 'unavailable' || capability.surface === 'shadow-only') {
    return {
      kind: 'unavailable',
      title: capability.userSafeLabel || '尚未开启',
      body: capability.userSafeDetail || '当前能力尚未开启；不会用空数量冒充「没有事项」。',
    }
  }
  if (capability.surface === 'unauthorized') {
    return {
      kind: 'unauthorized',
      title: '需要登录',
      body: capability.userSafeDetail || '登录后才能读取你的数据。可在设置中登录。',
    }
  }
  if (capability.surface === 'error') {
    return {
      kind: 'error',
      title: capability.userSafeLabel || '读取失败',
      body: capability.userSafeDetail || '请稍后重试；不会伪造数据。',
    }
  }
  if (capability.surface === 'degraded') {
    return {
      kind: 'degraded',
      title: capability.userSafeLabel || '部分来源异常',
      body: capability.userSafeDetail || '仍可查看已成功加载的部分；不会把异常显示成空列表。',
    }
  }
  if (capability.surface === 'loading') {
    return { kind: 'loading', title: '正在更新', body: '' }
  }
  return { kind: 'ready', title: '', body: '' }
}
