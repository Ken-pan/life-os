/**
 * Reactive Space Switcher store — wraps spaceSwitcher.core for AIOS shell.
 * Chrome modes: Continue / Switch Space. Quick Switch UI is retired — space
 * switching is Shelf-only; openQuickSwitchSheet redirects to Switch Space.
 */
import { CLOUD } from '$lib/cloud.svelte.js'
import {
  SPACE_CHROME_MODES,
  applySpaceVisit,
  bindSpaceSwitcherOwner,
  buildSpaceCatalog,
  buildSpaceSwitcherSections,
  clearSpaceSwitcherState,
  emptySpaceSwitcherState,
  forgetSpaceResume,
  loadSpaceSwitcherState,
  normalizeSpaceChromeMode,
  rememberSpaceRoute,
  resolveSpaceOpenHref,
  saveSpaceSwitcherState,
  setPinnedSpace,
  touchRecentSpace,
  upsertResumeDescriptor,
} from './spaceSwitcher.core.js'
import {
  DOMAIN_RESUME_DEFAULTS,
  FITNESS_ACTIVE_RESUME,
} from './domainResume.core.js'
import {
  decodeResumeHandoff,
} from '@life-os/platform-web/kenos-space-continuity'

/** @type {import('./spaceSwitcher.core.js').SpaceSwitcherState} */
let state = $state(emptySpaceSwitcherState())
let hydrated = $state(false)
let sheetOpen = $state(false)
/** @type {import('./spaceSwitcher.core.js').SpaceChromeMode} */
let chromeMode = $state(SPACE_CHROME_MODES.continueRecent)
/** Last Continue control — preferred focus restore when Escape/scrim closes after Cmd+. */
/** @type {HTMLElement | null} */
let lastTriggerEl = null

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
  get chromeMode() {
    return chromeMode
  },
  get sections() {
    return buildSpaceSwitcherSections({
      catalog: buildSpaceCatalog({ warn() {} }),
      state,
      mode: chromeMode,
    })
  },
  /** Always Recent strip for chrome (sidebar / Today) — independent of open sheet mode. */
  get recentItems() {
    return (
      buildSpaceSwitcherSections({
        catalog: buildSpaceCatalog({ warn() {} }),
        state,
        mode: SPACE_CHROME_MODES.continueRecent,
      }).find((s) => s.id === 'recent')?.items ?? []
    )
  },
  get currentListKey() {
    return state.currentListKey
  },
  get recentCount() {
    return state.recent.length
  },
  get sheetOpen() {
    return sheetOpen
  },
  set sheetOpen(value) {
    sheetOpen = Boolean(value)
  },
  get lastTriggerEl() {
    return lastTriggerEl
  },
}

/**
 * Capture last trigger for focus restore after sheet close.
 * @param {{ trigger?: EventTarget | null } | Event | undefined} opts
 */
function captureTrigger(opts) {
  if (opts instanceof Event) {
    const t = opts.currentTarget
    if (t instanceof HTMLElement) lastTriggerEl = t
    return
  }
  const trigger = opts?.trigger
  if (trigger instanceof HTMLElement) {
    lastTriggerEl = trigger
    return
  }
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
    const active = document.activeElement
    if (
      active.matches(
        '[data-testid="kenos-space-switcher-fab"], [data-testid="kenos-space-switcher-trigger"], [data-testid="kenos-space-switcher-sidebar"], [data-testid="kenos-switch-space-trigger"], [data-testid="kenos-quick-switch-trigger"], .space-switcher-trigger',
      )
    ) {
      lastTriggerEl = active
    }
  }
}

/**
 * Open chrome sheet in a specific mode (default Continue = recent-only).
 * @param {{
 *   mode?: import('./spaceSwitcher.core.js').SpaceChromeMode | string,
 *   trigger?: EventTarget | null,
 * } | Event} [opts]
 */
export function openSpaceSwitcherSheet(opts = {}) {
  if (opts instanceof Event) {
    captureTrigger(opts)
    chromeMode = SPACE_CHROME_MODES.continueRecent
  } else {
    captureTrigger(opts)
    chromeMode = normalizeSpaceChromeMode(opts?.mode)
  }
  sheetOpen = true
}

