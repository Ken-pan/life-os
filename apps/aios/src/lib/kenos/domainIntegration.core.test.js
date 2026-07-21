import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DOMAIN_ALIASES,
  DOMAIN_NAVIGATION_MANIFESTS,
  DOMAIN_REGISTRY,
  INTEGRATION_DOMAIN_ORDER,
  MAX_DOMAIN_DOCK_SLOTS,
  assertManifestSlotBudget,
  buildAssistantHandoffStub,
  buildContinueDescriptorStub,
  buildDomainLaunchResult,
  buildInboxSourceStub,
  buildTodaySummaryStub,
  canonicalizeDomainId,
  createDomainRuntimeState,
  domainIdFromContinuityUrl,
  getDomainDefinition,
  getDomainNavigationManifest,
  listShelfDomainDefinitions,
  projectShelfCard,
  searchQuickSwitchStub,
} from './domainIntegration.core.js'

describe('domainIntegration.core — registry', () => {
  it('registers kenos + reference + integration domains', () => {
    for (const id of [
      'kenos',
      'plan',
      'training',
      'work',
      'money',
      'library',
      'music',
      'home',
      'health',
      'paper',
    ]) {
      assert.ok(DOMAIN_REGISTRY[id], `missing ${id}`)
      assert.equal(DOMAIN_REGISTRY[id].id, id)
    }
  })

  it('reuses domainIdentity accents for plan/training/money', () => {
    assert.equal(DOMAIN_REGISTRY.plan.accent, '#C9A227')
    assert.equal(DOMAIN_REGISTRY.training.accent, '#C45C4A')
    assert.equal(DOMAIN_REGISTRY.money.accent, '#3D9B6E')
  })

  it('canonicalizes legacy aliases finance→money and knowledge→library', () => {
    assert.equal(canonicalizeDomainId('finance'), 'money')
    assert.equal(canonicalizeDomainId('financeos'), 'money')
    assert.equal(canonicalizeDomainId('knowledge'), 'library')
    assert.equal(canonicalizeDomainId('hosted:knowledge'), 'library')
    assert.equal(canonicalizeDomainId('hosted:money'), 'money')
    assert.equal(DOMAIN_ALIASES.fitness, 'training')
    assert.equal(getDomainDefinition('knowledge')?.id, 'library')
    assert.equal(getDomainDefinition('finance')?.id, 'money')
  })

  it('lists shelf domains without inventing dual Kenos entries', () => {
    const shelf = listShelfDomainDefinitions()
    assert.ok(shelf.every((d) => d.id !== 'kenos'))
    assert.ok(shelf.some((d) => d.id === 'plan'))
    assert.deepEqual(
      [...INTEGRATION_DOMAIN_ORDER],
      ['work', 'money', 'library', 'music', 'home', 'health', 'paper'],
    )
  })
})

describe('domainIntegration.core — navigation manifests', () => {
  it('keeps domain capsule slots ≤ 4 (Kenos chip is separate)', () => {
    for (const [id, manifest] of Object.entries(DOMAIN_NAVIGATION_MANIFESTS)) {
      const budget = assertManifestSlotBudget(manifest)
      assert.equal(budget.ok, true, `${id}: ${budget.reason}`)
      assert.ok(manifest.slots.length <= MAX_DOMAIN_DOCK_SLOTS)
      assert.equal(getDomainNavigationManifest(id)?.domainId, id)
    }
  })

  it('plan/training reference manifests match dock IA', () => {
    const plan = getDomainNavigationManifest('plan')
    assert.equal(plan.slots[0].title, 'Tasks')
    assert.equal(plan.slots[2].path, '/inbox')
    assert.equal(plan.slots[3].opensMore, true)
    const training = getDomainNavigationManifest('training')
    assert.equal(training.slots[1].path, '/session')
    assert.equal(training.slots[2].path, '/discover/records')
  })

  it('work manifest includes Focus + Inbox (no duplicate Today path)', () => {
    const work = getDomainNavigationManifest('work')
    assert.ok(work.slots.some((s) => s.path === '/spaces/work'))
    assert.ok(work.slots.some((s) => s.path === '/inbox'))
    const paths = work.slots.filter((s) => s.path).map((s) => s.path)
    assert.equal(new Set(paths).size, paths.length)
  })

  it('money/music/home use real app routes', () => {
    const money = getDomainNavigationManifest('money')
    assert.equal(money.slots[1].path, '/history/insights')
    assert.equal(money.slots[2].path, '/accounts')
    const music = getDomainNavigationManifest('music')
    assert.equal(music.slots[0].title, 'Home')
    assert.ok(music.more.some((m) => m.path === '/browse'))
    const home = getDomainNavigationManifest('home')
    assert.deepEqual(
      home.slots.filter((s) => s.path).map((s) => s.path),
      ['/plan', '/storage', '/tidy'],
    )
    assert.deepEqual(
      home.slots.map((s) => s.title),
      ['Rooms', 'Items', 'Organize', 'More'],
    )
    assert.ok(home.more.some((m) => m.path === 'homescan://scan'))
    assert.ok(home.more.some((m) => m.path === 'homescan://find'))
    assert.ok(home.more.some((m) => m.path === 'homescan://container'))
    assert.equal(DOMAIN_REGISTRY.home.homePath, '/plan')
    assert.equal(DOMAIN_REGISTRY.home.privacy, 'sensitive')
  })
})

