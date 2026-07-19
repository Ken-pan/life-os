import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCapabilityRegistry, capabilityEmptyCopy } from './capabilityRegistry.core.js'
import { prodReadFlagSnapshot } from './prodReadFlags.core.js'
import { buildWorkReadTodayCards } from './workReadSource.core.js'
import {
  newCorrelationId,
  recordReadObservation,
  resetReadObservabilityForTests,
  snapshotReadObservability,
} from './readObservability.core.js'
import { readCanonicalFocusSource } from './focusReadSource.core.js'
import { readCanonicalWorkSource } from './workReadSource.core.js'
import { compareProjectionSets } from './readProjections.core.js'
import {
  SHADOW_SOURCE,
  attachSourceIdentity,
  legacyLocalFocusShadowFixture,
  legacyLocalWorkShadowFixture,
} from './shadowLegacyFixtures.js'

test('prod read flags default Off for Focus/Work/Today overlay', () => {
  const flags = prodReadFlagSnapshot({})
  assert.equal(flags.focus, false)
  assert.equal(flags.work, false)
  assert.equal(flags.todayOverlay, false)
  assert.equal(flags.planCommandWrite, false)
  assert.equal(flags.executor, false)
  assert.equal(flags.approvals, true)
})

test('capability registry never treats unavailable as empty zero', () => {
  const registry = buildCapabilityRegistry({
    flags: prodReadFlagSnapshot({}),
    sources: {
      work: { status: 'unsupported', source: 'public.kenos_list_work_projects' },
      focus: { status: 'unsupported', source: 'public.kenos_list_focus_contexts' },
      approvals: { status: 'empty', source: 'public.kenos_list_action_approvals', availableCount: 0 },
    },
    workFoundationEnabled: false,
    focusLocalActive: false,
  })
  const work = registry.byId['work.read']
  const copy = capabilityEmptyCopy(work)
  assert.equal(copy.kind, 'unavailable')
  assert.match(copy.body, /不会|不是/)
  assert.equal(registry.byId['approval.read'].surface, 'empty')
  assert.equal(registry.byId['plan.command'].surface, 'unavailable')
  assert.equal(registry.byId['executor.production'].surface, 'unavailable')
  assert.equal(registry.byId['work.write'].writesProduction, true)
})

test('work today cards keep ownerDomain and never include body', () => {
  const cards = buildWorkReadTodayCards({
    projects: [
      {
        id: 'p1',
        title: 'Alpha',
        safeSummary: 'safe',
        deepLink: '/work',
        entityRef: { id: 'p1', type: 'work.project', ownerDomain: 'work', ownerId: 'u1' },
        classification: 'work_confidential',
        source: 'public.kenos_list_work_projects',
      },
    ],
    proposals: [],
  })
  assert.equal(cards[0].ownerDomain, 'work')
  assert.equal(cards[0].executorAvailable, false)
  assert.equal(cards[0].body, undefined)
})

test('focus/work read sources stay unsupported when flags Off', async () => {
  const focus = await readCanonicalFocusSource({
    client: { rpc: async () => ({ data: [{ id: 'x' }], error: null }) },
    authorized: true,
    online: true,
    env: {},
  })
  assert.equal(focus.state.status, 'unsupported')
  assert.equal(focus.contexts.length, 0)

  const work = await readCanonicalWorkSource({
    client: { rpc: async () => ({ data: [{ id: 'x' }], error: null }) },
    authorized: true,
    online: true,
    env: {},
  })
  assert.equal(work.state.status, 'unsupported')
  assert.equal(work.projects.length, 0)
})

test('focus/work read sources call RPCs when flags On', async () => {
  const calls = []
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args })
      if (name === 'kenos_list_focus_contexts') {
        return {
          data: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              owner_id: '22222222-2222-4222-8222-222222222222',
              mode: 'deep_work',
              status: 'active',
              active_space: 'work',
              updated_at: new Date().toISOString(),
            },
          ],
          error: null,
        }
      }
      if (name === 'kenos_list_work_projects') {
        return {
          data: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              owner_id: '22222222-2222-4222-8222-222222222222',
              title: 'Prod Work',
              safe_summary: 'safe',
              status: 'active',
              updated_at: new Date().toISOString(),
            },
          ],
          error: null,
        }
      }
      if (name === 'kenos_list_work_action_proposals') {
        return { data: [], error: null }
      }
      return { data: null, error: { message: `unexpected ${name}` } }
    },
    from() {
      return {
        select() {
          return this
        },
        order() {
          return this
        },
        limit() {
          return Promise.resolve({ data: [], error: null })
        },
      }
    },
  }

  const focus = await readCanonicalFocusSource({
    client,
    authorized: true,
    online: true,
    env: { VITE_KENOS_PROD_READ_FOCUS: '1' },
  })
  assert.equal(focus.state.status, 'ready')
  assert.equal(focus.contexts[0].ownerDomain, 'focus')

  const work = await readCanonicalWorkSource({
    client,
    authorized: true,
    online: true,
    env: { VITE_KENOS_PROD_READ_WORK: '1' },
  })
  assert.equal(work.state.status, 'ready')
  assert.equal(work.cards[0].ownerDomain, 'work')
  assert.ok(calls.some((c) => c.name === 'kenos_list_focus_contexts'))
  assert.ok(calls.some((c) => c.name === 'kenos_list_work_projects'))
})

test('shadow compare uses independent legacy fixtures (not self)', () => {
  const mismatches = compareProjectionSets({
    comparisonType: 'local_focus_vs_kenos_focus',
    ownerDomain: 'focus',
    oldSourceId: SHADOW_SOURCE.legacyLocalFocus,
    newSourceId: SHADOW_SOURCE.kenosFocusContexts,
    oldItems: legacyLocalFocusShadowFixture(),
    newItems: attachSourceIdentity(
      [{ id: 'prod-focus-1', ownerDomain: 'focus', status: 'active', freshness: 'fresh', deepLink: '/focus' }],
      SHADOW_SOURCE.kenosFocusContexts,
    ),
  })
  assert.ok(mismatches.length >= 1)
  assert.notEqual(SHADOW_SOURCE.legacyLocalFocus, SHADOW_SOURCE.kenosFocusContexts)

  const workMismatches = compareProjectionSets({
    comparisonType: 'local_work_vs_kenos_work',
    ownerDomain: 'work',
    oldSourceId: SHADOW_SOURCE.legacyLocalWork,
    newSourceId: SHADOW_SOURCE.kenosWorkProjects,
    oldItems: legacyLocalWorkShadowFixture(),
    newItems: attachSourceIdentity([], SHADOW_SOURCE.kenosWorkProjects),
  })
  assert.ok(Array.isArray(workMismatches))
})

test('observability records redacted counters only', () => {
  resetReadObservabilityForTests()
  const id = newCorrelationId('test')
  recordReadObservation({
    domain: 'work',
    source: 'public.kenos_list_work_projects',
    status: 'empty',
    latencyMs: 12,
    correlationId: id,
    flagOn: true,
  })
  const snap = snapshotReadObservability()
  assert.equal(snap.counters['read:work:empty'].count, 1)
  assert.ok(!JSON.stringify(snap).includes('password'))
})
