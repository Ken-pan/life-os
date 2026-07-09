import { getLifeOsAppOrigin } from '@life-os/theme'

/**
 * @typedef {'finance' | 'fitness'} LifeEventDomain
 */

/**
 * @param {import('./types.js').Task} task
 * @param {(key: string) => string} t
 */
export function getLifeEventSource(task, t) {
  const ref = task.meta?.lifeEventRef
  if (!ref?.domain) return null

  if (ref.domain === 'finance') {
    return {
      domain: 'finance',
      label: t('task.lifeEventFinance'),
      href: `${getLifeOsAppOrigin('finance')}/#/today`,
    }
  }

  if (ref.domain === 'fitness') {
    return {
      domain: 'fitness',
      label: t('task.lifeEventFitness'),
      href: getLifeOsAppOrigin('fitness'),
    }
  }

  return null
}
