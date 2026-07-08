import { S } from './state.svelte.js'
import {
  playTimerChime,
  primeFitnessAudio,
  closeFitnessAudio,
  cancelScheduledCues,
  playTenSecondWarning,
  playCountdownTick,
  previewRestCountdown,
} from './audio.js'

/* ═══════════════ TIMER WIDGET STATE ═══════════════ */
export const timer = $state({
  visible: false,
  showDone: false,
  inline: false,
  name: '组间休息',
  total: 0,
  remain: 0,
  paused: false,
  status: '',
  mode: 'rest',
  context: null,
  readyPulse: false,
})

const TICK_MS = 500

let ticker = null
let hideTimeout = null
let doneShowTimeout = null
let onCompleteCallback = null
let swTimerId = null
/** 计时结束的墙钟时间戳（毫秒）。后台节流后据此重新校准剩余时间 */
let endAt = 0
/** @type {Set<string|number>} */
let playedCues = new Set()

function swController() {
  return navigator.serviceWorker?.controller
}

function scheduleSwTimer() {
  const ctrl = swController()
  if (!ctrl || timer.remain <= 0 || !endAt) return
  swTimerId = `fitos-${Date.now()}`
  ctrl.postMessage({
    type: 'SCHEDULE_TIMER',
    id: swTimerId,
    endAt,
    name: timer.name,
    mode: timer.mode,
    sound: S.settings.sound,
    notify: S.settings.notifyRest !== false,
    countdown: timer.mode === 'rest' && S.settings.sound,
  })
}

function cancelSwTimer() {
  const ctrl = swController()
  if (ctrl && swTimerId) {
    ctrl.postMessage({ type: 'CANCEL_TIMER', id: swTimerId })
  }
  swTimerId = null
}

function finishTimer(fromSw = false) {
  if (timer.status === 'complete') return

  timer.remain = 0
  endAt = 0
  clearTimers()
  cancelSwTimer()
  cancelScheduledCues()
  timer.status = 'complete'
  doneShowTimeout = setTimeout(() => {
    timer.showDone = true
    doneShowTimeout = null
  }, 200)
  void playChime()
  if (!fromSw) notifyRestComplete()
  if (
    S.settings.sound &&
    typeof navigator !== 'undefined' &&
    navigator.vibrate
  ) {
    navigator.vibrate([120, 60, 120, 60, 120])
  }

  if (onCompleteCallback) {
    onCompleteCallback(timer.context)
    onCompleteCallback = null
  }

  if (timer.inline) {
    hideTimeout = setTimeout(() => {
      hideTimeout = null
      timer.showDone = false
      timer.status = ''
      timer.visible = false
      timer.readyPulse = true
      setTimeout(() => {
        timer.readyPulse = false
      }, 1200)
      void closeFitnessAudio()
    }, 1800)
    return
  }

  hideTimeout = setTimeout(() => {
    timer.visible = false
    hideTimeout = setTimeout(() => {
      hideTimeout = null
      timer.showDone = false
      timer.status = ''
      timer.context = null
      void closeFitnessAudio()
    }, 400)
  }, 2800)
}

function clearTimers() {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  if (doneShowTimeout) {
    clearTimeout(doneShowTimeout)
    doneShowTimeout = null
  }
}

