/**
 * Home Space read — reuses portal_today_summary.home (no Home writer).
 * Flag default Off.
 */

import { isProdHomeReadEnabled } from './prodReadFlags.core.js'
import { classifyReadError, sourceState } from './readProjections.core.js'

export { isProdHomeReadEnabled }

export const CANONICAL_HOME_READ_SOURCE = 'public.portal_today_summary.home'

/**
 * @param {object | null | undefined} homeBlock
 */
export function projectHomeFromTodayHome(homeBlock) {
  if (!homeBlock || typeof homeBlock !== 'object') {
    return {
      storageZoneCount: 0,
      reportedAt: null,
      deepLink: 'https://home.kenos.space',
    }
  }
  return {
    storageZoneCount:
      Number(homeBlock.storageZoneCount ?? homeBlock.storage_zone_count ?? 0) || 0,
    reportedAt: homeBlock.reportedAt || homeBlock.reported_at || null,
    deepLink: 'https://home.kenos.space',
  }
}

/**
 * @param {{ client: any, authorized?: boolean, online?: boolean, timezone?: string }} opts
 */
export async function readHomeSpaceSource({
  client,
  authorized = true,
  online = true,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
} = {}) {
  if (!authorized) {
    return {
      home: null,
      state: sourceState('permission_denied', {
        source: CANONICAL_HOME_READ_SOURCE,
        message: '登录后才能读取 Home 摘要。',
      }),
    }
  }
  if (!online) {
    return {
      home: null,
      state: sourceState('offline', {
        source: CANONICAL_HOME_READ_SOURCE,
        message: '离线时不显示假 Home 状态；联网后可重试。',
        retryable: true,
      }),
    }
  }
  if (!client) {
    return {
      home: null,
      state: sourceState('unavailable', {
        source: CANONICAL_HOME_READ_SOURCE,
        message: 'Home 读取未配置。',
      }),
    }
  }
  try {
    const { data, error } = await client.rpc('portal_today_summary', { p_timezone: timezone })
    if (error) throw error
    if (!data || data.ok === false) {
      return {
        home: null,
        state: sourceState('unavailable', {
          source: CANONICAL_HOME_READ_SOURCE,
          message: '暂时无法读取 Home 摘要。',
          retryable: true,
        }),
      }
    }
    const home = projectHomeFromTodayHome(data.home)
    return {
      home,
      state: sourceState('ready', {
        source: CANONICAL_HOME_READ_SOURCE,
        lastUpdated: home.reportedAt,
        availableCount: home.storageZoneCount,
      }),
    }
  } catch (error) {
    return {
      home: null,
      state: classifyReadError(error, {
        online,
        source: CANONICAL_HOME_READ_SOURCE,
      }),
    }
  }
}