describe('domainIntegration.core — launch + runtime', () => {
  it('builds embedded_url launch results for Plan/Money', () => {
    const plan = buildDomainLaunchResult('plan', {
      localDailyBeta: true,
      host: '10.0.0.1',
    })
    assert.equal(plan.kind, 'embedded_url')
    assert.equal(plan.domainId, 'plan')
    assert.match(plan.url, /^http:\/\/10\.0\.0\.1:5188\//)

    const money = buildDomainLaunchResult('finance')
    assert.equal(money.domainId, 'money')
    assert.equal(money.kind, 'embedded_url')
    assert.match(money.url, /finance\.kenos\.space/)
  })

  it('builds kenos_tab and paper missing shapes', () => {
    const kenos = buildDomainLaunchResult('kenos')
    assert.equal(kenos.kind, 'kenos_tab')
    assert.equal(kenos.tab, 'today')

    const paper = buildDomainLaunchResult('paper')
    assert.ok(paper.kind === 'hosted_route' || paper.kind === 'unavailable')
    assert.equal(paper.domainId, 'paper')
  })

  it('creates serializable runtime state without views', () => {
    const state = createDomainRuntimeState('training')
    assert.equal(state.domainId, 'training')
    assert.equal(state.shellMode, 'kenos')
    assert.equal(state.focusActive, false)
    assert.ok(!('view' in state))
  })

  it('resolves domain id from Continuity URLs', () => {
    assert.equal(
      domainIdFromContinuityUrl('http://10.20.202.15:5188/upcoming'),
      'plan',
    )
    assert.equal(
      domainIdFromContinuityUrl('https://fitness.kenos.space/session'),
      'training',
    )
    assert.equal(
      domainIdFromContinuityUrl('http://127.0.0.1:5219/work'),
      'work',
    )
    assert.equal(
      domainIdFromContinuityUrl('https://knowledge.kenos.space/library'),
      'library',
    )
  })
})

describe('domainIntegration.core — provider stubs', () => {
  it('continue / shelf / today / inbox / assistant / quickSwitch stubs', () => {
    const cont = buildContinueDescriptorStub('plan', { route: '/upcoming' })
    assert.equal(cont.spaceId, 'plan')
    assert.equal(cont.route, '/upcoming')

    const card = projectShelfCard('training', { isCurrent: true })
    assert.equal(card.isCurrent, true)
    assert.equal(card.systemImage, 'figure.strengthtraining.traditional')

    assert.equal(buildTodaySummaryStub('plan')?.domainId, 'plan')
    assert.equal(buildInboxSourceStub('work')?.sourceId, 'work.inbox')
    assert.equal(buildAssistantHandoffStub('work')?.scope, 'work')

    const hits = searchQuickSwitchStub('mon')
    assert.ok(hits.some((h) => h.domainId === 'money'))
  })
})