export function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`
}

export function progressFrac() {
  return timer.total ? timer.remain / timer.total : 0
}

/** 休息最后 10 秒阶段的进度环（10→6 预警，5→1 倒数） */
export function ringProgressFrac() {
  if (timer.mode !== 'rest' || timer.remain <= 0 || timer.showDone)
    return progressFrac()
  if (timer.remain <= 5) return timer.remain / 5
  if (timer.remain <= 10) return (timer.remain - 5) / 5
  return progressFrac()
}

/** @returns {'normal' | 'warn' | 'countdown' | 'complete'} */
export function restPhase() {
  if (timer.status === 'complete' || timer.showDone) return 'complete'
  if (timer.mode !== 'rest' || timer.remain <= 0) return 'normal'
  if (timer.remain <= 5) return 'countdown'
  if (timer.remain <= 10) return 'warn'
  return 'normal'
}

/**
 * @param {string | number} cue 'warn10' | 5..1
 */
function fireRestCue(cue) {
  if (timer.mode !== 'rest') return
  if (playedCues.has(cue)) return
  playedCues.add(cue)

  if (cue === 'warn10') {
    timer.status = 'urgent'
    if (S.settings.sound) void playTenSecondWarning()
    if (
      S.settings.sound &&
      typeof navigator !== 'undefined' &&
      navigator.vibrate
    ) {
      navigator.vibrate(40)
    }
    return
  }

  if (typeof cue === 'number' && cue >= 1 && cue <= 5) {
    timer.status = 'urgent'
    if (S.settings.sound) void playCountdownTick(cue)
    if (
      cue === 1 &&
      S.settings.sound &&
      typeof navigator !== 'undefined' &&
      navigator.vibrate
    ) {
      navigator.vibrate([60, 40, 60])
    }
  }
}

function handleRemainCue(remain) {
  // 用 <= 判断而非 ===，后台节流恢复后跳秒也不会漏掉预警
  if (remain <= 10) fireRestCue('warn10')
  if (remain >= 1 && remain <= 5) fireRestCue(remain)
}

function refreshStatus() {
  if (timer.remain <= 10 && timer.remain > 0) timer.status = 'urgent'
  else if (timer.remain > 10) {
    timer.status = ''
  }
}

export function startTimer(secs, name, context = null, options = {}) {
  clearTimers()
  cancelSwTimer()
  cancelScheduledCues()
  playedCues = new Set()
  endAt = Date.now() + secs * 1000
  timer.total = secs
  timer.remain = secs
  timer.paused = false
  timer.name = name || '组间休息'
  timer.status = ''
  timer.mode = options.mode ?? 'rest'
  timer.showDone = false
  timer.readyPulse = false
  timer.context = context
  timer.inline = options.inline ?? false
  timer.visible = true
  onCompleteCallback = options.onComplete ?? null

  if (S.settings.sound) {
    void primeFitnessAudio()
  }

  ticker = setInterval(tick, TICK_MS)
  scheduleSwTimer()
}

/** 按墙钟重算剩余秒数，后台节流/锁屏恢复后依然准确 */
function syncRemain() {
  if (!endAt || timer.status === 'complete') return
  const next = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
  if (next === timer.remain) return
  timer.remain = next
  if (next <= 0) {
    finishTimer()
    return
  }
  refreshStatus()
  handleRemainCue(next)
}

function tick() {
  if (timer.paused) {
    endAt += TICK_MS
    return
  }
  syncRemain()
}

function notificationPayload() {
  const isWork = timer.mode === 'work'
  return {
    title: isWork ? '动作计时结束' : '休息结束',
    body: isWork
      ? `${timer.name} · 时间到`
      : `${timer.name} · 可以开始下一组了`,
    tag: isWork ? 'fitos-work-timer' : 'fitos-rest-timer',
  }
}

async function notifyRestComplete() {
  if (!S.settings.notifyRest) return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible')
    return

  const { title, body, tag } = notificationPayload()
  const opts = {
    body,
    icon: '/notify-192.png',
    badge: '/notify-192.png',
    tag,
    renotify: true,
    silent: !S.settings.sound,
    vibrate: S.settings.sound ? [120, 60, 120, 60, 120] : undefined,
    timestamp: Date.now(),
    data: { url: '/' },
  }

  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg && Notification.permission === 'granted') {
      await reg.showNotification(title, opts)
      return
    }
  } catch {
    /* 回退到页面 Notification API */
  }

  if (
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted'
  ) {
    new Notification(title, { body, tag, silent: !S.settings.sound })
  }
}

export async function requestNotifyPermission() {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/** @deprecated alias */
export const requestNotificationPermission = requestNotifyPermission

export function notificationStatus() {
  return notificationCapability().kind
}

/**
 * 区分「真不支持」与「iPhone 未加主屏幕 / 微信内置浏览器」等可恢复场景。
 * @returns {{ kind: 'granted' | 'denied' | 'default' | 'unsupported' | 'ios-browser' | 'in-app' }}
 */
export function notificationCapability() {
  if (typeof window === 'undefined') return { kind: 'unsupported' }

  const ua = navigator.userAgent || ''
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    /** @type {{ standalone?: boolean }} */ (navigator).standalone === true
  const inApp =
    /MicroMessenger|QQ\/|WeiBo|AlipayClient|DingTalk|bytedance|Aweme/i.test(ua)

  const hasNotification = typeof Notification !== 'undefined'
  const hasSW = 'serviceWorker' in navigator

  if (inApp) return { kind: 'in-app' }
  if (!hasNotification || !hasSW) {
    if (isIOS && !isStandalone) return { kind: 'ios-browser' }
    return { kind: 'unsupported' }
  }

  return {
    kind: /** @type {'granted'|'denied'|'default'} */ (Notification.permission),
  }
}

export function cancelTimer() {
  clearTimers()
  cancelSwTimer()
  cancelScheduledCues()
  void closeFitnessAudio()
  playedCues = new Set()
  onCompleteCallback = null
  endAt = 0
  timer.remain = 0
  timer.total = 0
  timer.paused = false
  timer.readyPulse = false
  timer.visible = false
  timer.inline = false
  timer.mode = 'rest'
  timer.context = null
  hideTimeout = setTimeout(() => {
    hideTimeout = null
    timer.showDone = false
    timer.status = ''
  }, 400)
}

export function addTime(delta) {
  if (timer.status === 'complete' || !endAt) return
  endAt += delta * 1000
  timer.total += delta
  timer.remain += delta
  playedCues = new Set()
  refreshStatus()
  scheduleSwTimer()
}

export function subTime(delta) {
  if (timer.status === 'complete' || !endAt) return
  timer.remain = Math.max(1, timer.remain - delta)
  endAt = Date.now() + timer.remain * 1000
  if (timer.remain > timer.total) timer.total = timer.remain
  playedCues = new Set()
  refreshStatus()
  scheduleSwTimer()
}

/** 初始化 SW 消息监听与前台校准（layout onMount 调用） */
export function initTimer() {
  if (typeof navigator === 'undefined') return () => {}

  // 回到前台立即按墙钟校准，不等下一个 tick
  const onVisible = () => {
    if (
      document.visibilityState === 'visible' &&
      timer.visible &&
      !timer.paused
    ) {
      syncRemain()
    }
  }
  document.addEventListener('visibilitychange', onVisible)

  if (!navigator.serviceWorker) {
    return () => document.removeEventListener('visibilitychange', onVisible)
  }

  const onMessage = (event) => {
    const data = event.data || {}
    if (data.id !== swTimerId) return

    if (data.type === 'TIMER_CUE' && timer.visible) {
      fireRestCue(data.cue)
      return
    }

    if (data.type === 'TIMER_DONE' && timer.visible) {
      finishTimer(true)
    }
  }

  navigator.serviceWorker.addEventListener('message', onMessage)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    navigator.serviceWorker.removeEventListener('message', onMessage)
  }
}

async function playChime() {
  if (!S.settings.sound) {
    await closeFitnessAudio()
    return
  }
  await playTimerChime(timer.mode === 'work' ? 'work' : 'rest')
}

/** 设置页试听提示音 */
export async function previewTimerChime() {
  await primeFitnessAudio()
  await previewRestCountdown()
}
