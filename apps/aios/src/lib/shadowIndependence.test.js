import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compareProjectionSets } from './kenos/readProjections.core.js'
import {
  SHADOW_SOURCE,
  attachSourceIdentity,
  legacyLifeEventsActivityShadowFixture,
  legacyPortalPendingShadowFixture,
} from './kenos/shadowLegacyFixtures.js'

describe('shadow independence fixtures', () => {
  it('keeps legacy inbox fixtures distinct from Kenos projection source IDs', () => {
    const legacy = legacyPortalPendingShadowFixture()
    const kenos = attachSourceIdentity(
      [{ id: 'kenos-1', ownerDomain: 'plan', status: 'open', freshness: 'fresh', deepLink: '/inbox', classification: 'personal' }],
      SHADOW_SOURCE.kenosInboxProjection,
    )
    assert.notEqual(legacy[0].sourceIdentity, kenos[0].sourceIdentity)
    const mismatches = compareProjectionSets({
      comparisonType: 'portal_pending_vs_assistant_inbox',
      oldSourceId: SHADOW_SOURCE.legacyPortalPending,
      newSourceId: SHADOW_SOURCE.kenosInboxProjection,
      oldItems: legacy,
      newItems: kenos,
    })
    assert.ok(mismatches.every((row) => row.category !== 'same_source_self_compare_invalid_evidence'))
    assert.ok(mismatches.some((row) => row.category === 'missing_in_new' || row.category === 'extra_in_new'))
  })

  it('keeps legacy activity fixtures independent', () => {
    const legacy = legacyLifeEventsActivityShadowFixture()
    assert.equal(legacy[0].sourceIdentity, SHADOW_SOURCE.legacyLifeEventsActivity)
  })
})
