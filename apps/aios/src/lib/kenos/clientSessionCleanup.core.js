/**
 * Logout / account-switch client storage policy.
 * Classifies aios_* keys; clears user-scoped state fail-closed.
 */

/** @typedef {'DEVICE_GENERIC_SETTING'|'USER_SCOPED_PREFERENCE'|'USER_SCOPED_MEMORY'|'USER_SCOPED_CACHE'|'AUTH_SESSION_DERIVED'|'UNKNOWN'} StorageClass */

/**
 * Inventory of known AIOS local keys (exact names under aios_memory_* + related session keys).
 * @type {ReadonlyArray<{ key: string, classification: StorageClass, containsUserContent: boolean, notes: string }>}
 */
export const AIOS_CLIENT_STORAGE_INVENTORY = Object.freeze([
  {
    key: 'aios_memory_v1',
    classification: 'USER_SCOPED_MEMORY',
    containsUserContent: true,
    notes: 'Array<{id,text,vector?,createdAt}> — Assistant long-term facts',
  },
  {
    key: 'aios_memory_seeded_v1',
    classification: 'USER_SCOPED_MEMORY',
    containsUserContent: false,
    notes: 'Flag that profile seeds were written; still user-session bound',
  },
  {
    key: 'aios_memory_dreamed_at_v1',
    classification: 'USER_SCOPED_CACHE',
    containsUserContent: false,
    notes: 'Timestamp of last memory dream run',
  },
  {
    key: 'aios_memory_backup_v1',
    classification: 'USER_SCOPED_MEMORY',
    containsUserContent: true,
    notes: 'Full memory array backup before dream rewrite',
  },
  {
    key: 'aios_chats_v1',
    classification: 'USER_SCOPED_MEMORY',
    containsUserContent: true,
    notes: 'Conversation payloads',
  },
  {
    key: 'aios_active_chat_v1',
    classification: 'USER_SCOPED_CACHE',
    containsUserContent: false,
    notes: 'Active conversation id (sessionStorage)',
  },
  {
    key: 'aios_drafts_v1',
    classification: 'USER_SCOPED_CACHE',
    containsUserContent: true,
    notes: 'Composer drafts (sessionStorage)',
  },
  {
    key: 'aios_cloud_snapshot_v1',
    classification: 'USER_SCOPED_CACHE',
    containsUserContent: false,
    notes: 'Sync LWW snapshot of conversation/memory ids',
  },
  {
    key: 'aios_control_snapshot_v1',
    classification: 'USER_SCOPED_CACHE',
    containsUserContent: true,
    notes: 'Control Center read-model snapshot (Today/Inbox stale-while-revalidate)',
  },
  {
    key: 'aios_daily_suggestions_v1',
    classification: 'USER_SCOPED_CACHE',
    containsUserContent: true,
    notes: '{id: date|location, items: string[]} personalized chips',
  },
  {
    key: 'aios_agent_threads_v1',
    classification: 'USER_SCOPED_CACHE',
    containsUserContent: true,
    notes: 'Agent thread map',
  },
  {
    key: 'aios_canvas_v1',
    classification: 'USER_SCOPED_CACHE',
    containsUserContent: true,
    notes: 'Artifact canvas map',
  },
  {
    key: 'aios_daily_brief_v1',
    classification: 'USER_SCOPED_CACHE',
    containsUserContent: false,
    notes: '{lastShownDate}',
  },
  {
    key: 'aios_mcp_servers_v1',
    classification: 'AUTH_SESSION_DERIVED',
    containsUserContent: true,
    notes: 'May hold Bearer JWT for Life OS MCP fleet',
  },
  {
    key: 'kenos.focus.v1',
    classification: 'USER_SCOPED_CACHE',
    containsUserContent: true,
    notes: 'Local Focus session projection',
  },
  {
    key: 'kenos.spaceSwitcher.v1',
    classification: 'USER_SCOPED_CACHE',
    containsUserContent: true,
    notes: 'Recent/pinned Spaces + resume routes (user-scoped)',
  },
  {
    key: 'kenos.shellStateMeta.v1',
    classification: 'USER_SCOPED_CACHE',
    containsUserContent: false,
    notes: 'shell_state 云同步 per-key LWW 时间戳/墓碑记账',
  },
  {
    key: 'aios_gateway_url_v1',
    classification: 'DEVICE_GENERIC_SETTING',
    containsUserContent: false,
    notes: 'Local AI gateway URL override',
  },
  {
    key: 'aios_demo',
    classification: 'DEVICE_GENERIC_SETTING',
    containsUserContent: false,
    notes: 'Demo mode flag',
  },
  {
    key: 'aiosos_v1',
    classification: 'USER_SCOPED_PREFERENCE',
    containsUserContent: true,
    notes: 'Mixed: theme/locale (device) + userProfile/location (user)',
  },
])

export const AUTH_WALL_DOCUMENT_TITLE = 'Kenos — Sign in'

