// Pure helpers ported from src/components/DecisionStudioView.tsx.
import { money, signedMoney } from '$lib/format.js'
import { uid } from '$lib/finance.svelte.js'
import { decisionStatusLabel } from '../copy/terminology.js'

/** @typedef {'purchase' | 'recurring_cost' | 'wait_buy_later' | 'cash_vs_finance' | 'rent_change' | 'travel' | 'career_break' | 'partner_contribution'} TemplateType */
/** @typedef {'downPayment' | 'apr' | 'termMonths' | 'moveCost'} AdvancedField */
/** @typedef {import('../types.js').ScenarioEvent} ScenarioEvent */
/** @typedef {import('../types.js').ScenarioType} ScenarioType */
/** @typedef {import('../types.js').DecisionStatus} DecisionStatus */
/** @typedef {import('@life-os/finance-core/i18n/translate').TranslateParams} TranslateParams */

/** @typedef {(key: string, params?: TranslateParams) => string} TranslateFn */

/**
 * @param {TranslateFn} t
 * @returns {{ id: TemplateType, label: string }[]}
 */
export function getTemplates(t) {
  return [
    { id: 'purchase', label: t('decisionStudio.template.purchase') },
    { id: 'recurring_cost', label: t('decisionStudio.template.recurring_cost') },
    { id: 'cash_vs_finance', label: t('decisionStudio.template.cash_vs_finance') },
    { id: 'rent_change', label: t('decisionStudio.template.rent_change') },
    { id: 'travel', label: t('decisionStudio.template.travel') },
    { id: 'career_break', label: t('decisionStudio.template.career_break') },
    { id: 'partner_contribution', label: t('decisionStudio.template.partner_contribution') },
    { id: 'wait_buy_later', label: t('decisionStudio.template.wait_buy_later') },
  ]
}

/**
 * @param {TranslateFn} t
 * @returns {Record<TemplateType, object>}
 */
export function getTemplateFieldConfig(t) {
  const usd = t('decisionStudio.suffixUsd')
  const usdMo = t('decisionStudio.suffixUsdPerMonth')
  return {
    purchase: {
      summary: t('decisionStudio.field.purchase.summary'),
      amount: {
        label: t('decisionStudio.field.purchase.amountLabel'),
        hint: t('decisionStudio.field.purchase.amountHint'),
        suffix: usd,
      },
      startDate: {
        label: t('decisionStudio.field.purchase.startDateLabel'),
        hint: t('decisionStudio.field.purchase.startDateHint'),
      },
    },
    wait_buy_later: {
      summary: t('decisionStudio.field.wait_buy_later.summary'),
      amount: {
        label: t('decisionStudio.field.wait_buy_later.amountLabel'),
        hint: t('decisionStudio.field.wait_buy_later.amountHint'),
        suffix: usd,
      },
      startDate: {
        label: t('decisionStudio.field.wait_buy_later.startDateLabel'),
        hint: t('decisionStudio.field.wait_buy_later.startDateHint'),
      },
    },
    recurring_cost: {
      summary: t('decisionStudio.field.recurring_cost.summary'),
      monthly: {
        label: t('decisionStudio.field.recurring_cost.monthlyLabel'),
        hint: t('decisionStudio.field.recurring_cost.monthlyHint'),
        suffix: usdMo,
      },
      startDate: {
        label: t('decisionStudio.field.recurring_cost.startDateLabel'),
        hint: t('decisionStudio.field.recurring_cost.startDateHint'),
      },
    },
    cash_vs_finance: {
      summary: t('decisionStudio.field.cash_vs_finance.summary'),
      amount: {
        label: t('decisionStudio.field.cash_vs_finance.amountLabel'),
        hint: t('decisionStudio.field.cash_vs_finance.amountHint'),
        suffix: usd,
      },
      monthly: {
        label: t('decisionStudio.field.cash_vs_finance.monthlyLabel'),
        hint: t('decisionStudio.field.cash_vs_finance.monthlyHint'),
        suffix: usdMo,
        optional: true,
      },
      startDate: {
        label: t('decisionStudio.field.cash_vs_finance.startDateLabel'),
        hint: t('decisionStudio.field.cash_vs_finance.startDateHint'),
      },
      advanced: ['downPayment', 'apr', 'termMonths'],
    },
    rent_change: {
      summary: t('decisionStudio.field.rent_change.summary'),
      monthly: {
        label: t('decisionStudio.field.rent_change.monthlyLabel'),
        hint: t('decisionStudio.field.rent_change.monthlyHint'),
        suffix: usdMo,
      },
      startDate: {
        label: t('decisionStudio.field.rent_change.startDateLabel'),
        hint: t('decisionStudio.field.rent_change.startDateHint'),
      },
      advanced: ['moveCost'],
    },
    travel: {
      summary: t('decisionStudio.field.travel.summary'),
      amount: {
        label: t('decisionStudio.field.travel.amountLabel'),
        hint: t('decisionStudio.field.travel.amountHint'),
        suffix: usd,
      },
      monthly: {
        label: t('decisionStudio.field.travel.monthlyLabel'),
        hint: t('decisionStudio.field.travel.monthlyHint'),
        suffix: usdMo,
        optional: true,
      },
      startDate: {
        label: t('decisionStudio.field.travel.startDateLabel'),
        hint: t('decisionStudio.field.travel.startDateHint'),
      },
    },
    career_break: {
      summary: t('decisionStudio.field.career_break.summary'),
      monthly: {
        label: t('decisionStudio.field.career_break.monthlyLabel'),
        hint: t('decisionStudio.field.career_break.monthlyHint'),
        suffix: usdMo,
      },
      amount: {
        label: t('decisionStudio.field.career_break.amountLabel'),
        hint: t('decisionStudio.field.career_break.amountHint'),
        suffix: usdMo,
        isMonthlyAmount: true,
        optional: true,
      },
      startDate: {
        label: t('decisionStudio.field.career_break.startDateLabel'),
        hint: t('decisionStudio.field.career_break.startDateHint'),
      },
    },
    partner_contribution: {
      summary: t('decisionStudio.field.partner_contribution.summary'),
      partnerPercent: {
        label: t('decisionStudio.field.partner_contribution.partnerPercentLabel'),
        hint: t('decisionStudio.field.partner_contribution.partnerPercentHint'),
      },
      startDate: {
        label: t('decisionStudio.field.partner_contribution.startDateLabel'),
        hint: t('decisionStudio.field.partner_contribution.startDateHint'),
      },
    },
  }
}

