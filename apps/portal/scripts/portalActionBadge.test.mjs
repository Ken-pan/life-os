import assert from 'node:assert/strict'
import {
  countPortalActionBadge,
  isOpenFinanceBillTask,
  shadowPortalActionBadgeWithCanonicalApprovals,
} from '../src/lib/portalActionBadge.js'

assert.equal(
  isOpenFinanceBillTask({
    completed: false,
    deletedAt: null,
    meta: { lifeEventRef: { domain: 'finance', occurrenceId: 'o1' } },
  }),
  true,
)
assert.equal(
  isOpenFinanceBillTask({
    completed: true,
    meta: { lifeEventRef: { domain: 'finance', occurrenceId: 'o1' } },
  }),
  false,
)
assert.equal(
  isOpenFinanceBillTask({
    completed: false,
    meta: { lifeEventRef: { domain: 'fitness', sessionId: 's1' } },
  }),
  false,
)

assert.equal(
  countPortalActionBadge(
    [
      { type: 'finance.bill_due' },
      { type: 'fitness.workout_logged' },
      { type: 'core.task_captured' },
    ],
    [
      {
        data: {
          completed: false,
          meta: { lifeEventRef: { domain: 'finance', occurrenceId: 'a' } },
        },
      },
      {
        data: {
          completed: true,
          meta: { lifeEventRef: { domain: 'finance', occurrenceId: 'b' } },
        },
      },
    ],
  ),
  4,
)

assert.equal(
  countPortalActionBadge(
    [],
    [
      {
        data: {
          completed: false,
          meta: { lifeEventRef: { domain: 'finance', occurrenceId: 'a' } },
        },
      },
    ],
  ),
  1,
)

assert.equal(
  countPortalActionBadge(
    [],
    [
      {
        data: {
          completed: true,
          meta: { lifeEventRef: { domain: 'finance', occurrenceId: 'a' } },
        },
      },
    ],
  ),
  0,
)

assert.deepEqual(
  shadowPortalActionBadgeWithCanonicalApprovals({ legacyActionCount: 4, canonicalAvailable: false }),
  { legacyActionCount: 4, canonicalPendingCount: null, matches: null, category: 'unsupported_legacy_source' },
)
assert.deepEqual(
  shadowPortalActionBadgeWithCanonicalApprovals({
    legacyActionCount: 2,
    canonicalAvailable: true,
    canonicalApprovals: [{ status: 'pending' }, { status: 'pending' }, { status: 'expired' }],
  }),
  { legacyActionCount: 2, canonicalPendingCount: 2, matches: true, category: 'count_comparison_only' },
)

console.log('portalActionBadge.test.mjs: ok')
