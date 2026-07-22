/**
 * Platform Trusted Device helpers (Owner Device Lock).
 * Slot model: 1 desktop + 1 mobile per user — shared by Finance AuthGate, Portal UI,
 * and Apple shell pairing (core_allowed_devices / core_trusted_devices view).
 */

import { LIFE_OS_PERSONAL_OWNER_EMAIL } from './constants.js'

/** @typedef {'desktop'|'mobile'} DeviceClass */
/** @typedef {'ios'|'macos'|'web'|null|undefined} DevicePlatform */

export const TRUSTED_DEVICES_TABLE = 'core_allowed_devices'
export const MAX_TRUSTED_DEVICES = 2
export const WEB_DEVICE_ID_STORAGE_KEY = 'life_os_trusted_device_id'
/** @deprecated Finance legacy key — still read for migration. */
export const FINANCE_DEVICE_ID_STORAGE_KEY = 'finance_os_device_id'

export const TRUSTED_DEVICE_SELECT =
  'id,device_class,label,user_agent,device_id,created_at,last_seen_at,public_key,platform,paired_at,revoked_at,last_challenge_at,key_storage,attest_key_id,credential_version,attest_public_key_pem,attest_sign_count'

/** Pre-migration column set (no public_key / revoked_at). */
const LIST_SELECT_LEGACY =
  'id,device_class,label,user_agent,device_id,created_at,last_seen_at'

/**
 * @param {string} [ua]
 * @returns {DeviceClass}
 */
export function resolveDeviceClass(ua = '') {
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua)
  return isMobile ? 'mobile' : 'desktop'
}

/**
 * @param {DeviceClass} cls
 * @returns {string}
 */
export function deviceClassLabel(cls) {
  return cls === 'mobile' ? '手机' : '电脑'
}

/**
 * @param {string} [ua]
 * @returns {string}
 */