/**
 * @param {TranslateFn} t
 * @returns {Record<AdvancedField, { label: string, hint: string, suffix?: string, isPercent?: boolean }>}
 */
export function getAdvancedFieldLabels(t) {
  return {
    downPayment: {
      label: t('decisionStudio.advanced.downPaymentLabel'),
      hint: t('decisionStudio.advanced.downPaymentHint'),
      suffix: t('decisionStudio.suffixUsd'),
    },
    apr: {
      label: t('decisionStudio.advanced.aprLabel'),
      hint: t('decisionStudio.advanced.aprHint'),
      isPercent: true,
    },
    termMonths: {
      label: t('decisionStudio.advanced.termMonthsLabel'),
      hint: t('decisionStudio.advanced.termMonthsHint'),
      suffix: t('decisionStudio.suffixMonths'),
    },
    moveCost: {
      label: t('decisionStudio.advanced.moveCostLabel'),
      hint: t('decisionStudio.advanced.moveCostHint'),
      suffix: t('decisionStudio.suffixUsd'),
    },
  }
}

/** @param {{ amount: number, downPayment: number, apr: number, termMonths: number }} input */
export function estimatedFinancePayment(input) {
  return ((input.amount - input.downPayment) * (1 + input.apr)) / Math.max(1, input.termMonths)
}

/**
 * @param {TranslateFn} t
 * @param {{
 *   template: TemplateType,
 *   amount: number,
 *   monthlyAmount: number,
 *   startDate?: string,
 *   apr: number,
 *   termMonths: number,
 *   downPayment: number,
 *   moveCost: number,
 *   partnerPercent: number,
 *   privacy: boolean,
 * }} input
 */