/** Continue = Recent resumes / Recent Spaces only. */
export function openContinueSheet(opts = {}) {
  if (opts instanceof Event) {
    openSpaceSwitcherSheet(opts)
    return
  }
  openSpaceSwitcherSheet({ ...opts, mode: SPACE_CHROME_MODES.continueRecent })
}

/** Switch Space = Pinned + Recent + All Domains (+ System Today). */
export function openSwitchSpaceSheet(opts = {}) {
  if (opts instanceof Event) {
    captureTrigger(opts)
    chromeMode = SPACE_CHROME_MODES.switchSpace
    sheetOpen = true
    return
  }
  openSpaceSwitcherSheet({ ...opts, mode: SPACE_CHROME_MODES.switchSpace })
}

/**
 * Legacy API: Quick Switch UI is retired (Shelf-only space switching).
 * Redirects to Switch Space so leftover callers stay safe.
 */
export function openQuickSwitchSheet(opts = {}) {
  openSwitchSpaceSheet(opts)
}

export function closeSpaceSwitcherSheet() {
  sheetOpen = false
}

/** @returns {HTMLElement | null} */
export function consumeSpaceSwitcherTrigger() {
  const el = lastTriggerEl
  return el?.isConnected ? el : null
}

function persist() {
  saveSpaceSwitcherState(state)
}

function isKenosDemo() {
  if (typeof window === 'undefined') return false
  try {
    if (localStorage.getItem('aios_demo') === '1') return true
    if (localStorage.getItem('kenos_phase2_demo') === '1') return true
    return new URLSearchParams(window.location.search).get('kenosDemo') === '1'
  } catch {
    return false
  }
}

/** Seed Recent so Continue has a real story in local demo (not production). */
function seedDemoRecentIfNeeded() {
  if (!isKenosDemo() || state.recent.length) return
  const now = Date.now()
  const offsets = {
    'hosted:training': 12 * 60 * 1000,
    'hosted:plan': 45 * 60 * 1000,
    'hosted:money': 2 * 60 * 60 * 1000,
    'hosted:music': 5 * 60 * 60 * 1000,
    'hosted:home': 26 * 60 * 60 * 1000,
    'hosted:knowledge': 3 * 24 * 60 * 60 * 1000,
    'hosted:work': 4 * 24 * 60 * 60 * 1000,
  }
  for (const [listKey, resume] of Object.entries(DOMAIN_RESUME_DEFAULTS)) {
    state = touchRecentSpace(state, listKey, {
      now: now - (offsets[listKey] ?? 60 * 60 * 1000),
    })
    state = rememberSpaceRoute(state, listKey, {
      ...resume,
      now: now - (offsets[listKey] ?? 60 * 60 * 1000),
    })
  }
  // Most recent: Fitness active workout with rich substate
  state = touchRecentSpace(state, FITNESS_ACTIVE_RESUME.listKey, {
    now: now - 12 * 60 * 1000,
  })
  state = rememberSpaceRoute(state, FITNESS_ACTIVE_RESUME.listKey, {
    ...FITNESS_ACTIVE_RESUME,
    displayTitle: 'Training',
    displaySubtitle: FITNESS_ACTIVE_RESUME.filter,
    entityId: 'c_fly',
    substate: {
      exerciseId: 'c_fly',
      set: 2,
      progress: 'Set 2 of 4',
      filter: FITNESS_ACTIVE_RESUME.filter,
    },
    now: now - 12 * 60 * 1000,
  })
  state = rememberSpaceRoute(state, 'hosted:plan', {
    lastRoute: DOMAIN_RESUME_DEFAULTS['hosted:plan'].lastRoute,
    displayTitle: 'Plan',
    displaySubtitle: 'Upcoming · Overdue · 测试任务',
    filter: 'Upcoming · Overdue · 测试任务',
    entityId: 'demo-overdue-task',
    substate: {
      filter: 'overdue',
      detailOpen: true,
      progress: '任务详情已打开',
    },
    now: now - 45 * 60 * 1000,
  })
  persist()
}

