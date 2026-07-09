import assert from 'node:assert/strict'
import test from 'node:test'
import { reminderFireAtMs, selectDueReminderJobs } from '../server/reminderSchedule.mjs'

test('reminderFireAtMs respects dueTime and reminderMinutes', () => {
  const task = {
    id: 't1',
    title: 'Standup',
    dueDate: '2026-07-10',
    dueTime: '10:00',
    reminderMinutes: 15,
    completed: false,
  }
  const fireAt = reminderFireAtMs(task, Date.parse('2026-07-10T08:00:00'))
  assert.equal(fireAt, Date.parse('2026-07-10T09:45:00'))
})

test('selectDueReminderJobs filters to active window', () => {
  const now = Date.parse('2026-07-10T09:44:00')
  const jobs = selectDueReminderJobs(
    [
      {
        id: 'due',
        title: 'Due soon',
        dueDate: '2026-07-10',
        dueTime: '10:00',
        reminderMinutes: 15,
        completed: false,
      },
      {
        id: 'later',
        title: 'Later',
        dueDate: '2026-07-11',
        reminderMinutes: 15,
        completed: false,
      },
    ],
    { now },
  )
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].id, 'due')
})
