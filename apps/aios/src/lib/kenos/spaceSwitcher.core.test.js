import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SPACE_SWITCHER_STORAGE_KEY,
  SYSTEM_RETURN_LIST_KEY,
  bindSpaceSwitcherOwner,
  buildSpaceCatalog,
  buildSpaceSwitcherSections,
  clearSpaceSwitcherState,
  emptySpaceSwitcherState,
  inferSpaceListKeyFromPath,
  loadSpaceSwitcherState,
  rememberSpaceRoute,
  resolveSpaceOpenHref,
  saveSpaceSwitcherState,
  setPinnedSpace,
  touchRecentSpace,
} from './spaceSwitcher.core.js'

describe('spaceSwitcher.core', () => {
  it('builds catalog with hosted + external spaces', () => {
    const catalog = buildSpaceCatalog({ warn() {} })
    assert.ok(catalog.length >= 5)
    assert.ok(catalog.some((s) => s.listKey === 'hosted:work'))
    assert.ok(catalog.some((s) => s.listKey === 'external:plan'))
  })

  it('tracks recent spaces without fifth-tab pollution', () => {
    let state = emptySpaceSwitcherState()
    state = touchRecentSpace(state, 'external:training')
    state = touchRecentSpace(state, 'hosted:work')
    state = touchRecentSpace(state, 'external:training')
    assert.deepEqual(state.recent, ['external:training', 'hosted:work'])
    assert.equal(state.currentListKey, 'external:training')
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
      resolveSpaceOpenHref({ ...space, external: true, href: 'https://example.com' }, state),
      'https://example.com',
    )
  })

  it('pins and sections include system return + recent + all', () => {
    let state = emptySpaceSwitcherState()
    state = touchRecentSpace(state, 'external:plan')
    state = setPinnedSpace(state, 'external:music', true)
    const sections = buildSpaceSwitcherSections({ state, includeSystemReturn: true })
    assert.equal(sections[0].id, 'system')
    assert.ok(sections[0].items.some((i) => i.listKey === SYSTEM_RETURN_LIST_KEY))
    assert.ok(sections.some((s) => s.id === 'recent'))
    assert.ok(sections.some((s) => s.id === 'pinned'))
    assert.ok(sections.some((s) => s.id === 'all'))
  })

  it('infers listKey from system and hosted paths', () => {
    assert.equal(inferSpaceListKeyFromPath('/'), SYSTEM_RETURN_LIST_KEY)
    assert.equal(inferSpaceListKeyFromPath('/assistant'), SYSTEM_RETURN_LIST_KEY)
    assert.equal(inferSpaceListKeyFromPath('/spaces'), 'system:spaces')
    assert.equal(inferSpaceListKeyFromPath('/work'), 'hosted:work')
    assert.equal(inferSpaceListKeyFromPath('/spaces/training'), 'hosted:training')
  })

  it('clears on owner switch and logout', () => {
    let state = touchRecentSpace(emptySpaceSwitcherState(), 'external:plan')
    state = bindSpaceSwitcherOwner(state, 'user-a')
    assert.equal(state.ownerId, 'user-a')
    assert.equal(state.recent.length, 1)
    state = bindSpaceSwitcherOwner(state, 'user-b')
    assert.equal(state.ownerId, 'user-b')
    assert.equal(state.recent.length, 0)
    state = bindSpaceSwitcherOwner(state, null)
    assert.equal(state.ownerId, null)
    assert.equal(state.recent.length, 0)
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
})
