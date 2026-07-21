#!/usr/bin/env node
/**
 * recordedSessionMinutes / sessionDuration — open Focus early must not
 * inflate History to hundreds of minutes.
 */
import assert from 'node:assert/strict'
import { S } from '../src/lib/state.svelte.js'
import { recordedSessionMinutes, sessionDuration } from '../src/lib/session.js'

const dayId = 'chest'
const dateK = '2026-07-21'
const key = `${dateK}|${dayId}`

const earlyOpen = '2026-07-21T08:00:00.000Z'
const firstSet = '2026-07-21T19:00:00.000Z'
const lastSet = '2026-07-21T19:45:00.000Z'
const ended = '2026-07-21T19:50:00.000Z'

S.logs = {
  [key]: {
    bench: {
      done: 2,
      sets: [
        { reps: 8, ts: firstSet },
        { reps: 7, ts: lastSet },
      ],
    },
  },
}
S.sessionMeta = {
  [key]: { startedAt: earlyOpen },
}

const openMins = recordedSessionMinutes(dayId, dateK)
assert.equal(
  openMins,
  45,
  `open session should be first→last set, got ${openMins}`,
)
assert.equal(
  sessionDuration(dayId, dateK),
  45,
  'sessionDuration should match recorded when sets exist',
)

S.sessionMeta[key].endedAt = ended
const closedMins = recordedSessionMinutes(dayId, dateK)
assert.equal(
  closedMins,
  50,
  `ended session should use endedAt, got ${closedMins}`,
)

// No sets — fall back to meta window (live clock for sessionDuration only)
S.logs = { [key]: {} }
S.sessionMeta = { [key]: { startedAt: earlyOpen, endedAt: ended } }
assert.equal(
  recordedSessionMinutes(dayId, dateK),
  710,
  'meta-only closed session uses startedAt→endedAt',
)

console.log('✓ session duration window OK')