export function describeBrowser(ua = '') {
  if (/Edg\//.test(ua)) return 'Edge'
  if (/CriOS\//.test(ua)) return 'Chrome'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua)) return 'Safari'
  return '浏览器'
}

/**
 * @param {string} [ua]
 * @returns {string}
 */
export function describePlatform(ua = '') {
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  return resolveDeviceClass(ua) === 'mobile' ? '手机' : '电脑'
}

/**
 * @param {string} [ua]
 * @returns {string}
 */
export function buildTrustedDeviceLabel(ua = '') {
  return `${describePlatform(ua)} · ${describeBrowser(ua)}`
}

export function newTrustedDeviceRowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @param {{ getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void }} storage
 * @param {string} [preferredKey]
 * @returns {string}
 */
export function getOrCreateTrustedDeviceId(storage, preferredKey = WEB_DEVICE_ID_STORAGE_KEY) {
  try {
    let id = storage.getItem(preferredKey)
    if (!id && preferredKey !== FINANCE_DEVICE_ID_STORAGE_KEY) {
      id = storage.getItem(FINANCE_DEVICE_ID_STORAGE_KEY)
      if (id) storage.setItem(preferredKey, id)
    }
    if (!id) {
      id = newTrustedDeviceRowId()
      storage.setItem(preferredKey, id)
    }
    return id
  } catch {
    return `ephemeral_${newTrustedDeviceRowId()}`
  }
}

/**
 * Active (non-revoked) devices only.
 * @param {Array<{ revoked_at?: string|null }>} rows
 */
export function filterActiveTrustedDevices(rows) {
  return (rows ?? []).filter((row) => !row?.revoked_at)
}

/**
 * @param {Array<{ device_id?: string|null, device_class?: string, revoked_at?: string|null }>} devices
 * @param {{ deviceId: string, deviceClass: DeviceClass }} opts
 */
export function findTrustedDeviceSlot(devices, { deviceId, deviceClass }) {
  const active = filterActiveTrustedDevices(devices)
  return (
    active.find((d) => d.device_id && d.device_id === deviceId) ??
    active.find((d) => d.device_class === deviceClass) ??
    null
  )
}

/**
 * @param {string|null|undefined} email
 * @returns {boolean}
 */
export function isLifeOsPersonalOwnerEmail(email) {
  return (
    typeof email === 'string' &&
    email.trim().toLowerCase() === LIFE_OS_PERSONAL_OWNER_EMAIL.toLowerCase()
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   deviceId: string,
 *   deviceClass: DeviceClass,
 *   label: string,
 *   userAgent?: string|null,
 *   platform?: DevicePlatform,
 *   publicKey?: string|null,
 *   pairedAt?: string|null,
 * }} opts
 * @returns {Promise<{ status: 'authorized'|'limit-reached', device?: object }>}
 */
export async function ensureTrustedDeviceAuthorized(supabase, opts) {
  const {
    deviceId,
    deviceClass,
    label,
    userAgent = null,
    platform = null,
    publicKey = null,
    pairedAt = null,
  } = opts

  let listQuery = await supabase
    .from(TRUSTED_DEVICES_TABLE)
    .select(TRUSTED_DEVICE_SELECT)
    .is('revoked_at', null)
    .order('created_at', { ascending: true })
  if (listQuery.error) {
    listQuery = await supabase
      .from(TRUSTED_DEVICES_TABLE)
      .select(LIST_SELECT_LEGACY)
      .order('created_at', { ascending: true })
    if (listQuery.error) throw listQuery.error
  }

  const devices = listQuery.data ?? []
  const slot = findTrustedDeviceSlot(devices, { deviceId, deviceClass })

  if (slot) {
    const patch = {
      last_seen_at: new Date().toISOString(),
      user_agent: userAgent,
      device_id: deviceId,
      label,
    }
    // Optional Owner Device Lock columns — omit until migration is applied.
    if (platform) patch.platform = platform
    if (publicKey) {
      patch.public_key = publicKey
      patch.paired_at = pairedAt ?? new Date().toISOString()
    }
    const selectCols = platform || publicKey
      ? TRUSTED_DEVICE_SELECT
      : 'id,device_class,label,user_agent,device_id,created_at,last_seen_at'
    const { data, error } = await supabase
      .from(TRUSTED_DEVICES_TABLE)
      .update(patch)
      .eq('id', slot.id)
      .select(selectCols)
      .single()
    if (error) throw error
    return { status: 'authorized', device: data }
  }

  if (devices.length >= MAX_TRUSTED_DEVICES) {
    return { status: 'limit-reached' }
  }

  const { data: userData } = await supabase.auth.getUser()
  const row = {
    id: newTrustedDeviceRowId(),
    user_id: userData.user?.id,
    device_class: deviceClass,
    label,
    user_agent: userAgent,
    device_id: deviceId,
    last_seen_at: new Date().toISOString(),
  }
  if (platform) row.platform = platform
  if (publicKey) {
    row.public_key = publicKey
    row.paired_at = pairedAt ?? new Date().toISOString()
  }

  const selectCols = platform || publicKey
    ? TRUSTED_DEVICE_SELECT
    : 'id,device_class,label,user_agent,device_id,created_at,last_seen_at'
  const { data, error } = await supabase
    .from(TRUSTED_DEVICES_TABLE)
    .insert(row)
    .select(selectCols)
    .single()
  if (error) {
    if (error.code === '23505') {
      const retry = findTrustedDeviceSlot(devices, { deviceId, deviceClass })
      if (retry) return { status: 'authorized', device: retry }
    }
    return { status: 'limit-reached' }
  }
  return { status: 'authorized', device: data }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function listTrustedDevices(supabase) {
  // Prefer full Owner Device Lock columns; fall back if migration not applied.
  let { data, error } = await supabase
    .from(TRUSTED_DEVICES_TABLE)
    .select(TRUSTED_DEVICE_SELECT)
    .is('revoked_at', null)
    .order('created_at', { ascending: true })
  if (error) {
    const legacy = await supabase
      .from(TRUSTED_DEVICES_TABLE)
      .select(LIST_SELECT_LEGACY)
      .order('created_at', { ascending: true })
    if (legacy.error) throw error
    return legacy.data ?? []
  }
  return data ?? []
}

/**
 * Soft-revoke (preferred) — keeps audit row; exchange will fail.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} id
 */
export async function revokeTrustedDevice(supabase, id) {
  const { error } = await supabase
    .from(TRUSTED_DEVICES_TABLE)
    .update({
      revoked_at: new Date().toISOString(),
      public_key: null,
    })
    .eq('id', id)
  if (error) {
    // Pre-migration: hard delete so Portal/Settings still work.
    const del = await supabase.from(TRUSTED_DEVICES_TABLE).delete().eq('id', id)
    if (del.error) throw error
  }
}

/**
 * Hard delete (Finance settings compatibility).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} id
 */
export async function removeTrustedDevice(supabase, id) {
  const { error } = await supabase.from(TRUSTED_DEVICES_TABLE).delete().eq('id', id)
  if (error) throw error
}

/**
 * @param {{ device_id?: string|null, device_class?: string }} row
 * @param {{ deviceId: string, deviceClass: DeviceClass }} local
 */
export function isThisTrustedDeviceSlot(row, local) {
  if (row?.device_id) return row.device_id === local.deviceId
  return row?.device_class === local.deviceClass
}
