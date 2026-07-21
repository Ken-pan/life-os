/**
 * Shared Kenos Space Continuity runtime (Web).
 * ResumeDescriptor encode/decode, expiry, v1→v2 migration, user-scoped storage keys.
 */
import { LIFE_OS_APP_ORIGINS } from '@life-os/theme'

export const CONTINUE_STORE_VERSION = 2
export const RESUME_DESCRIPTOR_VERSION = 1
export const CONTINUE_STORAGE_KEY = 'kenos.spaceSwitcher.v1'
export const CONTINUE_MAX_RECENT = 6
/** Default TTL for resume pointers (14 days). */
export const RESUME_DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000

/**
 * @param {string} listKey
 */
export function spaceIdFromListKey(listKey) {
  const key = String(listKey || '').trim()
  if (key.startsWith('hosted:')) return key.slice('hosted:'.length)
  if (key.startsWith('external:')) return key.slice('external:'.length)
  return key
}

/**
 * @param {string} spaceId
 * @param {'hosted' | 'external'} [namespace]
 */
export function listKeyForSpaceId(spaceId, namespace = 'hosted') {
  return `${namespace}:${String(spaceId || '').trim()}`
}

/**
 * @param {number | string | Date} [value]
 */
export function toIso(value = Date.now()) {
  if (typeof value === 'string' && value.includes('T')) return value
  const ms = value instanceof Date ? value.getTime() : Number(value) || Date.now()
  return new Date(ms).toISOString()
}

/**
 * @param {Partial<import('@life-os/contracts/kenos-space-continuity').KenosResumeDescriptor> & {
 *   spaceId: string,
 *   route: string,
 *   displayTitle: string,
 *   userId?: string | null,
 *   listKey?: string,
 *   entityId?: string | null,
 *   displaySubtitle?: string | null,
 *   substate?: Record<string, unknown>,
 *   updatedAt?: string | number,
 *   expiresAt?: string | number | null,
 *   ttlMs?: number,
 * }} input
 */
export function buildResumeDescriptor(input) {
  const updatedAt = toIso(input.updatedAt ?? Date.now())
  const ttl = input.ttlMs ?? RESUME_DEFAULT_TTL_MS
  const expiresAt =
    input.expiresAt === null
      ? undefined
      : input.expiresAt != null
        ? toIso(input.expiresAt)
        : toIso(Date.parse(updatedAt) + ttl)
  return {
    version: RESUME_DESCRIPTOR_VERSION,
    userId: input.userId != null ? String(input.userId) : 'anonymous',
    spaceId: String(input.spaceId || spaceIdFromListKey(input.listKey || '')),
    route: String(input.route || '').trim(),
    entityId: input.entityId ? String(input.entityId) : undefined,
    substate:
      input.substate && typeof input.substate === 'object'
        ? { ...input.substate }
        : undefined,
    displayTitle: String(input.displayTitle || input.spaceId || 'Space').slice(0, 120),
    displaySubtitle: input.displaySubtitle
      ? String(input.displaySubtitle).slice(0, 200)
      : undefined,
    updatedAt,
    expiresAt,
  }
}

/**
 * Legacy SpaceResumeState → ResumeDescriptor.
 * @param {string} listKey
 * @param {{ lastRoute?: string, selectedEntityId?: string | null, filter?: string | null, updatedAt?: number, displayTitle?: string } | null | undefined} legacy
 * @param {string | null} [userId]
 */
export function migrateLegacyResume(listKey, legacy, userId = null) {
  if (!legacy || typeof legacy !== 'object') return null
  const route = String(legacy.lastRoute || '').trim()
  if (!route) return null
  const spaceId = spaceIdFromListKey(listKey)
  return buildResumeDescriptor({
    userId,
    spaceId,
    listKey,
    route,
    entityId: legacy.selectedEntityId || undefined,
    displayTitle: legacy.displayTitle || titleForSpaceId(spaceId),
    displaySubtitle: legacy.filter || undefined,
    updatedAt: legacy.updatedAt || Date.now(),
    substate: legacy.filter ? { filter: String(legacy.filter) } : undefined,
  })
}

/**
 * @param {string} spaceId
 */
