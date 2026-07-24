/**
 * Leo 桌宠运行时状态（主窗浮层 + /pet 小窗共用）。
 * 跨 Tauri webview 靠 localStorage 广播上下文（storage 事件）。
 */
import { browser } from '$app/environment'
import {
  LEO_PET_CLICK_MS,
  LEO_PET_PUBLISH_MIN_MS,
  leoPetAllSrcs,
  normalizeLeoPetPose,
} from './leoPet.core.js'

export const PET = $state({
  /** hands-free / 麦克风聆听中 */
  listening: false,
  /** TTS 朗读中(Message 的 ttsState 桥接) */
  speaking: false,
  /** soft 模式截止时间戳 */
  softUntil: 0,
  /** 点击反馈截止 */
  clickUntil: 0,
  /** @type {import('./leoPet.core.js').LeoPetPose} */
  clickPose: 'wave',
  /** 最近用户/流式活动 */
  lastActivityAt: Date.now(),
  /** idle 呼吸帧 0|1 */
  idleFrame: /** @type {0|1} */ (0),
  /** 会话级收起（右键 Tuck）；跨窗同步 */
  tucked: false,
  /** pet 窗请求打开 assistant（storage 事件） */
  openAssistantSignal: 0,
  /** 主窗广播的远端上下文（pet 窗使用） */
  remote: /** @type {null | LeoPetRemoteCtx} */ (null),
  /** 预加载是否已跑过 */
  assetsReady: false,
})

/**
 * @typedef {{
 *   streaming: boolean,
 *   toolRunning: boolean,
 *   imageGen: boolean,
 *   speaking: boolean,
 *   listening: boolean,
 *   softUntil: number,
 *   clickUntil: number,
 *   clickPose: string,
 *   lastActivityAt: number,
 *   idleFrame: 0|1,
 *   tucked: boolean,
 *   t: number,
 * }} LeoPetRemoteCtx
 */

const ACTIVITY_KEY = 'aios_leo_pet_activity'
const OPEN_KEY = 'aios_leo_pet_open_assistant'
const CTX_KEY = 'aios_leo_pet_ctx'
const TUCK_KEY = 'aios_leo_pet_tucked'
const WINDOW_POS_KEY = 'aios_leo_pet_window_pos'

/** @type {string} */
let lastPublished = ''
/** @type {number} */
let lastPublishAt = 0
/** @type {ReturnType<typeof setTimeout> | null} */
let publishTrailingTimer = null
/** @type {{ streaming: boolean, toolRunning: boolean, imageGen: boolean } | null} */
let publishTrailingExtra = null

