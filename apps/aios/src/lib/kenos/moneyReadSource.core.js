/**
 * Money Space read — reuses portal_today_summary.finance (no Finance writer).
 * Flag default Off.
 */

import { isProdMoneyReadEnabled } from './prodReadFlags.core.js'
import { classifyReadError, sourceState } from './readProjections.core.js'

export { isProdMoneyReadEnabled }

export const CANONICAL_MONEY_READ_SOURCE = 'public.portal_today_summary.finance'

/**
 * @param {object | null | undefined} financeBlock
 */
export function projectMoneyFromTodayFinance(financeBlock) {
  if (!financeBlock || typeof financeBlock !== 'object') {
    return {
      spentToday: null,
      currency: null,
      pendingBills: 0,
      deepLink: 'https://finance.kenos.space',
    }
  }
  return {
    spentToday: financeBlock.spent_today ?? financeBlock.spentToday ?? null,
    currency: financeBlock.currency || null,
    pendingBills: Number(financeBlock.pending_bills ?? financeBlock.pendingBills ?? 0) || 0,
    deepLink: 'https://finance.kenos.space',
  }
}

/**
 * @param {{ client: any, authorized?: boolean, online?: boolean, timezone?: string }} opts
 */
export async function readMoneySpaceSource({
  client,
  authorized = true,
  online = true,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
} = {}) {
  if (!authorized) {
    return {
      money: null,
      state: sourceState('permission_denied', {
        source: CANONICAL_MONEY_READ_SOURCE,
        message: '登录后才能读取 Money 摘要。',
      }),
    }
  }
  if (!online) {
    return {
      money: null,
      state: sourceState('offline', {
        source: CANONICAL_MONEY_READ_SOURCE,
        message: '离线时不显示假账单；联网后可重试。',
        retryable: true,
      }),
    }
  }
  if (!client) {
    return {
      money: null,
      state: sourceState('unavailable', {
        source: CANONICAL_MONEY_READ_SOURCE,
        message: 'Money 读取未配置。',
      }),
    }
  }
  try {
    const { data, error } = await client.rpc('portal_today_summary', { p_timezone: timezone })
    if (error) throw error
    if (!data || data.ok === false) {
      return {
        money: null,
        state: sourceState('unavailable', {
          source: CANONICAL_MONEY_READ_SOURCE,
          message: '暂时无法读取 Money 摘要。',
          retryable: true,
        }),
      }
    }
    const money = projectMoneyFromTodayFinance(data.finance)
    return {
      money,
      state: sourceState('ready', {
        source: CANONICAL_MONEY_READ_SOURCE,
        availableCount: money.pendingBills,
      }),
    }
  } catch (error) {
    return {
      money: null,
      state: classifyReadError(error, {
        online,
        source: CANONICAL_MONEY_READ_SOURCE,
      }),
    }
  }
}