export function titleForSpaceId(spaceId) {
  const map = {
    plan: 'Plan',
    training: 'Training',
    money: 'Money',
    music: 'Music',
    home: 'Home',
    knowledge: 'Knowledge',
    work: 'Work',
    'work-focus': 'Work Focus',
  }
  return map[spaceId] || spaceId
}

/**
 * @param {unknown} raw
 * @param {{ now?: number }} [opts]
 * @returns {import('@life-os/contracts/kenos-space-continuity').KenosResumeDescriptor | null}
 */
export function normalizeResumeDescriptor(raw, { now = Date.now() } = {}) {
  if (!raw || typeof raw !== 'object') return null
  const obj = /** @type {Record<string, unknown>} */ (raw)

  // Legacy shape
  if (obj.lastRoute && !obj.route) {
    return migrateLegacyResume(
      String(obj.listKey || obj.spaceId || ''),
      /** @type {any} */ (obj),
      obj.userId != null ? String(obj.userId) : null,
    )
  }

  const route = String(obj.route || '').trim()
  if (!route) return null
  const spaceId = String(obj.spaceId || spaceIdFromListKey(String(obj.listKey || ''))).trim()
  if (!spaceId) return null

  const descriptor = buildResumeDescriptor({
    userId: obj.userId != null ? String(obj.userId) : 'anonymous',
    spaceId,
    route,
    entityId: obj.entityId ? String(obj.entityId) : undefined,
    substate:
      obj.substate && typeof obj.substate === 'object'
        ? /** @type {Record<string, unknown>} */ (obj.substate)
        : undefined,
    displayTitle: String(obj.displayTitle || titleForSpaceId(spaceId)),
    displaySubtitle: obj.displaySubtitle ? String(obj.displaySubtitle) : undefined,
    updatedAt: obj.updatedAt ? toIso(/** @type {any} */ (obj.updatedAt)) : toIso(now),
    expiresAt: obj.expiresAt ? toIso(/** @type {any} */ (obj.expiresAt)) : undefined,
  })

  // Expired descriptors are returned intact — callers use isResumeExpired + fallback.
  void now
  return descriptor
}

/**
 * @param {{ expiresAt?: string } | null | undefined} descriptor
 * @param {number} [now]
 */
export function isResumeExpired(descriptor, now = Date.now()) {
  if (!descriptor?.expiresAt) return false
  const exp = Date.parse(descriptor.expiresAt)
  return Number.isFinite(exp) && exp < now
}

/**
 * Honest fallback: keep descriptor fields, point route at domain home.
 * @param {ReturnType<typeof buildResumeDescriptor>} descriptor
 * @param {string} homeRoute
 */
export function fallbackResumeToHome(descriptor, homeRoute) {
  return {
    ...descriptor,
    route: homeRoute,
    substate: {
      ...(descriptor.substate || {}),
      resumeFallback: 'unsupported_or_expired',
      priorRoute: descriptor.route,
    },
    displaySubtitle: descriptor.displaySubtitle
      ? `${descriptor.displaySubtitle} · 已回到入口`
      : '已回到入口',
    updatedAt: toIso(),
  }
}

/**
 * Base64url encode ResumeDescriptor for cross-origin handoff (Kenos ↔ domain).
 * @param {object} descriptor
 */