export function bumpLeoPetActivity() {
  PET.lastActivityAt = Date.now()
  if (browser) {
    try {
      localStorage.setItem(ACTIVITY_KEY, String(PET.lastActivityAt))
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {import('./leoPet.core.js').LeoPetPose} [pose]
 * @param {number} [ms]
 */
export function triggerLeoPetClick(pose = 'wave', ms = LEO_PET_CLICK_MS) {
  const p = normalizeLeoPetPose(pose)
  PET.clickPose = p === 'idle' ? 'wave' : p
  PET.clickUntil = Date.now() + ms
  bumpLeoPetActivity()
}

/** @param {number} [ms] */
export function triggerLeoPetSoft(ms = 12_000) {
  PET.softUntil = Date.now() + ms
  bumpLeoPetActivity()
}

/** @param {boolean} on */
export function setLeoPetListening(on) {
  PET.listening = Boolean(on)
  if (on) bumpLeoPetActivity()
}

/** @param {boolean} on TTS 朗读中(Message.svelte 桥接) */
export function setLeoPetSpeaking(on) {
  PET.speaking = Boolean(on)
  if (on) bumpLeoPetActivity()
}

/** @param {boolean} on */
export function setLeoPetTucked(on) {
  PET.tucked = Boolean(on)
  if (browser) {
    try {
      localStorage.setItem(TUCK_KEY, PET.tucked ? '1' : '0')
    } catch {
      /* ignore */
    }
  }
  if (!PET.tucked) bumpLeoPetActivity()
}

export function hydrateLeoPetTucked() {
  if (!browser) return
  try {
    PET.tucked = localStorage.getItem(TUCK_KEY) === '1'
  } catch {
    /* ignore */
  }
}

/**
 * @returns {{ x: number, y: number } | null}
 */
export function readLeoPetWindowPos() {
  if (!browser) return null
  try {
    const raw = localStorage.getItem(WINDOW_POS_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    const x = Number(o?.x)
    const y = Number(o?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x: Math.round(x), y: Math.round(y) }
  } catch {
    return null
  }
}

/**
 * @param {{ x: number, y: number }} pos
 */
export function writeLeoPetWindowPos(pos) {
  if (!browser) return
  const x = Math.round(Number(pos?.x))
  const y = Math.round(Number(pos?.y))
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  try {
    localStorage.setItem(WINDOW_POS_KEY, JSON.stringify({ x, y }))
  } catch {
    /* ignore */
  }
}

/**
 * 主窗发布桌宠上下文，供 /pet 小窗同步表情。
 * 相同 payload 跳过；最短间隔 {@link LEO_PET_PUBLISH_MIN_MS}。
 * @param {{
 *   streaming?: boolean,
 *   toolRunning?: boolean,
 *   force?: boolean,
 * } | null | undefined} [extra]
 */
export function publishLeoPetContext(extra = {}) {
  if (!browser) return
  /** @type {LeoPetRemoteCtx} */
  const payload = {
    streaming: Boolean(extra?.streaming),
    toolRunning: Boolean(extra?.toolRunning),
    imageGen: Boolean(extra?.imageGen),
    speaking: PET.speaking,
    listening: PET.listening,
    softUntil: PET.softUntil,
    clickUntil: PET.clickUntil,
    clickPose: PET.clickPose,
    lastActivityAt: PET.lastActivityAt,
    idleFrame: PET.idleFrame,
    tucked: PET.tucked,
    t: Date.now(),
  }
  const serialized = JSON.stringify({
    streaming: payload.streaming,
    toolRunning: payload.toolRunning,
    imageGen: payload.imageGen,
    speaking: payload.speaking,
    listening: payload.listening,
    softUntil: payload.softUntil,
    clickUntil: payload.clickUntil,
    clickPose: payload.clickPose,
    lastActivityAt: payload.lastActivityAt,
    idleFrame: payload.idleFrame,
    tucked: payload.tucked,
  })
  const now = Date.now()
  if (!extra?.force) {
    if (serialized === lastPublished) return
    // 有变化但离上次写入不足最短间隔 → 挂 trailing 定时器,窗口一到用最新状态补发,
    // 既限频又保证最终状态一定落盘(不丢尾帧)。
    const wait = LEO_PET_PUBLISH_MIN_MS - (now - lastPublishAt)
    if (wait > 0) {
      publishTrailingExtra = {
        streaming: payload.streaming,
        toolRunning: payload.toolRunning,
        imageGen: payload.imageGen,
      }
      if (!publishTrailingTimer) {
        publishTrailingTimer = setTimeout(() => {
          publishTrailingTimer = null
          const trailing = publishTrailingExtra
          publishTrailingExtra = null
          if (trailing) publishLeoPetContext(trailing)
        }, wait)
      }
      return
    }
  }
  if (publishTrailingTimer) {
    clearTimeout(publishTrailingTimer)
    publishTrailingTimer = null
    publishTrailingExtra = null
  }
  lastPublished = serialized
  lastPublishAt = now
  try {
    localStorage.setItem(CTX_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

/** @type {string | null} */
let lastRemoteRaw = null

/** @param {string | null} raw */
function applyRemoteCtx(raw) {
  if (!raw || raw === lastRemoteRaw) return
  lastRemoteRaw = raw
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return
    PET.remote = {
      streaming: Boolean(o.streaming),
      toolRunning: Boolean(o.toolRunning),
      imageGen: Boolean(o.imageGen),
      speaking: Boolean(o.speaking),
      listening: Boolean(o.listening),
      softUntil: Number(o.softUntil) || 0,
      clickUntil: Number(o.clickUntil) || 0,
      clickPose: String(o.clickPose || 'wave'),
      lastActivityAt: Number(o.lastActivityAt) || Date.now(),
      idleFrame: o.idleFrame === 1 ? 1 : 0,
      tucked: Boolean(o.tucked),
      t: Number(o.t) || Date.now(),
    }
    PET.listening = PET.remote.listening
    PET.speaking = PET.remote.speaking
    PET.softUntil = PET.remote.softUntil
    PET.clickUntil = PET.remote.clickUntil
    PET.clickPose = /** @type {import('./leoPet.core.js').LeoPetPose} */ (
      normalizeLeoPetPose(PET.remote.clickPose)
    )
    PET.lastActivityAt = PET.remote.lastActivityAt
    PET.idleFrame = PET.remote.idleFrame
    PET.tucked = PET.remote.tucked
  } catch {
    /* ignore */
  }
}

/** pet 小窗 → 主窗：请求打开 assistant */
export function requestLeoPetOpenAssistant() {
  if (!browser) return
  try {
    localStorage.setItem(OPEN_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
  PET.openAssistantSignal++
}

/**
 * @param {{ asPetWindow?: boolean } | null | undefined} [opts]
 */
export function bindLeoPetCrossWindow(opts = {}) {
  if (!browser) return () => {}
  hydrateLeoPetTucked()
  if (opts?.asPetWindow) {
    try {
      applyRemoteCtx(localStorage.getItem(CTX_KEY))
    } catch {
      /* ignore */
    }
  }
  const onStorage = (e) => {
    if (e.key === OPEN_KEY && e.newValue) {
      PET.openAssistantSignal++
    }
    if (e.key === ACTIVITY_KEY && e.newValue) {
      const n = Number(e.newValue)
      if (Number.isFinite(n)) PET.lastActivityAt = n
    }
    if (e.key === TUCK_KEY && e.newValue != null) {
      PET.tucked = e.newValue === '1'
    }
    if (e.key === CTX_KEY && e.newValue && opts?.asPetWindow) {
      applyRemoteCtx(e.newValue)
    }
  }
  window.addEventListener('storage', onStorage)
  let poll = null
  if (opts?.asPetWindow) {
    poll = setInterval(() => {
      try {
        applyRemoteCtx(localStorage.getItem(CTX_KEY))
      } catch {
        /* ignore */
      }
    }, 400)
  }
  return () => {
    window.removeEventListener('storage', onStorage)
    if (poll) clearInterval(poll)
  }
}

export function prefersLeoPetReducedMotion() {
  if (!browser || typeof matchMedia !== 'function') return false
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 预加载 pet 帧，避免切表情闪白 */
export function preloadLeoPetAssets() {
  if (!browser || PET.assetsReady) return
  PET.assetsReady = true
  for (const src of leoPetAllSrcs()) {
    const img = new Image()
    img.decoding = 'async'
    img.src = src
  }
}
