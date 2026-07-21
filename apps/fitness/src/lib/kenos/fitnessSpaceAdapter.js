/**
 * Fitness Space Continuity adapter — Active Workout resume via deep-link query.
 * Native FocusSession UI; no simplified Fitness chrome in Kenos.
 */
import { browser } from '$app/environment'
import {
  buildResumeDescriptor,
  buildKenosContinueHandoffUrl,
  clearDomainContinue,
  writeDomainContinue,
  resolveKenosOrigin,
  resumeDescriptorToOpenUrl,
} from '@life-os/platform-web/kenos-space-continuity'
import {
  installNavManifestPublisher,
  publishNavManifest,
} from '@life-os/platform-web/kenos-native-bridge'
import { sensory } from '@life-os/platform-web/kenos-sensory'
import { auth } from '$lib/auth.svelte.js'
import {
  getCurrentSet,
  getSessionExercises,
  getSessionProgress,
  getSessionTimes,
  getExLog,
  loadFocusCursor,
  saveFocusCursor,
  ensureResumeCurrentSet,
} from '$lib/session.js'
import { timer, startTimer, cancelTimer } from '$lib/timer.svelte.js'
import { todayDayId } from '$lib/state.svelte.js'
import { goto } from '$app/navigation'
import {
  fitnessToolSheet,
  knowledgeSheet,
  setLogSheet,
  skipModal,
  weightModal,
} from '$lib/ui.svelte.js'

export const FITNESS_SPACE_ID = 'training'
export const FITNESS_ACCENT = '#5B8DEF'
export const FITNESS_ICON = 'activity'

/**
 * @param {URL | Location | string} [url]
 */
export function readFitnessResumeQuery(
  url = browser ? window.location.href : '/',
) {
  try {
    const u =
      typeof url === 'string'
        ? new URL(url, 'https://local.invalid')
        : new URL(url.href)
    return {
      exerciseId: u.searchParams.get('kenosEx') || null,
      set: u.searchParams.get('kenosSet')
        ? Number(u.searchParams.get('kenosSet'))
        : null,
      timerRemain: u.searchParams.get('kenosTimerRemain')
        ? Number(u.searchParams.get('kenosTimerRemain'))
        : null,
      timerMode: u.searchParams.get('kenosTimerMode') || null,
      elapsedSec: u.searchParams.get('kenosElapsed')
        ? Number(u.searchParams.get('kenosElapsed'))
        : null,
    }
  } catch {
    return {
      exerciseId: null,
      set: null,
      timerRemain: null,
      timerMode: null,
      elapsedSec: null,
    }
  }
}

/**
 * @param {{
 *   dayId?: string,
 *   exIndex?: number,
 *   exerciseId?: string | null,
 *   pathname?: string,
 * }} [opts]
 */
export function suspendFitnessSpace(opts = {}) {
  const dayId = opts.dayId || (browser ? todayDayId() : 'chest')
  const pathname =
    opts.pathname ??
    (browser ? window.location.pathname : `/day/${dayId}/focus`)
  const queue = getSessionExercises(dayId)
  const progress = getSessionProgress(dayId)
  let exIndex = opts.exIndex ?? loadFocusCursor(dayId) ?? progress.exIndex ?? 0
  if (opts.exerciseId) {
    const idx = queue.findIndex((ex) => ex.id === opts.exerciseId)
    if (idx >= 0) exIndex = idx
  }
  const ex = queue[exIndex] || queue[0]
  const setNum = ex ? getCurrentSet(dayId, ex.id, ex.sets) : null
  const times = getSessionTimes(dayId)
  const elapsedSec = times
    ? Math.max(0, Math.floor((Date.now() - times.startMs) / 1000))
    : null

  const log = ex ? getExLog(dayId, ex.id, ex.sets) : null
  const completedSets =
    ex && setNum != null
      ? setNum - 1
      : ex && log && !log.skipped
        ? Math.min(log.done, ex.sets)
        : undefined
  const exerciseComplete = Boolean(
    ex && setNum == null && log && !log.skipped && log.done >= ex.sets,
  )
  const setLabel =
    ex && setNum != null
      ? `Set ${setNum} of ${ex.sets}`
      : exerciseComplete
        ? `Set ${ex.sets} of ${ex.sets}`
        : progress.pct
          ? `${progress.done}/${progress.total}`
          : null
  const titleBits = [ex?.cn || ex?.name || 'Workout', setLabel].filter(Boolean)

  const focusPath = pathname.includes('/focus')
    ? pathname.split('?')[0]
    : `/day/${dayId}/focus`

  return buildResumeDescriptor({
    userId: auth.user?.id ?? null,
    spaceId: FITNESS_SPACE_ID,
    route: focusPath,
    entityId: ex?.id,
    displayTitle: 'Training',
    displaySubtitle: titleBits.join(' · '),
    substate: {
      dayId,
      exerciseId: ex?.id,
      exIndex,
      // Only encode kenosSet while there is a next set to perform.
      set: setNum != null ? setNum : undefined,
      completedSets,
      exerciseComplete: exerciseComplete || undefined,
      timerRemain: timer.visible ? timer.remain : undefined,
      timerMode: timer.visible ? timer.mode : undefined,
      elapsedSec,
      progress: setLabel || undefined,
    },
  })
}

