import assert from 'node:assert/strict'
import {
  ERROR_CATEGORY,
  toErrorCategory,
  describeError,
} from '../src/kenosErrorTaxonomy.js'

// canonical mapping of raw RPC/network codes
assert.equal(toErrorCategory('wrong_owner'), ERROR_CATEGORY.UNAUTHORIZED)
assert.equal(toErrorCategory('auth_required'), ERROR_CATEGORY.AUTH_EXPIRED)
assert.equal(toErrorCategory('schema_version_not_supported'), ERROR_CATEGORY.CONTRACT_MISMATCH)
assert.equal(toErrorCategory('stale_version'), ERROR_CATEGORY.CONFLICT)
assert.equal(toErrorCategory('action_id_reused'), ERROR_CATEGORY.DUPLICATE_REPLAY)
assert.equal(toErrorCategory('title_required'), ERROR_CATEGORY.VALIDATION)
assert.equal(toErrorCategory('fetch failed'), ERROR_CATEGORY.NETWORK_UNAVAILABLE)
assert.equal(toErrorCategory('unsupported_action:plan.foo'), ERROR_CATEGORY.CONTRACT_MISMATCH)
assert.equal(toErrorCategory('PGRST205'), ERROR_CATEGORY.MIGRATION_MISMATCH)
assert.equal(toErrorCategory(''), ERROR_CATEGORY.UNKNOWN)

// existing classifier outputs alias into the canonical set
assert.equal(toErrorCategory('rejected'), ERROR_CATEGORY.VALIDATION)
assert.equal(toErrorCategory('auth'), ERROR_CATEGORY.AUTH_EXPIRED)
assert.equal(toErrorCategory('permission_denied'), ERROR_CATEGORY.UNAUTHORIZED)
assert.equal(toErrorCategory('offline'), ERROR_CATEGORY.NETWORK_UNAVAILABLE)

// describeError carries retry + recovery guidance, never raw text
const d = describeError('auth_required')
assert.equal(d.retryable, true)
assert.equal(d.needsAuth, true)
assert.ok(typeof d.recovery === 'string' && d.recovery.length > 0)
const v = describeError('title_required')
assert.equal(v.retryable, false)

console.log('kenosErrorTaxonomy.test.mjs: ok')