export function encodeResumeHandoff(descriptor) {
  const json = JSON.stringify(descriptor)
  if (typeof btoa === 'function') {
    const bin = btoa(unescape(encodeURIComponent(json)))
    return bin.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  return Buffer.from(json, 'utf8').toString('base64url')
}

/**
 * @param {string} encoded
 */
export function decodeResumeHandoff(encoded) {
  const raw = String(encoded || '').trim()
  if (!raw) return null
  try {
    let json
    if (typeof atob === 'function') {
      const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
      const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
      json = decodeURIComponent(escape(atob(b64 + pad)))
    } else {
      json = Buffer.from(raw, 'base64url').toString('utf8')
    }
    return normalizeResumeDescriptor(JSON.parse(json))
  } catch {
    return null
  }
}

/**
 * Append resume handoff to a Kenos Continue URL.
 * @param {string} kenosOrigin
 * @param {object} descriptor
 * @param {{ openContinue?: boolean }} [opts]
 */
export function buildKenosContinueHandoffUrl(
  kenosOrigin,
  descriptor,
  { openContinue = true } = {},
) {
  const url = new URL(String(kenosOrigin || '').replace(/\/$/, '') + '/')
  url.searchParams.set('kenosResume', encodeResumeHandoff(descriptor))
  if (openContinue) url.searchParams.set('openContinue', '1')
  return url.toString()
}

/**
 * Resolve Kenos (aios) origin for Continue handoff.
 * @param {{ location?: { hostname?: string, protocol?: string } }} [env]
 */
export function resolveKenosOrigin(env = globalThis) {
  const override = String(
    env?.VITE_KENOS_CONTINUE_ORIGIN ||
      (typeof import.meta !== 'undefined' &&
        import.meta.env?.VITE_KENOS_CONTINUE_ORIGIN) ||
      '',
  ).trim()
  if (override) return override.replace(/\/$/, '')

  const dailyBeta =
    String(
      env?.VITE_KENOS_LOCAL_DAILY_BETA ||
        (typeof import.meta !== 'undefined' &&
          import.meta.env?.VITE_KENOS_LOCAL_DAILY_BETA) ||
        '',
    ) === '1'
  if (dailyBeta) return 'http://127.0.0.1:5219'

  const cfg = LIFE_OS_APP_ORIGINS.aios
  try {
    const host = env?.location?.hostname || ''
    if (host === '127.0.0.1' || host === 'localhost') {
      return `http://127.0.0.1:${cfg.devPort}`
    }
  } catch {
    /* ignore */
  }
  return cfg.production
}

/**
 * Build domain deep-link URL from ResumeDescriptor (adds restore query from substate).
 * @param {ReturnType<typeof buildResumeDescriptor>} descriptor
 * @param {{ origin?: string }} [opts]
 */
export function resumeDescriptorToOpenUrl(descriptor, { origin } = {}) {
  if (!descriptor?.route) return '/'
  let url
  try {
    url = /^https?:\/\//i.test(descriptor.route)
      ? new URL(descriptor.route)
      : new URL(descriptor.route, origin || 'https://local.invalid')
  } catch {
    return descriptor.route
  }

  const sub = descriptor.substate || {}
  if (descriptor.spaceId === 'plan' || spaceIdFromListKey(descriptor.spaceId) === 'plan') {
    if (descriptor.entityId) url.searchParams.set('kenosTask', descriptor.entityId)
    const filter = sub.filter != null ? String(sub.filter) : ''
    // Only machine filters become query params (not human Continue copy).
    if (/^(overdue|inbox|today|upcoming|completed)$/i.test(filter)) {
      url.searchParams.set('kenosFilter', filter.toLowerCase())
    }
    if (sub.search) url.searchParams.set('kenosSearch', String(sub.search))
    if (sub.projectId) url.searchParams.set('kenosProject', String(sub.projectId))
    if (sub.detailOpen) url.searchParams.set('kenosDetail', '1')
    if (sub.scrollAnchor) url.searchParams.set('kenosScroll', String(sub.scrollAnchor))
  }
  if (
    descriptor.spaceId === 'training' ||
    spaceIdFromListKey(descriptor.spaceId) === 'training'
  ) {
    if (descriptor.entityId || sub.exerciseId) {
      url.searchParams.set(
        'kenosEx',
        String(descriptor.entityId || sub.exerciseId),
      )
    }
    if (sub.set != null && sub.exerciseComplete !== true) {
      url.searchParams.set('kenosSet', String(sub.set))
    }
    if (sub.timerRemain != null)
      url.searchParams.set('kenosTimerRemain', String(sub.timerRemain))
    if (sub.timerMode) url.searchParams.set('kenosTimerMode', String(sub.timerMode))
    if (sub.elapsedSec != null)
      url.searchParams.set('kenosElapsed', String(sub.elapsedSec))
  }

  if (origin && url.origin === 'https://local.invalid') {
    return `${url.pathname}${url.search}${url.hash}`
  }
  return url.toString()
}

/**
 * Namespaced storage key for domain-local continue mirrors (account isolation).
 * @param {string} appId
 * @param {string | null | undefined} userId
 */
export function domainContinueStorageKey(appId, userId) {
  const owner = userId ? String(userId) : 'anonymous'
  return `kenos.continue.v2.${appId}.${owner}`
}