/**
 * Apply resume into FocusSession (call from FocusSession onMount).
 * @param {string} dayId
 * @param {{
 *   descriptor?: ReturnType<typeof buildResumeDescriptor> | null,
 *   setExIndex?: (n: number) => void,
 * }} [opts]
 */
export function resumeFitnessFocus(
  dayId,
  { descriptor = null, setExIndex } = {},
) {
  if (!browser) return { ok: false }
  const q = readFitnessResumeQuery()
  const sub = /** @type {Record<string, unknown>} */ (
    descriptor?.substate || {}
  )
  const exerciseId =
    descriptor?.entityId ||
    /** @type {string|null} */ (sub.exerciseId) ||
    q.exerciseId
  const queue = getSessionExercises(dayId)
  let exIndex = loadFocusCursor(dayId) ?? getSessionProgress(dayId).exIndex ?? 0
  if (exerciseId) {
    const idx = queue.findIndex(
      (ex) => ex.id === exerciseId || ex.id.includes(String(exerciseId)),
    )
    if (idx >= 0) exIndex = idx
  } else if (typeof sub.exIndex === 'number') {
    exIndex = sub.exIndex
  }
  saveFocusCursor(dayId, exIndex)
  setExIndex?.(exIndex)

  const timerRemain =
    sub.timerRemain != null ? Number(sub.timerRemain) : q.timerRemain
  const timerMode = /** @type {string|null} */ (sub.timerMode || q.timerMode)
  if (timerRemain != null && Number.isFinite(timerRemain) && timerRemain > 0) {
    try {
      startTimer(
        timerRemain,
        timerMode === 'rest' ? '组间休息' : '计时',
        null,
        {
          mode: timerMode === 'work' ? 'work' : 'rest',
          // Focus 会话内恢复时必须 inline，否则会落到底部 float 计时器
          inline: true,
        },
      )
    } catch {
      /* timer optional */
    }
  }

  const ex = queue[exIndex]
  const exerciseComplete = sub.exerciseComplete === true
  const targetSet = exerciseComplete
    ? null
    : q.set != null && Number.isFinite(q.set)
      ? q.set
      : sub.set != null && Number.isFinite(Number(sub.set))
        ? Number(sub.set)
        : sub.completedSets != null &&
            Number.isFinite(Number(sub.completedSets))
          ? Number(sub.completedSets) + 1
          : null
  const setNum = ex
    ? targetSet != null
      ? ensureResumeCurrentSet(dayId, ex.id, targetSet, undefined, {
          // Pin when Continuity deep-link or descriptor explicitly names a set.
          pin: (q.set != null && Number.isFinite(q.set)) || descriptor != null,
        })
      : getCurrentSet(dayId, ex.id, ex.sets)
    : null

  if (browser && targetSet != null && Number.isFinite(targetSet) && ex?.id) {
    try {
      sessionStorage.setItem(
        'kenos.continuity.pendingSet',
        JSON.stringify({
          dayId,
          exerciseId: ex.id,
          set: targetSet,
          at: Date.now(),
        }),
      )
    } catch {
      /* ignore */
    }
  }

  // Continuity query is one-shot: strip only after set pin lands (or no set
  // target). Early strip used to hide failed pins behind a 1.2s pendingSet retry.
  const exerciseLanded =
    !exerciseId ||
    (ex?.id && (ex.id === exerciseId || ex.id.includes(String(exerciseId))))
  const setLanded =
    targetSet == null ||
    (setNum != null && Number(setNum) === Number(targetSet))
  const mayStrip = Boolean(exerciseLanded && setLanded)

  if (browser && mayStrip && (q.exerciseId || q.set != null)) {
    try {
      const before = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const u = new URL(window.location.href)
      ;[
        'kenosEx',
        'kenosSet',
        'kenosTimerRemain',
        'kenosTimerMode',
        'kenosElapsed',
      ].forEach((k) => u.searchParams.delete(k))
      const next = `${u.pathname}${u.search}${u.hash}`
      if (next !== before) {
        window.history.replaceState({}, '', next || u.pathname)
      }
    } catch {
      /* ignore */
    }
  }

  return {
    ok: true,
    exIndex,
    exerciseId: ex?.id ?? exerciseId,
    set: setNum,
    continuityPinned: mayStrip,
  }
}