/** Exact keys always removed on logout / user switch (fail-closed). */
export const USER_SCOPED_STORAGE_KEYS = Object.freeze(
  AIOS_CLIENT_STORAGE_INVENTORY.filter((row) =>
    [
      'USER_SCOPED_MEMORY',
      'USER_SCOPED_CACHE',
      'AUTH_SESSION_DERIVED',
      'UNKNOWN',
    ].includes(row.classification),
  ).map((row) => row.key),
)

/** Prefixes swept from localStorage (any matching key). */
export const USER_SCOPED_STORAGE_PREFIXES = Object.freeze(['aios_memory_'])

/**
 * Device-only fields retained inside aiosos_v1.settings after logout.
 * @type {ReadonlyArray<string>}
 */
export const DEVICE_SETTINGS_KEEP = Object.freeze([
  'theme',
  'locale',
  'model',
  'thinking',
  'tools',
  'webAccess',
  'memory',
  'temperature',
  'ttsVoice',
  'ttsRate',
  'dailyBrief',
])

/**
 * @param {string} key
 * @returns {StorageClass}
 */
export function classifyClientStorageKey(key) {
  const exact = AIOS_CLIENT_STORAGE_INVENTORY.find((row) => row.key === key)
  if (exact) return exact.classification
  if (String(key).startsWith('aios_memory_')) return 'UNKNOWN'
  if (String(key).startsWith('aios_')) return 'UNKNOWN'
  return 'UNKNOWN'
}

/**
 * @param {string} key
 */
export function shouldClearClientStorageKey(key) {
  const k = String(key || '')
  if (USER_SCOPED_STORAGE_PREFIXES.some((p) => k.startsWith(p))) return true
  if (USER_SCOPED_STORAGE_KEYS.includes(k)) return true
  const cls = classifyClientStorageKey(k)
  if (cls === 'DEVICE_GENERIC_SETTING') return false
  // UNKNOWN under aios_memory_* or other aios_* → fail closed (clear)
  if (
    cls === 'UNKNOWN' &&
    (k.startsWith('aios_memory_') || k.startsWith('aios_'))
  )
    return true
  return false
}

/**
 * @param {{
 *   localStorage?: Storage
 *   sessionStorage?: Storage
 *   stripAiososUserFields?: (settings: Record<string, unknown>) => Record<string, unknown>
 * }} [options]
 * @returns {{ cleared: string[], errors: string[], ok: boolean }}
 */
export function clearUserScopedClientStorage(options = {}) {
  const ls = options.localStorage
  const ss = options.sessionStorage
  const cleared = []
  const errors = []

  const sweep = (store, label) => {
    if (!store) return
    let keys = []
    try {
      keys = []
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)
        if (k) keys.push(k)
      }
    } catch (err) {
      errors.push(`${label}:enumerate:${String(err?.message || err)}`)
      // Fail closed: try known keys anyway
      keys = [...USER_SCOPED_STORAGE_KEYS]
    }
    for (const key of keys) {
      if (!shouldClearClientStorageKey(key) && key !== 'aiosos_v1') continue
      if (key === 'aiosos_v1') continue // handled below
      try {
        store.removeItem(key)
        cleared.push(`${label}:${key}`)
      } catch (err) {
        errors.push(`${label}:${key}:${String(err?.message || err)}`)
      }
    }
    // Always attempt known keys even if enumerate missed them
    for (const key of USER_SCOPED_STORAGE_KEYS) {
      try {
        if (store.getItem(key) != null) {
          store.removeItem(key)
          if (!cleared.includes(`${label}:${key}`))
            cleared.push(`${label}:${key}`)
        }
      } catch (err) {
        errors.push(`${label}:${key}:${String(err?.message || err)}`)
      }
    }
  }

  sweep(ls, 'local')
  sweep(ss, 'session')

  // aiosos_v1: keep device prefs, strip user-identifying fields
  if (ls && typeof options.stripAiososUserFields === 'function') {
    try {
      const raw = ls.getItem('aiosos_v1')
      if (raw) {
        const parsed = JSON.parse(raw)
        const settings =
          parsed?.settings && typeof parsed.settings === 'object'
            ? parsed.settings
            : {}
        const nextSettings = options.stripAiososUserFields(settings)
        ls.setItem('aiosos_v1', JSON.stringify({ settings: nextSettings }))
        cleared.push('local:aiosos_v1:userFields')
      }
    } catch (err) {
      errors.push(`local:aiosos_v1:${String(err?.message || err)}`)
      try {
        ls.removeItem('aiosos_v1')
        cleared.push('local:aiosos_v1:removed')
      } catch (err2) {
        errors.push(`local:aiosos_v1:remove:${String(err2?.message || err2)}`)
      }
    }
  }

  return { cleared, errors, ok: errors.length === 0 }
}

/**
 * @param {Record<string, unknown>} settings
 */
export function stripUserFieldsFromSettings(settings = {}) {
  /** @type {Record<string, unknown>} */
  const next = {}
  for (const key of DEVICE_SETTINGS_KEEP) {
    if (key in settings) next[key] = settings[key]
  }
  // Explicit empties — never leave prior identity
  next.customPrompt = ''
  next.location = ''
  next.userProfile = ''
  next.userProfileVersion = Number(settings.userProfileVersion) || 2
  next.settingsUpdatedAt = 0
  return next
}