export function describeTemplateInput(t, input) {
  const cfg = getTemplateFieldConfig(t)[input.template]
  const dateLabel = input.startDate || t('decisionStudio.input.defaultDate')
  /** @type {string[]} */
  const lines = []

  switch (input.template) {
    case 'purchase':
    case 'wait_buy_later':
      lines.push(
        t('decisionStudio.input.oneTimePurchase', {
          amount: money(input.amount, input.privacy),
          date: dateLabel,
        }),
      )
      break
    case 'recurring_cost':
      lines.push(
        t('decisionStudio.input.recurringLine', {
          direction:
            input.monthlyAmount >= 0
              ? t('decisionStudio.input.recurringIncrease')
              : t('decisionStudio.input.recurringDecrease'),
          amount: money(Math.abs(input.monthlyAmount), input.privacy),
          date: dateLabel,
        }),
      )
      break
    case 'cash_vs_finance': {
      const payment =
        input.monthlyAmount > 0 ? input.monthlyAmount : estimatedFinancePayment(input)
      lines.push(
        t('decisionStudio.input.downPaymentLine', {
          amount: money(input.downPayment, input.privacy),
          date: dateLabel,
        }),
      )
      lines.push(
        t('decisionStudio.input.monthlyPaymentLine', {
          payment: money(Math.round(payment), input.privacy),
          term: input.termMonths,
          apr: (input.apr * 100).toFixed(1),
        }),
      )
      break
    }
    case 'rent_change':
      lines.push(
        t('decisionStudio.input.rentLine', {
          direction:
            input.monthlyAmount >= 0
              ? t('decisionStudio.input.rentIncrease')
              : t('decisionStudio.input.rentDecrease'),
          amount: money(Math.abs(input.monthlyAmount), input.privacy),
          date: dateLabel,
        }),
      )
      if (input.moveCost > 0) {
        lines.push(
          t('decisionStudio.input.moveCostLine', {
            amount: money(input.moveCost, input.privacy),
          }),
        )
      }
      break
    case 'travel':
      lines.push(
        t('decisionStudio.input.travelSpend', {
          amount: money(input.amount, input.privacy),
          date: dateLabel,
        }),
      )
      if (input.monthlyAmount > 0) {
        lines.push(
          t('decisionStudio.input.travelSave', {
            amount: money(input.monthlyAmount, input.privacy),
          }),
        )
      }
      break
    case 'career_break':
      lines.push(
        t('decisionStudio.input.incomeReduction', {
          amount: money(Math.abs(input.monthlyAmount), input.privacy),
          date: dateLabel,
        }),
      )
      if (input.amount !== 0) {
        lines.push(
          t('decisionStudio.input.tempExpense', {
            amount: money(input.amount, input.privacy),
          }),
        )
      }
      break
    case 'partner_contribution':
      lines.push(
        t('decisionStudio.input.partnerLine', {
          percent: Math.round(input.partnerPercent * 100),
          date: dateLabel,
        }),
      )
      break
  }

  if (lines.length === 0 && cfg.summary) lines.push(cfg.summary)
  return lines
}

/** @returns {{ value: DecisionStatus, label: string }[]} */
export function decisionStatusOptions() {
  /** @type {DecisionStatus[]} */
  const statuses = ['considering', 'chosen', 'declined', 'deferred', 'reviewed']
  return statuses.map((value) => ({ value, label: decisionStatusLabel(value) }))
}

/** @param {TemplateType} template @returns {ScenarioType} */
export function scenarioTypeFromTemplate(template) {
  if (template === 'purchase' || template === 'wait_buy_later') return 'purchase'
  if (template === 'recurring_cost') return 'recurring_cost'
  if (template === 'cash_vs_finance') return 'cash_vs_finance'
  if (template === 'rent_change') return 'rent_change'
  if (template === 'travel') return 'travel'
  if (template === 'career_break') return 'career_break'
  return 'partner_contribution'
}

/** @param {string | undefined} dateIso */
export function dateToMonthOffset(dateIso) {
  if (!dateIso) return 1
  const now = new Date()
  const d = new Date(dateIso)
  return Math.max(
    1,
    (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()) + 1,
  )
}

/**
 * @param {TranslateFn} t
 * @param {{
 *   template: TemplateType,
 *   amount: number,
 *   monthlyAmount: number,
 *   startDate?: string,
 *   apr: number,
 *   termMonths: number,
 *   downPayment: number,
 *   moveCost: number,
 *   partnerPercent: number,
 * }} input
 * @returns {ScenarioEvent[]}
 */
