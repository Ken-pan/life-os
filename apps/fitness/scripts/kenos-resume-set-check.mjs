#!/usr/bin/env node
/**
 * Continuity: kenosSet resume must land getCurrentSet on the requested set.
 */
import assert from 'node:assert/strict'
import { S } from '../src/lib/state.svelte.js'
import {
  getCurrentSet,
  getExLog,
  ensureResumeCurrentSet,
  completeSet,
} from '../src/lib/session.js'

const dayId = 'chest'
const exId = 'c_fly'
const totalSets = 3

// Isolate today's log bucket without wiping unrelated state shape.
const today = new Date()
const y = today.getFullYear()
const m = String(today.getMonth() + 1).padStart(2, '0')
const d = String(today.getDate()).padStart(2, '0')
const dateK = `${y}-${m}-${d}`
const key = `${dateK}|${dayId}`

if (!S.logs) S.logs = {}
S.logs[key] = {}
if (!S.sessionMeta) S.sessionMeta = {}
delete S.sessionMeta[key]

assert.equal(getCurrentSet(dayId, exId, totalSets, dateK), 1, 'fresh → set 1')

const landed = ensureResumeCurrentSet(dayId, exId, 2, dateK)
assert.equal(landed, 2, 'kenosSet=2 must land on set 2')
assert.equal(getExLog(dayId, exId, totalSets, dateK).done, 1)

const again = ensureResumeCurrentSet(dayId, exId, 2, dateK)
assert.equal(again, 2, 'idempotent when already at set 2')
assert.equal(getExLog(dayId, exId, totalSets, dateK).done, 1, 'must not inflate done')

completeSet(dayId, exId, 2, { reps: 12 }, dateK)
assert.equal(getCurrentSet(dayId, exId, totalSets, dateK), 3)
const stay = ensureResumeCurrentSet(dayId, exId, 2, dateK)
assert.equal(stay, 3, 'never reduce progress when target is behind real log')

const to3 = ensureResumeCurrentSet(dayId, exId, 3, dateK)
assert.equal(to3, 3)

// Continuity pin: deep-link may trim stale ahead-of-target logs (cloud merge race).
completeSet(dayId, exId, 3, { reps: 12 }, dateK)
assert.equal(getCurrentSet(dayId, exId, totalSets, dateK), null)
const pinned = ensureResumeCurrentSet(dayId, exId, 2, dateK, { pin: true })
assert.equal(pinned, 2, 'pin:true must land Continuity handoff set')
assert.equal(getExLog(dayId, exId, totalSets, dateK).done, 1)

console.log('✓ kenosSet resume ensureResumeCurrentSet OK')