/**
 * @param {{ handoffToKenos?: boolean, dayId?: string, exIndex?: number }} [opts]
 */
export function openFitnessContinue({
  handoffToKenos = true,
  dayId,
  exIndex,
} = {}) {
  const d = suspendFitnessSpace({ dayId, exIndex })
  try {
    writeDomainContinue(FITNESS_SPACE_ID, auth.user?.id, d)
  } catch {
    /* ignore */
  }
  if (handoffToKenos && browser) {
    const pathOnly = d.route.startsWith('http')
      ? new URL(d.route).pathname
      : d.route.startsWith('/')
        ? d.route
        : `/${d.route}`
    const openUrl = resumeDescriptorToOpenUrl(
      { ...d, route: pathOnly },
      { origin: window.location.origin },
    )
    const kenOsOrigin = resolveKenosOrigin({
      location: window.location,
      VITE_KENOS_CONTINUE_ORIGIN: import.meta.env.VITE_KENOS_CONTINUE_ORIGIN,
      VITE_KENOS_LOCAL_DAILY_BETA: import.meta.env.VITE_KENOS_LOCAL_DAILY_BETA,
    })
    const url = buildKenosContinueHandoffUrl(kenOsOrigin, {
      ...d,
      route: openUrl.startsWith('http')
        ? openUrl
        : `${window.location.origin}${openUrl}`,
    })
    window.location.assign(url)
  }
  return d
}

/**
 * Navigate to focus with resume query (from Home Continue).
 * @param {string} dayId
 */
export async function openFitnessActiveWithResume(dayId) {
  const d = suspendFitnessSpace({ dayId, pathname: `/day/${dayId}/focus` })
  const openUrl = resumeDescriptorToOpenUrl(
    { ...d, route: `/day/${dayId}/focus` },
    { origin: browser ? window.location.origin : 'https://local.invalid' },
  )
  const path = openUrl.startsWith('http')
    ? new URL(openUrl).pathname + new URL(openUrl).search
    : openUrl
  await goto(path)
  return d
}

/** Overlay sheets that should hide the native Domain dock. */
export function resolveFitnessLiveState() {
  if (
    setLogSheet.open ||
    fitnessToolSheet.open ||
    knowledgeSheet.open ||
    weightModal.open ||
    skipModal.open
  ) {
    return 'sheet'
  }
  const onFocus =
    browser &&
    (window.location.pathname.includes('/focus') ||
      window.location.pathname.includes('/session'))
  if (!onFocus) return 'idle'
  const dayId = todayDayId()
  const progress = getSessionProgress(dayId)
  if (progress?.allDone) return 'summary'
  if (browser && Number(timer.remain) > 0) {
    return `timer:${timer.mode || 'rest'}:${timer.remain}`
  }
  return 'active'
}