export function buildTemplateEvents(t, input) {
  const monthOffset = dateToMonthOffset(input.startDate)
  /** @type {ScenarioEvent[]} */
  const events = []
  switch (input.template) {
    case 'purchase':
    case 'wait_buy_later':
      events.push({
        id: uid('evt'),
        name: t('decisionStudio.event.oneTimePurchase'),
        eventType: 'one-time-purchase',
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount: input.amount,
        fundingSource: 'checking',
      })
      break
    case 'recurring_cost':
      events.push({
        id: uid('evt'),
        name: t('decisionStudio.event.expenseChange'),
        eventType: 'expense-change',
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount: input.monthlyAmount,
      })
      break
    case 'cash_vs_finance':
      events.push({
        id: uid('evt'),
        name: t('decisionStudio.event.downPayment'),
        eventType: 'one-time-purchase',
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount: input.downPayment,
        fundingSource: 'checking',
      })
      events.push({
        id: uid('evt'),
        name: t('decisionStudio.event.monthlyPayment'),
        eventType: 'expense-change',
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount:
          input.monthlyAmount > 0 ? input.monthlyAmount : estimatedFinancePayment(input),
      })
      break
    case 'rent_change':
      events.push({
        id: uid('evt'),
        name: t('decisionStudio.event.rentChange'),
        eventType: 'expense-change',
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount: input.monthlyAmount,
      })
      if (input.moveCost > 0) {
        events.push({
          id: uid('evt'),
          name: t('decisionStudio.event.moveCost'),
          eventType: 'one-time-purchase',
          enabled: true,
          monthOffset,
          date: input.startDate,
          amount: input.moveCost,
          fundingSource: 'checking',
        })
      }
      break
    case 'travel':
      events.push({
        id: uid('evt'),
        name: t('decisionStudio.event.travelBudget'),
        eventType: 'one-time-purchase',
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount: input.amount,
        fundingSource: 'checking',
      })
      if (input.monthlyAmount > 0) {
        events.push({
          id: uid('evt'),
          name: t('decisionStudio.event.travelSavings'),
          eventType: 'expense-change',
          enabled: true,
          monthOffset: 1,
          amount: input.monthlyAmount,
        })
      }
      break
    case 'career_break':
      events.push({
        id: uid('evt'),
        name: t('decisionStudio.event.incomeReduction'),
        eventType: 'salary-change',
        enabled: true,
        monthOffset,
        date: input.startDate,
        amount: -Math.abs(input.monthlyAmount),
      })
      if (input.amount !== 0) {
        events.push({
          id: uid('evt'),
          name: t('decisionStudio.event.tempExpense'),
          eventType: 'expense-change',
          enabled: true,
          monthOffset,
          date: input.startDate,
          amount: input.amount,
        })
      }
      break
    case 'partner_contribution':
      events.push({
        id: uid('evt'),
        name: t('decisionStudio.event.partnerContribution'),
        eventType: 'partner-contribution',
        enabled: true,
        monthOffset,
        date: input.startDate,
        contributionPercent: input.partnerPercent,
      })
      break
  }
  return events
}

/** @param {TranslateFn} t @param {ScenarioEvent} e */
export function eventDisplayType(t, e) {
  if (e.eventType === 'one-time-purchase') return t('decisionStudio.eventType.oneTimePurchase')
  if (e.eventType === 'windfall') return t('decisionStudio.eventType.windfall')
  if (e.eventType === 'expense-change') return t('decisionStudio.eventType.expenseChange')
  if (e.eventType === 'salary-change') return t('decisionStudio.eventType.salaryChange')
  if (e.eventType === 'partner-contribution')
    return t('decisionStudio.eventType.partnerContribution')
  return t('decisionStudio.eventType.custom')
}

/**
 * @param {TranslateFn} t
 * @param {ScenarioEvent} e
 * @param {string} scenarioName
 * @param {boolean} privacy
 */
export function previewRowFromEvent(t, e, scenarioName, privacy) {
  const amount = e.amount ?? 0
  const proposed =
    e.eventType === 'windfall'
      ? signedMoney(amount, privacy)
      : e.eventType === 'partner-contribution'
        ? `${Math.round((e.contributionPercent ?? 0) * 100)}%`
        : signedMoney(-amount, privacy)
  return {
    eventId: e.id,
    plannedItem: `${eventDisplayType(t, e)} · ${e.name}`,
    currentValue: t('decisionStudio.preview.noCurrentValue'),
    proposedValue: proposed,
    effectiveDate:
      e.date ?? t('decisionStudio.preview.monthOffset', { offset: e.monthOffset }),
    sourceScenario: scenarioName,
  }
}
