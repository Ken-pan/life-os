// Shared helpers ported from src/components/ScenariosView.tsx.
import { uid } from '$lib/finance.svelte.js'

/** @typedef {import('../types.js').ScenarioEvent} ScenarioEvent */
/** @typedef {import('../types.js').ScenarioEventType} ScenarioEventType */

/** @param {(key: string) => string} t */
export function eventTypeOptions(t) {
  return [
    { value: /** @type {ScenarioEventType} */ ('salary-change'), label: t('scenarios.eventSalaryChange') },
    { value: /** @type {ScenarioEventType} */ ('expense-change'), label: t('scenarios.eventExpenseChange') },
    { value: /** @type {ScenarioEventType} */ ('partner-contribution'), label: t('scenarios.eventPartnerContribution') },
  ]
}

/** @param {ScenarioEventType} type @param {(key: string) => string} t */
export function defaultEvent(type, t) {
  const options = eventTypeOptions(t)
  /** @type {ScenarioEvent} */
  const base = {
    id: uid('evt'),
    name: options.find((e) => e.value === type)?.label ?? t('scenarios.eventDefaultName'),
    eventType: type,
    enabled: true,
    monthOffset: 12,
  }
  if (type === 'salary-change') base.amount = 500
  if (type === 'expense-change') base.amount = 200
  if (type === 'partner-contribution') {
    base.contributionPercent = 0.5
    base.expenseCategory = ''
  }
  return base
}