/** Navigation Manifest for Kenos iOS Domain chrome / leave-guard. */
export function buildFitnessNavManifest() {
  const path = browser
    ? `${window.location.pathname}${window.location.search}`
    : '/'
  const dayId = browser ? todayDayId() : 'chest'
  const onFocus =
    browser &&
    (window.location.pathname.includes('/focus') ||
      window.location.pathname.includes('/session'))
  const progress = onFocus ? getSessionProgress(dayId) : null
  const setHint = progress?.exId
    ? `Training · ${progress.done}/${progress.total}`
    : 'Training'
  // Align with KenosDomainRegistry Training dock: Today · Program · Library · More
  const pathname = browser ? window.location.pathname : '/'
  let activeTab = 'today'
  if (onFocus || pathname.includes('/session')) activeTab = 'more'
  else if (
    pathname.includes('/discover/records') ||
    pathname.includes('/history') ||
    pathname.includes('/library') ||
    pathname.includes('/discover/stats') ||
    pathname.includes('/discover/tools')
  ) {
    activeTab = 'more'
  } else if (pathname.includes('/program') || pathname.startsWith('/day')) {
    activeTab = 'program'
  } else if (pathname === '/discover' || pathname.startsWith('/discover/')) {
    activeTab = 'discover'
  }

  const liveState = resolveFitnessLiveState()

  return {
    domainId: FITNESS_SPACE_ID,
    path,
    title: 'Training',
    activeTab,
    canGoBack: browser ? window.history.length > 1 : false,
    currentEntity: progress?.exId ? String(progress.exId) : '',
    liveState,
    unsavedDraft: false,
    summary: onFocus
      ? progress?.allDone
        ? 'Session complete'
        : setHint
      : 'Training',
  }
}

export function publishFitnessNavManifest() {
  return publishNavManifest(buildFitnessNavManifest())
}

/** Install Continuity leave stub + nav-manifest publisher (idempotent). */
export function installKenosFitnessBridge() {
  if (!browser) return
  window.__KENOS_LEAVE_GUARD__ = {
    probe() {
      return { dirty: false, summary: '' }
    },
    discard() {},
    compose() {
      // Deep-link / dock "Workout" entry — land on today's focus (skip /session flash).
      void sensory('soft')
      const dayId = todayDayId()
      void goto(dayId ? `/day/${dayId}/focus` : '/program')
      void publishFitnessNavManifest()
    },
  }
  window.__KENOS_DOMAIN_COMPOSE__ = () => {
    window.__KENOS_LEAVE_GUARD__?.compose?.()
  }
  void publishFitnessNavManifest()
  if (!window.__KENOS_TRAINING_NAV_PUBLISHER__) {
    window.__KENOS_TRAINING_NAV_PUBLISHER__ = installNavManifestPublisher(
      () => buildFitnessNavManifest(),
      { intervalMs: 700 },
    )
  }
}

export const fitnessSpaceAdapter = {
  spaceId: FITNESS_SPACE_ID,
  title: 'Training',
  icon: FITNESS_ICON,
  accent: FITNESS_ACCENT,
  async open(target) {
    if (target?.route && browser) {
      const path = target.route.startsWith('http')
        ? new URL(target.route).pathname + new URL(target.route).search
        : target.route
      await goto(path)
      return
    }
    const dayId = todayDayId()
    await openFitnessActiveWithResume(dayId)
  },
  async suspend() {
    return suspendFitnessSpace()
  },
  async resume(descriptor) {
    const dayId =
      /** @type {any} */ (descriptor.substate)?.dayId || todayDayId()
    await goto(`/day/${dayId}/focus`)
    resumeFitnessFocus(dayId, { descriptor })
  },
  async getContext() {
    const d = suspendFitnessSpace()
    return {
      spaceId: FITNESS_SPACE_ID,
      title: 'Training',
      route: d.route,
      entityId: d.entityId ?? null,
      summary: d.displaySubtitle,
    }
  },
  async clearUserState(userId) {
    try {
      clearDomainContinue(FITNESS_SPACE_ID, userId)
      cancelTimer()
    } catch {
      /* ignore */
    }
  },
}
