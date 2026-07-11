import assert from 'node:assert/strict'
import { formatFitnessTodaySummary } from '../src/lib/todaySummaryFormat.js'

function caseA() {
  const copy = formatFitnessTodaySummary({
    workedOutToday: true,
    todayCompleted: true,
    todayDayId: 'chest',
    lastSessionDate: '2026-07-10',
    lastDayId: 'chest',
  })
  assert.equal(copy.kicker, '今日训练')
  assert.equal(copy.value, '今日已练 · 胸')
  assert.equal(copy.detail, '今日训练已完成')
  assert.equal(copy.empty, false)
}

function caseB() {
  const copy = formatFitnessTodaySummary({
    workedOutToday: true,
    todayCompleted: false,
    todayDayId: 'back',
    lastSessionDate: '2026-07-09',
    lastDayId: 'back',
  })
  assert.equal(copy.value, '今日训练中 · 背')
  assert.equal(copy.detail, '已完成部分组次')
  assert.equal(copy.empty, false)
}

function caseC() {
  const copy = formatFitnessTodaySummary({
    workedOutToday: false,
    todayCompleted: false,
    lastSessionDate: '2026-07-09',
    lastDayId: 'legs',
  })
  assert.equal(copy.value, '今日尚未训练')
  assert.equal(copy.detail, '上次：腿 · 7/9')
  assert.equal(copy.empty, true)
}

function caseD() {
  const copy = formatFitnessTodaySummary({
    workedOutToday: false,
    todayCompleted: false,
  })
  assert.equal(copy.value, '今日尚未训练')
  assert.equal(copy.detail, '打开 Fitness 开始训练')
  assert.equal(copy.empty, true)
}

function legacyLastSessionFields() {
  const copy = formatFitnessTodaySummary({
    workedOutToday: false,
    todayCompleted: false,
    sessionDate: '2026-07-08',
    dayId: 'arms',
  })
  assert.equal(copy.detail, '上次：臂 · 7/8')
}

function nullFitnessPayload() {
  const copy = formatFitnessTodaySummary(null)
  assert.equal(copy.value, '今日尚未训练')
  assert.equal(copy.detail, '打开 Fitness 开始训练')
}

caseA()
caseB()
caseC()
caseD()
legacyLastSessionFields()
nullFitnessPayload()

console.log('todaySummary formatter: all checks passed')
