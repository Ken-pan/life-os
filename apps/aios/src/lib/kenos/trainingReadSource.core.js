/**
 * Training Space read — reuses portal_today_summary.fitness (no Fitness writer).
 * Flag default Off. Never invents a fake Push Day plan.
 */

import { isProdTrainingReadEnabled } from './prodReadFlags.core.js'
import { classifyReadError, sourceState } from './readProjections.core.js'

export { isProdTrainingReadEnabled }

export const CANONICAL_TRAINING_READ_SOURCE = 'public.portal_today_summary.fitness'

/**
 * @param {object | null | undefined} fitnessBlock
 */
export function projectTrainingFromTodayFitness(fitnessBlock) {
  if (!fitnessBlock || typeof fitnessBlock !== 'object') {
    return {
      trainedToday: false,
      lastSessionAt: null,
      bodyParts: [],
      sessionCount: 0,
      deepLink: 'https://training.kenos.space',
    }
  }
  const bodyParts = Array.isArray(fitnessBlock.body_parts)
    ? fitnessBlock.body_parts.map(String).filter(Boolean)
    : Array.isArray(fitnessBlock.bodyParts)
      ? fitnessBlock.bodyParts.map(String).filter(Boolean)
      : []
  return {
    trainedToday: Boolean(fitnessBlock.trained_today ?? fitnessBlock.trainedToday),
    lastSessionAt: fitnessBlock.last_session_at || fitnessBlock.lastSessionAt || null,
    bodyParts,
    sessionCount: Number(fitnessBlock.session_count ?? fitnessBlock.sessionCount ?? 0) || 0,
    deepLink: 'https://training.kenos.space',
  }
}

/**
 * @param {{ client: any, authorized?: boolean, online?: boolean, timezone?: string }} opts
 */
export async function readTrainingSpaceSource({
  client,
  authorized = true,
  online = true,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
} = {}) {
  if (!authorized) {
    return {
      training: null,
      state: sourceState('permission_denied', {
        source: CANONICAL_TRAINING_READ_SOURCE,
        message: '登录后才能读取 Training 摘要。',
      }),
    }
  }
  if (!online) {
    return {
      training: null,
      state: sourceState('offline', {
        source: CANONICAL_TRAINING_READ_SOURCE,
        message: '离线时不显示假训练计划；联网后可重试。',
        retryable: true,
      }),
    }
  }
  if (!client) {
    return {
      training: null,
      state: sourceState('unavailable', {
        source: CANONICAL_TRAINING_READ_SOURCE,
        message: 'Training 读取未配置。',
      }),
    }
  }
  try {
    const { data, error } = await client.rpc('portal_today_summary', { p_timezone: timezone })
    if (error) throw error
    if (!data || data.ok === false) {
      return {
        training: null,
        state: sourceState('unavailable', {
          source: CANONICAL_TRAINING_READ_SOURCE,
          message: '暂时无法读取 Training 摘要。',
          retryable: true,
        }),
      }
    }
    const training = projectTrainingFromTodayFitness(data.fitness)
    return {
      training,
      state: sourceState('ready', {
        source: CANONICAL_TRAINING_READ_SOURCE,
        lastUpdated: training.lastSessionAt,
        availableCount: training.sessionCount,
      }),
    }
  } catch (error) {
    return {
      training: null,
      state: classifyReadError(error, {
        online,
        source: CANONICAL_TRAINING_READ_SOURCE,
      }),
    }
  }
}
