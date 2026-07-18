import assert from 'node:assert/strict'
import {
  formatLiquidCash,
  formatMonthSummary,
  isTimezone,
  roundMoney,
  summarizeLiquidCash,
} from './mcpFinance.mjs'

{
  assert.equal(roundMoney(12.345), 12.35)
  assert.equal(roundMoney('12.3'), 12.3)
  assert.equal(roundMoney(NaN), 0)
}

{
  const text = formatMonthSummary({
    monthExpense: 1200.5,
    monthIncome: 4000,
    monthSurplus: 2799.5,
  })
  assert.match(text, /支出 \$1200\.5/)
  assert.match(text, /收入 \$4000/)
  assert.match(text, /结余 \+\$2799\.5/)
}

{
  const empty = formatMonthSummary(null)
  assert.match(empty, /还没有本月财务汇总/)
}

{
  const s = summarizeLiquidCash([
    { name: 'Chase', type: 'checking', balance: 1000.55, liquid: true },
    { name: 'HYSA', type: 'savings', balance: 500, liquid: true },
    { name: '401k', type: 'investment', balance: 99999, liquid: true },
    { name: 'Locked', type: 'savings', balance: 200, liquid: false },
  ])
  assert.equal(s.total, 1500.55)
  assert.equal(s.lines.length, 2)
  const text = formatLiquidCash(s)
  assert.match(text, /流动现金合计：\$1500\.55/)
  assert.match(text, /Chase/)
}

{
  assert.equal(isTimezone('America/Los_Angeles'), true)
  assert.equal(isTimezone(''), false)
  assert.equal(isTimezone('not a tz!!!'), false)
}

console.log('mcpFinance.test.mjs: ok')
