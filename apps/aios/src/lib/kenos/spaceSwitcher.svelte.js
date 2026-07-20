/**
 * Reactive Space Switcher store — wraps spaceSwitcher.core for AIOS shell.
 */
import { CLOUD } from '$lib/cloud.svelte.js'
import {
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

/** @type {import('./spaceSwitcher.core.js').SpaceSwitcherState} */
let state = $state(emptySpaceSwitcherState())
let hydrated = $state(false)

export const SPACE_SWITCHER = {
  get state() {
    return state
  },
  get hydrated() {
    return hydrated
  },
  get catalog() {
    return buildSpaceCatalog({ warn() {} })
  },
  get sections() {
    return buildSpaceSwitcherSections({
      catalog: buildSpaceCatalog({ warn() {} }),
      state,
      includeSystemReturn: true,
    })
  },
  get currentListKey() {
    return state.currentListKey
  },
}

function persist() {
  saveSpaceSwitcherState(state)
}

export function hydrateSpaceSwitcher() {
  state = bindSpaceSwitcherOwner(loadSpaceSwitcherState(), CLOUD.user?.id ?? null)
  hydrated = true
}

export function syncSpaceSwitcherOwner() {
  state = bindSpaceSwitcherOwner(state, CLOUD.user?.id ?? null)
  persist()
}

export function clearSpaceSwitcherOnLogout() {
  clearSpaceSwitcherState()
  state = emptySpaceSwitcherState()
}

/**
 * @param {string} pathname
 */
export function noteSpaceVisit(pathname) {
  const listKey = inferSpaceListKeyFromPath(pathname, SPACE_SWITCHER.catalog)
  state = touchRecentSpace(state, listKey)
  if (listKey.startsWith('hosted:')) {
    state = rememberSpaceRoute(state, listKey, { lastRoute: pathname })
  }
  persist()
}

/**
 * @param {import('./spaceSwitcher.core.js').SpaceEntry} space
 */
export function openSpaceFromSwitcher(space) {
  state = touchRecentSpace(state, space.listKey)
  persist()
  return resolveSpaceOpenHref(space, state)
}

/**
 * @param {string} listKey
 * @param {boolean} [pinned]
 */
export function togglePinnedSpace(listKey, pinned) {
  const next =
    pinned === undefined ? !state.pinned.includes(listKey) : pinned
  state = setPinnedSpace(state, listKey, next)
  persist()
}