/**
 * Remember an external deep link before opening (state-restored deep link).
 * @param {string} listKey
 * @param {{ lastRoute: string, filter?: string | null, selectedEntityId?: string | null, entityId?: string | null, displayTitle?: string, displaySubtitle?: string | null, substate?: Record<string, unknown> }} patch
 */
export function rememberExternalResume(listKey, patch) {
  state = touchRecentSpace(state, listKey)
  state = rememberSpaceRoute(state, listKey, patch)
  persist()
}

/**
 * Ingest ResumeDescriptor from domain Continue handoff (?kenosResume=).
 * @param {string | null | undefined} encoded
 * @param {{ openSheet?: boolean }} [opts]
 */
export function ingestResumeHandoff(encoded, { openSheet = false } = {}) {
  const descriptor = decodeResumeHandoff(encoded || '')
  if (!descriptor) return false
  state = upsertResumeDescriptor(state, {
    ...descriptor,
    userId: CLOUD.user?.id || descriptor.userId,
  })
  persist()
  if (openSheet) {
    chromeMode = SPACE_CHROME_MODES.continueRecent
    sheetOpen = true
  }
  return true
}

/**
 * Consume URL handoff params once (kenosResume / openContinue).
 */
export function consumeContinueHandoffFromUrl() {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    const encoded = url.searchParams.get('kenosResume')
    const open = url.searchParams.get('openContinue') === '1'
    if (!encoded && !open) return
    if (encoded) ingestResumeHandoff(encoded, { openSheet: open })
    else if (open) {
      chromeMode = SPACE_CHROME_MODES.continueRecent
      sheetOpen = true
    }
    url.searchParams.delete('kenosResume')
    url.searchParams.delete('openContinue')
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', next || '/')
  } catch {
    /* ignore */
  }
}

export function hydrateSpaceSwitcher() {
  state = bindSpaceSwitcherOwner(
    loadSpaceSwitcherState(),
    CLOUD.user?.id ?? null,
  )
  seedDemoRecentIfNeeded()
  consumeContinueHandoffFromUrl()
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
  state = applySpaceVisit(state, pathname, SPACE_SWITCHER.catalog)
  persist()
}

/**
 * @param {import('./spaceSwitcher.core.js').SpaceEntry} space
 */
export function openSpaceFromSwitcher(space) {
  state = touchRecentSpace(state, space.listKey)
  const href = resolveSpaceOpenHref(space, state)
  state = rememberSpaceRoute(state, space.listKey, {
    lastRoute: href,
    filter: space.detail || state.resume[space.listKey]?.displaySubtitle || null,
    displaySubtitle:
      space.detail || state.resume[space.listKey]?.displaySubtitle || null,
  })
  persist()
  return href
}

/**
 * Navigate or window.open using the same resume rules as Continue.
 * Guards against duplicate rapid clicks (single navigation).
 * @param {import('./spaceSwitcher.core.js').SpaceEntry} space
 * @param {{ goto?: (href: string) => unknown }} [nav]
 * @returns {string} resolved href
 */
let launchInFlight = false
let launchInFlightUntil = 0

export function launchSpace(space, nav = {}) {
  const now = Date.now()
  if (launchInFlight && now < launchInFlightUntil) {
    return resolveSpaceOpenHref(space, state)
  }
  launchInFlight = true
  launchInFlightUntil = now + 700
  try {
    const href = openSpaceFromSwitcher(space)
    if (space.external || /^https?:\/\//i.test(href)) {
      if (typeof window !== 'undefined') {
        window.location.assign(href)
      }
      return href
    }
    if (typeof nav.goto === 'function') {
      void nav.goto(href)
    }
    return href
  } finally {
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        launchInFlight = false
      }, 700)
    } else {
      launchInFlight = false
    }
  }
}

/**
 * Remove expired / unwanted Continue resume from store.
 * @param {string} listKey
 */
export function dismissSpaceResume(listKey) {
  state = forgetSpaceResume(state, listKey)
  persist()
}

/**
 * @param {string} listKey
 * @param {boolean} [pinned]
 */
export function togglePinnedSpace(listKey, pinned) {
  const next = pinned === undefined ? !state.pinned.includes(listKey) : pinned
  state = setPinnedSpace(state, listKey, next)
  persist()
}
