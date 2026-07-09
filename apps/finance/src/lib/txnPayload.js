/** @typedef {import('../engine/transactions.js').FlowType} FlowType */
/** @typedef {import('../engine/transactions.js').Txn} Txn */

/**
 * @param {{
 *   date: string,
 *   merchant: string,
 *   category: string,
 *   account: string,
 *   flow: FlowType,
 *   amount: number,
 * }} form
 * @returns {Omit<Txn, 'id'>}
 */
export function toTxnPayload(form) {
  const abs = Math.abs(form.amount)
  if (form.flow === 'income') {
    return {
      date: form.date,
      merchant: form.merchant,
      category: form.category,
      account: form.account,
      flow: 'income',
      amount: -abs,
      budgetImpact: 0,
      inSpending: false,
      inCashFlow: true,
      source: 'manual',
    }
  }
  if (form.flow === 'expense') {
    return {
      date: form.date,
      merchant: form.merchant,
      category: form.category,
      account: form.account,
      flow: 'expense',
      amount: abs,
      budgetImpact: -abs,
      inSpending: true,
      inCashFlow: true,
      source: 'manual',
    }
  }
  if (form.flow === 'refund_or_reversal') {
    return {
      date: form.date,
      merchant: form.merchant,
      category: form.category,
      account: form.account,
      flow: 'refund_or_reversal',
      amount: -abs,
      budgetImpact: abs,
      inSpending: true,
      inCashFlow: true,
      source: 'manual',
    }
  }
  return {
    date: form.date,
    merchant: form.merchant,
    category: form.category,
    account: form.account,
    flow: form.flow,
    amount: abs,
    budgetImpact: 0,
    inSpending: false,
    inCashFlow: true,
    source: 'manual',
  }
}
