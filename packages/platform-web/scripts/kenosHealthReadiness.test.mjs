import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildHealthReadinessFromMeasurements,
  buildHealthReadinessSummary,
  isSafeHealthReadiness,
  healthReadinessToTodaySignal,
  healthReadinessToTodayPriority,
  formatHealthReadinessForAssistant,
  focusCapacityFromDims,
} from '../src/kenosHealthReadiness.js'

const NOW = Date.parse('2026-07-16T14:00:00')
const day = (n) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() - n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const history = () =>
  Array.from({ length: 6 }, (_, i) => ({
    date: day(i + 1),
    hrv: 50,
    restingHR: 56,
    sleepHours: 7.5,
    steps: 8000,
    activeEnergyKcal: 450,
    exerciseMinutes: 25,
  }))

test('summary strips vitals and stays safe', () => {
  const summary = buildHealthReadinessFromMeasurements({
    now: NOW,
    health: [
      {
        date: day(0),
        hrv: 52,
        restingHR: 55,
        sleepHours: 7.5,
        steps: 9000,
        activeEnergyKcal: 500,
      },
      ...history(),
    ],
    agent: { online: false },
  })
  assert.equal(isSafeHealthReadiness(summary), true)
  assert.equal(summary.dims.physical, 'good')
  assert.equal(summary.training.code, 'ok_to_train')
  assert.equal(summary.focusCapacity, 'full')
  assert.doesNotMatch(JSON.stringify(summary), /sleepHours|9000|hrv/)
})

test('recover path surfaces Today priority', () => {
  const summary = buildHealthReadinessFromMeasurements({
    now: NOW,
    health: [
      {
        date: day(0),
        hrv: 32,
        restingHR: 66,
        sleepHours: 4.2,
        steps: 2000,
      },
      ...history(),
    ],
    agent: { online: false },
  })
  assert.equal(summary.training.code, 'recover')
  assert.ok(['low', 'reduced'].includes(summary.focusCapacity))
  const priority = healthReadinessToTodayPriority(summary, {
    href: 'https://health.kenos.space/',
  })
  assert.equal(priority?.id, 'health-readiness')
  assert.equal(priority?.ownerDomain, 'health')
  const signal = healthReadinessToTodaySignal(summary)
  assert.equal(signal?.id, 'health')
  const text = formatHealthReadinessForAssistant(summary)
  assert.match(text, /focusCapacity/)
  assert.doesNotMatch(text, /4\.2|HRV 32/)
})

test('reject payloads that smuggle vitals', () => {
  const dirty = buildHealthReadinessSummary({
    dims: {
      energy: { level: 'good' },
      focus: { level: 'ok' },
      recovery: { level: 'ok' },
      stress: { level: 'ok' },
      sleepDebt: { level: 'ok' },
      physical: { level: 'ok' },
    },
    training: { code: 'ok_to_train', trained: false },
    headline: { k: 'state.h_allGood' },
  })
  const smuggled = { ...dirty, sleepHours: 7.5 }
  assert.equal(isSafeHealthReadiness(smuggled), false)
})

test('focusCapacityFromDims ranks worst driver', () => {
  assert.equal(
    focusCapacityFromDims({
      sleepDebt: { level: 'good' },
      stress: { level: 'bad' },
      recovery: { level: 'ok' },
      energy: { level: 'ok' },
      physical: { level: 'ok' },
    }),
    'low',
  )
})
