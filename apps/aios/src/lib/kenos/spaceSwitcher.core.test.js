import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SPACE_CHROME_MODES,
  SPACE_SWITCHER_STORAGE_KEY,
  SYSTEM_RETURN_LIST_KEY,
  annotateSpaceWithResume,
  applySpaceVisit,
  bindSpaceSwitcherOwner,
  buildSpaceCatalog,
  buildSpaceSwitcherSections,
  clearSpaceSwitcherState,
  emptySpaceSwitcherState,
  forgetSpaceResume,
  formatResumeRelativeTime,
  inferSpaceListKeyFromPath,
  loadSpaceSwitcherState,
  normalizeSpaceChromeMode,
  normalizeSpaceSwitcherState,
  rememberSpaceRoute,
  resolveSpaceOpenHref,
  saveSpaceSwitcherState,
  setPinnedSpace,
  touchRecentSpace,
} from './spaceSwitcher.core.js'

describe('spaceSwitcher.core', () => {
  it('builds catalog with hosted + optional external spaces', () => {
    const catalog = buildSpaceCatalog({ warn() {} })
    assert.ok(catalog.length >= 5)
    assert.ok(catalog.some((s) => s.listKey === 'hosted:work'))
    assert.ok(catalog.some((s) => s.listKey === 'hosted:plan'))
    assert.ok(catalog.some((s) => s.listKey === 'hosted:training'))
  })

  it('tracks recent spaces without fifth-tab pollution', () => {
    let state = emptySpaceSwitcherState()
    state = touchRecentSpace(state, 'hosted:training')
    state = touchRecentSpace(state, 'hosted:work')
    state = touchRecentSpace(state, 'hosted:training')
    assert.deepEqual(state.recent, ['hosted:training', 'hosted:work'])
    assert.equal(state.currentListKey, 'hosted:training')
  })

  it('remembers hosted resume routes and prefers them on open', () => {
    let state = emptySpaceSwitcherState()
    state = rememberSpaceRoute(state, 'hosted:work', {
      lastRoute: '/work?project=p1',
      selectedEntityId: 'p1',
    })
    const space = {
      listKey: 'hosted:work',
      id: 'work',
      label: 'Work',
      href: '/work',
      external: false,
    }
    assert.equal(resolveSpaceOpenHref(space, state), '/work?project=p1')
    assert.equal(
      resolveSpaceOpenHref(
        {
          listKey: 'external:other',
          id: 'other',
          label: 'Other',
          href: 'https://example.com',
          external: true,
        },
        state,
      ),
      'https://example.com',
    )
  })

  it('restores same-origin external deep links (Fitness / Planner)', () => {
    let state = emptySpaceSwitcherState()
    state = rememberSpaceRoute(state, 'external:training', {
      lastRoute: 'https://training.kenos.space/day/chest/focus',
      filter: 'Push Day · active',
    })
    state = rememberSpaceRoute(state, 'external:plan', {
      lastRoute: 'https://plan.kenos.space/upcoming',
      filter: '逾期任务',
    })
    assert.equal(
      resolveSpaceOpenHref(
        {
          listKey: 'external:training',
          id: 'training',
          label: 'Training',
          href: 'https://training.kenos.space',
          external: true,
        },
        state,
      ),
      'https://training.kenos.space/day/chest/focus',
    )
    assert.equal(
      resolveSpaceOpenHref(
        {
          listKey: 'external:plan',
          id: 'plan',
          label: 'Plan',
          href: 'https://plan.kenos.space',
          external: true,
        },
        state,
      ),
      'https://plan.kenos.space/upcoming',
    )
    // Cross-origin resume rejected
    state = rememberSpaceRoute(state, 'external:plan', {
      lastRoute: 'https://evil.example/phish',
    })
    assert.equal(
      resolveSpaceOpenHref(
        {
          listKey: 'external:plan',
          id: 'plan',
          label: 'Plan',
          href: 'https://plan.kenos.space',
          external: true,
        },
        state,
      ),
      'https://plan.kenos.space',
    )
  })

  it('hosted bridge can resume into known domain https URL', () => {
    let state = emptySpaceSwitcherState()
    state = rememberSpaceRoute(state, 'hosted:plan', {
      lastRoute: 'https://plan.kenos.space/upcoming',
      filter: 'Upcoming',
    })
    assert.equal(
      resolveSpaceOpenHref(
        {
          listKey: 'hosted:plan',
          id: 'plan',
          label: 'Plan',
          href: '/spaces/plan',
          external: false,
        },
        state,
      ),
      'https://plan.kenos.space/upcoming',
    )
  })

  it('does not clobber known-domain resume when visiting bridge path', () => {
    let state = emptySpaceSwitcherState()
    state = rememberSpaceRoute(state, 'hosted:plan', {
      lastRoute: 'https://plan.kenos.space/upcoming',
      filter: 'Upcoming',
    })
    state = applySpaceVisit(state, '/spaces/plan')
    assert.equal(
      state.resume['hosted:plan'].route,
      'https://plan.kenos.space/upcoming',
    )
    assert.equal(state.currentListKey, 'hosted:plan')
    assert.equal(state.recent[0], 'hosted:plan')
  })

  it('records in-app hosted route when no domain resume exists', () => {
    let state = applySpaceVisit(emptySpaceSwitcherState(), '/spaces/plan')
    assert.equal(state.resume['hosted:plan'].route, '/spaces/plan')
  })

  it('still updates resume for non-bridge hosted paths', () => {
    let state = rememberSpaceRoute(emptySpaceSwitcherState(), 'hosted:work', {
      lastRoute: '/work?project=old',
    })
    state = applySpaceVisit(state, '/work')
    assert.equal(state.resume['hosted:work'].route, '/work')
  })

  it('migrates legacy resume and isolates accounts / expires safely', () => {
    const now = Date.now()
    let state = normalizeSpaceSwitcherState(
      {
        ownerId: 'user-a',
        recent: ['hosted:plan'],
        pinned: [],
        resume: {
          'hosted:plan': {
            listKey: 'hosted:plan',
            lastRoute: 'https://plan.kenos.space/upcoming',
            selectedEntityId: 'task-1',
            filter: 'Overdue · task open',
            updatedAt: now - 1000,
          },
        },
      },
      { now },
    )
    assert.equal(state.resume['hosted:plan'].version, 1)
    assert.equal(state.resume['hosted:plan'].entityId, 'task-1')
    assert.equal(state.resume['hosted:plan'].displaySubtitle, 'Overdue · task open')
    assert.equal(state.resume['hosted:plan'].userId, 'user-a')

    state = bindSpaceSwitcherOwner(state, 'user-b')
    assert.equal(Object.keys(state.resume).length, 0)

    const expired = rememberSpaceRoute(emptySpaceSwitcherState(), 'hosted:training', {
      lastRoute: 'https://training.kenos.space/day/chest/focus',
      filter: 'Cable fly · Set 2 of 4',
      now: now - 1000,
      expiresAt: now - 500,
    })
    const href = resolveSpaceOpenHref(
      {
        listKey: 'hosted:training',
        id: 'training',
        label: 'Training',
        href: 'https://training.kenos.space/',
        external: false,
      },
      expired,
      { now },
    )
    assert.equal(href, 'https://training.kenos.space/')
  })

  it('switchSpace leads with System Today, then Pinned / Recent / All Domains', () => {
    let state = emptySpaceSwitcherState()
    state = touchRecentSpace(state, 'hosted:plan')
    state = setPinnedSpace(state, 'hosted:music', true)
    const catalog = buildSpaceCatalog({ warn() {} })
    const sections = buildSpaceSwitcherSections({
      catalog,
      state,
      mode: SPACE_CHROME_MODES.switchSpace,
    })
    assert.equal(sections[0].id, 'system')
    assert.equal(sections[0].items[0].listKey, SYSTEM_RETURN_LIST_KEY)
    assert.ok(sections.some((s) => s.id === 'pinned'))
    assert.ok(sections.some((s) => s.id === 'recent'))
    const all = sections.find((s) => s.id === 'all')
    assert.ok(all)
    assert.equal(all.title, 'All Domains')
    assert.equal(all.items.length, catalog.length)
  })

  it('continueRecent is Recent Spaces only — no All Domains dump', () => {
    let state = emptySpaceSwitcherState()
    state = touchRecentSpace(state, 'hosted:plan')
    state = setPinnedSpace(state, 'hosted:music', true)
    const catalog = buildSpaceCatalog({ warn() {} })
    const sections = buildSpaceSwitcherSections({
      catalog,
      state,
      mode: SPACE_CHROME_MODES.continueRecent,
    })
    assert.equal(sections.length, 1)
    assert.equal(sections[0].id, 'recent')
    assert.equal(sections[0].title, 'Recent Spaces')
    assert.equal(sections.some((s) => s.id === 'all'), false)
    assert.equal(sections.some((s) => s.id === 'system'), false)
    assert.equal(sections.some((s) => s.id === 'pinned'), false)
  })

  it('quickSwitch keeps searchable Spaces + System Today', () => {
    let state = emptySpaceSwitcherState()
    state = touchRecentSpace(state, 'hosted:plan')
    const catalog = buildSpaceCatalog({ warn() {} })
    const sections = buildSpaceSwitcherSections({
      catalog,
      state,
      mode: SPACE_CHROME_MODES.quickSwitch,
    })
    assert.equal(sections[0].id, 'recent')
    const all = sections.find((s) => s.id === 'all')
    assert.ok(all)
    assert.equal(all.title, 'Spaces')
    assert.equal(all.items.length, catalog.length)
    const system = sections.find((s) => s.id === 'system')
    assert.ok(system)
    assert.equal(normalizeSpaceChromeMode('nope'), SPACE_CHROME_MODES.continueRecent)
  })

  it('keeps All Domains catalog-complete after demo-like recent seeding', () => {
    let state = emptySpaceSwitcherState()
    const catalog = buildSpaceCatalog({ warn() {} })
    for (const space of catalog) {
      state = touchRecentSpace(state, space.listKey)
    }
    const sections = buildSpaceSwitcherSections({
      catalog,
      state,
      mode: SPACE_CHROME_MODES.switchSpace,
      includeSystemReturn: false,
    })
    const all = sections.find((s) => s.id === 'all')
    assert.ok(all)
    assert.equal(all.items.length, catalog.length)
    assert.ok(catalog.length >= 6)
  })

  it('forgets resume entries and sanitizes expired Continue detail', () => {
    let state = emptySpaceSwitcherState()
    state = touchRecentSpace(state, 'hosted:training')
    state = rememberSpaceRoute(state, 'hosted:training', {
      lastRoute: 'https://training.kenos.space/day/x',
      displaySubtitle: 'Cable fly',
      entityId: 'demo-overdue-task',
      now: Date.now() - 1000,
      expiresAt: Date.now() - 500,
    })
    const sections = buildSpaceSwitcherSections({
      state,
      includeSystemReturn: false,
      now: Date.now(),
    })
    const recent = sections.find((s) => s.id === 'recent')
    assert.ok(recent?.items[0]?.expired)
    assert.match(String(recent.items[0].detail), /过期/)
    assert.doesNotMatch(String(recent.items[0].detail), /demo-overdue/)

    state = forgetSpaceResume(state, 'hosted:training')
    assert.equal(state.recent.includes('hosted:training'), false)
    assert.equal(state.resume['hosted:training'], undefined)
  })

  it('annotates recent rows with resume filter for Continue copy', () => {
    let state = emptySpaceSwitcherState()
    state = touchRecentSpace(state, 'hosted:training')
    state = rememberSpaceRoute(state, 'hosted:training', {
      lastRoute: '/spaces/training',
      filter: 'Push Day · mid-set',
    })
    const sections = buildSpaceSwitcherSections({
      state,
      includeSystemReturn: false,
    })
    const recent = sections.find((s) => s.id === 'recent')
    assert.ok(recent)
    assert.equal(recent.items[0].detail, 'Push Day · mid-set')
  })

  it('infers listKey from system and hosted paths', () => {
    assert.equal(inferSpaceListKeyFromPath('/'), SYSTEM_RETURN_LIST_KEY)
    assert.equal(
      inferSpaceListKeyFromPath('/assistant'),
      SYSTEM_RETURN_LIST_KEY,
    )
    assert.equal(inferSpaceListKeyFromPath('/spaces'), 'system:spaces')
    assert.equal(inferSpaceListKeyFromPath('/work'), 'hosted:work')
    assert.equal(
      inferSpaceListKeyFromPath('/spaces/training'),
      'hosted:training',
    )
  })

  it('clears on owner switch; auth-loading null keeps Continue; logout clears explicitly', () => {
    let state = touchRecentSpace(emptySpaceSwitcherState(), 'external:plan')
    state = bindSpaceSwitcherOwner(state, 'user-a')
    assert.equal(state.ownerId, 'user-a')
    assert.equal(state.recent.length, 1)
    state = bindSpaceSwitcherOwner(state, 'user-b')
    assert.equal(state.ownerId, 'user-b')
    assert.equal(state.recent.length, 0)

    state = touchRecentSpace(state, 'hosted:training')
    state = bindSpaceSwitcherOwner(state, 'user-b')
    // Auth still loading (null) must not wipe owned Continue store.
    const kept = bindSpaceSwitcherOwner(state, null)
    assert.equal(kept.ownerId, 'user-b')
    assert.equal(kept.recent.length, 1)

    /** @type {Record<string, string>} */
    const bag = {}
    const storage = {
      getItem: (k) => bag[k] ?? null,
      setItem: (k, v) => {
        bag[k] = v
      },
      removeItem: (k) => {
        delete bag[k]
      },
    }
    saveSpaceSwitcherState(kept, storage)
    clearSpaceSwitcherState(storage)
    const afterClear = loadSpaceSwitcherState(storage)
    assert.equal(afterClear.ownerId, null)
    assert.equal(afterClear.recent.length, 0)
  })

  it('persists and clears storage without leaking across clear', () => {
    /** @type {Record<string, string>} */
    const bag = {}
    const storage = {
      getItem: (k) => bag[k] ?? null,
      setItem: (k, v) => {
        bag[k] = v
      },
      removeItem: (k) => {
        delete bag[k]
      },
    }
    const state = touchRecentSpace(emptySpaceSwitcherState(), 'hosted:work')
    saveSpaceSwitcherState(state, storage)
    assert.ok(bag[SPACE_SWITCHER_STORAGE_KEY])
    const loaded = loadSpaceSwitcherState(storage)
    assert.deepEqual(loaded.recent, ['hosted:work'])
    clearSpaceSwitcherState(storage)
    assert.equal(bag[SPACE_SWITCHER_STORAGE_KEY], undefined)
  })

  it('formats relative resume time and annotates Continue detail', () => {
    const now = Date.now()
    assert.equal(
      formatResumeRelativeTime(now - 12 * 60 * 1000, now),
      '12 分钟前',
    )
    let state = emptySpaceSwitcherState()
    state = rememberSpaceRoute(state, 'hosted:training', {
      lastRoute: 'https://training.kenos.space/day/chest/focus',
      filter: 'Cable fly · Set 2 of 4',
      now: now - 12 * 60 * 1000,
    })
    const annotated = annotateSpaceWithResume(
      {
        listKey: 'hosted:training',
        id: 'training',
        label: 'Training',
        href: 'https://training.kenos.space/',
        detail: 'Fitness',
      },
      state,
    )
    assert.equal(annotated.detail, 'Cable fly · Set 2 of 4')
    assert.equal(annotated.resumeAt, '12 分钟前')
  })
})
