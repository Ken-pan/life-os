/**
 * Kenos web app logs — ring buffer + redacted upload to `kenos_ingest_app_logs`.
 *
 * Mirrors iOS `KenosLog` / `KenosLogCloudSync` for standalone PWA / desktop.
 * Inside the iOS Continuity shell, cloud upload is skipped (native already syncs
 * console.warn/error via `kenosNativeLog`); structured events still forward to
 * the native handler when available.
 */

import { isIosNativeShell } from './iosNativeShell.js'

/** @typedef {'trace'|'debug'|'info'|'notice'|'warning'|'error'|'fault'} KenosLogLevel */

const LEVEL_RANK = Object.freeze({
  trace: 0,
  debug: 1,
  info: 2,
  notice: 3,
  warning: 4,
  error: 5,
  fault: 6,
})

const SENSITIVE_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'password',
  'secret',
  'authorization',
  'cookie',
  'apikey',
  'api_key',
  'anon_key',
])

/**
 * A route safe to log: pathname + query PARAM KEYS only (values stripped).
 * Query strings routinely carry note/task titles, search terms and resume
 * payloads (?title=…, ?q=…, ?kenosResume=…); logging them verbatim leaks
 * private content. We keep the shape (which params were present) for diagnosis
 * without the values. (F5-06.6)
 * @param {{ pathname?: string, search?: string } | undefined} loc
 */
export function safeRoute(loc) {
  try {
    const pathname = loc?.pathname ?? ''
    const search = loc?.search ?? ''
    if (!search) return pathname
    const params = new URLSearchParams(search)
    const keys = [...params.keys()]
    if (!keys.length) return pathname
    return `${pathname}?${keys.map((k) => `${k}=«redacted»`).join('&')}`
  } catch {
    return loc?.pathname ?? ''
  }
}

/** @type {Array<[RegExp, string]>} */
const REDACT_PATTERNS = [
  [/\bbearer\s+\S+/gi, 'Bearer «redacted»'],
  [
    /\b(access_token|refresh_token|id_token|password|authorization|token)\b\s*[:=]\s*["']?[^\s&"']+/gi,
    '$1=«redacted»',
  ],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '«jwt»'],
  [/sb_(publishable|secret)_[A-Za-z0-9_-]+/g, '«supabase_key»'],
  [/\bsk-[A-Za-z0-9]{16,}\b/g, '«api_key»'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '«email»'],
]

const MAX_MESSAGE = 2000
const MAX_RING = 500
const MAX_BATCH = 100
const MAX_UPLOADED_MEMORY = 4000
const DEFAULT_POLL_MS = 45_000
const STORAGE_PREFIX = 'kenos.appLogs.'

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function redactLogText(raw) {
  let value = String(raw ?? '')
  if (!value) return value
  for (const [re, replacement] of REDACT_PATTERNS) {
    value = value.replace(re, replacement)
  }
  if (value.length > MAX_MESSAGE) {
    value = `${value.slice(0, MAX_MESSAGE)}…«truncated»`
  }
  return value
}

/**
 * @param {Record<string, unknown> | null | undefined} metadata
 * @returns {Record<string, string>}
 */
export function redactLogMetadata(metadata) {
  /** @type {Record<string, string>} */
  const out = {}
  if (!metadata || typeof metadata !== 'object') return out
  for (const [key, value] of Object.entries(metadata)) {
    const safeKey = String(key).slice(0, 64)
    const lower = safeKey.toLowerCase()
    if (
      SENSITIVE_KEYS.has(lower) ||
      lower.includes('token') ||
      lower.includes('secret')
    ) {
      out[safeKey] = '«redacted»'
    } else if (value == null) {
      out[safeKey] = ''
    } else if (typeof value === 'object') {
      out[safeKey] = redactLogText(JSON.stringify(value))
    } else {
      out[safeKey] = redactLogText(String(value))
    }
  }
  return out
}

/**
 * @param {unknown} level
 * @returns {KenosLogLevel}
 */
export function normalizeLogLevel(level) {
  const raw = String(level || 'info').toLowerCase()
  if (raw in LEVEL_RANK) return /** @type {KenosLogLevel} */ (raw)
  if (raw === 'warn') return 'warning'
  if (raw === 'fatal' || raw === 'critical') return 'fault'
  return 'info'
}

/**
 * @param {KenosLogLevel} level
 * @param {KenosLogLevel} min
 */
export function levelMeetsMinimum(level, min) {
  return (
    (LEVEL_RANK[normalizeLogLevel(level)] ?? 0) >=
    (LEVEL_RANK[normalizeLogLevel(min)] ?? 0)
  )
}

/**
 * Pure alert-rule evaluation (shared by SQL scan + local script dry-run).
 *
 * @param {{
 *   faults?: number,
 *   errors?: number,
 *   warnings?: number,
 *   crashBugs?: number,
 *   windowMinutes?: number,
 * }} counts
 * @returns {Array<{ kind: string, severity: 'warning'|'critical', title: string }>}
 */
export function evaluateAppLogAlertRules(counts = {}) {
  const faults = Number(counts.faults) || 0
  const errors = Number(counts.errors) || 0
  const warnings = Number(counts.warnings) || 0
  const crashBugs = Number(counts.crashBugs) || 0
  /** @type {Array<{ kind: string, severity: 'warning'|'critical', title: string }>} */
  const alerts = []
  if (faults >= 1) {
    alerts.push({
      kind: 'fault_spike',
      severity: 'critical',
      title: `${faults} fault log(s) in window`,
    })
  }
  if (errors >= 5) {
    alerts.push({
      kind: 'error_burst',
      severity: 'warning',
      title: `${errors} error log(s) in window`,
    })
  }
  if (warnings >= 20) {
    alerts.push({
      kind: 'warning_burst',
      severity: 'warning',
      title: `${warnings} warning log(s) in window`,
    })
  }
  if (crashBugs >= 1) {
    alerts.push({
      kind: 'crash_bug',
      severity: 'critical',
      title: `${crashBugs} crash / MetricKit bug report(s)`,
    })
  }
  return alerts
}

/**
 * @returns {string}
 */
function newId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function errorMessage(err) {
  if (!err) return 'unknown'
  if (typeof err === 'string') return err
  if (typeof err === 'object' && err && 'message' in err) {
    return String(/** @type {{ message?: unknown }} */ (err).message || 'error')
  }
  return String(err)
}

/**
 * Prefer public-schema RPC (AIOS / fitness clients may default to another schema).
 * @param {any} supabase
 */
function publicRpcClient(supabase) {
  if (!supabase) return null
  if (typeof supabase.schema === 'function') {
    try {
      return supabase.schema('public')
    } catch {
      return supabase
    }
  }
  return supabase
}

/**
 * @param {{
 *   app: string,
 *   getSupabase: () => any,
 *   appVersion?: string,
 *   build?: string,
 *   enabled?: boolean,
 *   cloudMinLevel?: KenosLogLevel,
 *   pollMs?: number,
 *   captureGlobals?: boolean,
 *   storage?: Storage | null,
 * }} options
 */
export function createKenosAppLogs(options) {
  const app = String(options.app || 'unknown').slice(0, 32)
  const getSupabase = options.getSupabase
  const appVersion = String(options.appVersion || '0.0.0')
  const build = String(options.build || '')
  const pollMs = Math.max(10_000, Number(options.pollMs) || DEFAULT_POLL_MS)
  const captureGlobals = options.captureGlobals !== false
  const storage =
    options.storage === null
      ? null
      : options.storage ||
        (typeof localStorage !== 'undefined' ? localStorage : null)

  let enabled = options.enabled !== false
  let cloudMinLevel = normalizeLogLevel(options.cloudMinLevel || 'warning')
  const sessionId = newId()
  const startedAt = new Date().toISOString()

  /** @type {Array<Record<string, unknown>>} */
  const ring = []
  /** @type {Set<string>} */
  const uploadedIds = new Set()
  let uploading = false
  let lastUploadAt = /** @type {string | null} */ (null)
  let lastUploadError = /** @type {string | null} */ (null)
  let lastInserted = 0
  let disposed = false
  /** @type {ReturnType<typeof setInterval> | null} */
  let pollTimer = null
  /** @type {Array<() => void>} */
  const cleanups = []

  const uploadedKey = `${STORAGE_PREFIX}${app}.uploadedIds`

  try {
    const saved = storage?.getItem(uploadedKey)
    if (saved) {
      for (const id of JSON.parse(saved)) {
        if (typeof id === 'string') uploadedIds.add(id)
      }
    }
  } catch {
    /* ignore */
  }

  function persistUploaded() {
    if (!storage) return
    try {
      const ids = [...uploadedIds].slice(-MAX_UPLOADED_MEMORY)
      storage.setItem(uploadedKey, JSON.stringify(ids))
    } catch {
      /* ignore */
    }
  }

  function sessionPayload() {
    const nav = typeof navigator !== 'undefined' ? navigator : null
    return {
      id: sessionId,
      startedAt,
      platform: 'web',
      app,
      appVersion,
      build,
      deviceModel: nav?.userAgent?.slice(0, 120) || 'browser',
      systemVersion: nav?.platform || '',
      locale: nav?.language || '',
      metadata: {
        client: 'kenos-web',
        standalone: Boolean(
          typeof window !== 'undefined' &&
          (window.matchMedia?.('(display-mode: standalone)')?.matches ||
            /** @type {any} */ (nav)?.standalone),
        ),
        nativeShell: isIosNativeShell(),
      },
    }
  }

  /**
   * @param {KenosLogLevel} level
   * @param {string} message
   * @param {{ category?: string, metadata?: Record<string, unknown>, file?: string, function?: string, line?: number }} [extra]
   */
  function append(level, message, extra = {}) {
    if (disposed) return null
    const event = {
      id: newId(),
      loggedAt: new Date().toISOString(),
      level: normalizeLogLevel(level),
      category: String(extra.category || 'app').slice(0, 64),
      message: redactLogText(message),
      metadata: redactLogMetadata({
        route: typeof window !== 'undefined' ? safeRoute(window.location) : '',
        ...extra.metadata,
      }),
      file: extra.file ? String(extra.file).slice(0, 200) : undefined,
      function: extra.function
        ? String(extra.function).slice(0, 120)
        : undefined,
      line: Number.isFinite(extra.line) ? Number(extra.line) : undefined,
    }
    ring.push(event)
    while (ring.length > MAX_RING) ring.shift()

    forwardToNative(event)

    if (levelMeetsMinimum(event.level, 'error')) {
      void flush({ reason: event.level })
    }
    return event
  }

  /**
   * @param {Record<string, unknown>} event
   */
  function forwardToNative(event) {
    if (typeof window === 'undefined') return
    try {
      const handler = /** @type {any} */ (window).webkit?.messageHandlers?.kenosNativeLog
      if (!handler || typeof handler.postMessage !== 'function') return
      handler.postMessage({
        level: event.level,
        category: event.category,
        message: event.message,
        metadata: event.metadata,
        source: 'kenos-web',
      })
    } catch {
      /* ignore */
    }
  }

  function pendingEvents(limit = MAX_BATCH) {
    return ring
      .filter(
        (e) =>
          !uploadedIds.has(String(e.id)) &&
          levelMeetsMinimum(
            /** @type {KenosLogLevel} */ (e.level),
            cloudMinLevel,
          ),
      )
      .slice(0, limit)
  }

  /**
   * @param {{ reason?: string, bugId?: string | null, force?: boolean }} [opts]
   */
  async function flush(opts = {}) {
    if (disposed) return { ok: false, skipped: 'disposed' }
    if (!enabled && !opts.bugId) return { ok: false, skipped: 'disabled' }
    if (uploading) return { ok: false, skipped: 'busy' }

    // Continuity shell: native KenosLogCloudSync owns cloud upload.
    if (isIosNativeShell() && !opts.force && !opts.bugId) {
      return { ok: false, skipped: 'native_shell' }
    }

    const supabase = getSupabase?.()
    const client = publicRpcClient(supabase)
    if (!client?.rpc) return { ok: false, skipped: 'no_supabase' }

    let session = null
    try {
      const auth = await supabase.auth?.getSession?.()
      session = auth?.data?.session || null
    } catch {
      session = null
    }
    if (!session?.access_token) {
      lastUploadError = 'Sign in to sync logs'
      return { ok: false, skipped: 'no_auth' }
    }

    const events = pendingEvents(MAX_BATCH)
    if (!events.length && !opts.bugId) {
      return { ok: true, inserted: 0, skipped: 0 }
    }

    uploading = true
    try {
      const { data, error } = await client.rpc('kenos_ingest_app_logs', {
        p_session: sessionPayload(),
        p_events: events,
        p_bug_id: opts.bugId || null,
      })
      if (error) {
        lastUploadError = errorMessage(error)
        return { ok: false, error: lastUploadError }
      }
      const inserted = Number(data?.inserted) || 0
      const skipped = Number(data?.skipped) || 0
      for (const e of events) uploadedIds.add(String(e.id))
      while (uploadedIds.size > MAX_UPLOADED_MEMORY) {
        const first = uploadedIds.values().next().value
        if (first == null) break
        uploadedIds.delete(first)
      }
      persistUploaded()
      lastUploadAt = new Date().toISOString()
      lastUploadError = null
      lastInserted = inserted

      // After a faultful batch, ask the server to re-evaluate alerts for this user.
      if (
        events.some((e) =>
          levelMeetsMinimum(/** @type {KenosLogLevel} */ (e.level), 'error'),
        )
      ) {
        try {
          await client.rpc('kenos_scan_app_log_alerts')
        } catch {
          /* alert scan is best-effort */
        }
      }

      return {
        ok: true,
        inserted,
        skipped,
        batchId: data?.batchId,
        reason: opts.reason,
      }
    } catch (err) {
      lastUploadError = errorMessage(err)
      return { ok: false, error: lastUploadError }
    } finally {
      uploading = false
    }
  }

  function installGlobalHandlers() {
    if (!captureGlobals || typeof window === 'undefined') return

    /** @param {ErrorEvent} event */
    const onError = (event) => {
      append('error', event.message || 'window.onerror', {
        category: 'window',
        metadata: {
          source: event.filename || '',
          lineno: String(event.lineno || ''),
          colno: String(event.colno || ''),
        },
        file: event.filename || undefined,
        line: event.lineno,
      })
    }

    /** @param {PromiseRejectionEvent} event */
    const onRejection = (event) => {
      const reason = event.reason
      const msg =
        reason instanceof Error
          ? `${reason.name}: ${reason.message}`
          : errorMessage(reason)
      append('error', msg || 'unhandledrejection', {
        category: 'promise',
        metadata: {
          stack:
            reason instanceof Error
              ? redactLogText(String(reason.stack || '').slice(0, 800))
              : '',
        },
      })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden')
        void flush({ reason: 'hidden' })
    }
    const onPageHide = () => {
      void flush({ reason: 'pagehide' })
    }
    const onOnline = () => {
      void flush({ reason: 'online' })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('online', onOnline)

    cleanups.push(() => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('online', onOnline)
    })
  }

  function startAutoSync() {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(() => {
      void flush({ reason: 'auto' })
    }, pollMs)
    // Warm-up after auth / hydration settles.
    setTimeout(() => void flush({ reason: 'startup' }), 4_000)
    setTimeout(() => void flush({ reason: 'startup2' }), 12_000)
  }

  installGlobalHandlers()
  startAutoSync()

  /** @type {(message: string, extra?: Record<string, any>) => any} */
  const logInfo = (message, extra) => append('info', message, extra)
  /** @type {(message: string, extra?: Record<string, any>) => any} */
  const logNotice = (message, extra) => append('notice', message, extra)
  /** @type {(message: string, extra?: Record<string, any>) => any} */
  const logWarning = (message, extra) => append('warning', message, extra)
  /** @type {(message: string, extra?: Record<string, any>) => any} */
  const logError = (message, extra) => append('error', message, extra)
  /** @type {(message: string, extra?: Record<string, any>) => any} */
  const logFault = (message, extra) => append('fault', message, extra)

  return {
    sessionId,
    log: logInfo,
    notice: logNotice,
    warning: logWarning,
    error: logError,
    fault: logFault,
    /**
     * @param {string} message
     * @param {Record<string, unknown>} [metadata]
     */
    breadcrumb: (message, metadata) =>
      append('notice', message, { category: 'breadcrumb', metadata }),
    flush,
    setEnabled: (/** @type {unknown} */ next) => {
      enabled = Boolean(next)
    },
    setCloudMinLevel: (/** @type {string} */ level) => {
      cloudMinLevel = normalizeLogLevel(level)
    },
    getStatus: () => ({
      app,
      sessionId,
      enabled,
      cloudMinLevel,
      pending: pendingEvents(500).length,
      ringSize: ring.length,
      uploading,
      lastUploadAt,
      lastUploadError,
      lastInserted,
      nativeShell: isIosNativeShell(),
    }),
    dispose: () => {
      disposed = true
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      for (const fn of cleanups) fn()
      cleanups.length = 0
    },
  }
}

/**
 * Install once per app shell. Returns dispose().
 * @param {Parameters<typeof createKenosAppLogs>[0]} options
 */
export function installKenosAppLogs(options) {
  if (typeof window === 'undefined') return () => {}
  const existing = /** @type {any} */ (window).__KENOS_APP_LOGS__
  if (existing?.dispose) {
    try {
      existing.dispose()
    } catch {
      /* ignore */
    }
  }
  const api = createKenosAppLogs(options)
  // Do not start the next statement with `(window)` — ASI would glue it onto the
  // previous call as `createKenosAppLogs(...)(window)`.
  const host = /** @type {any} */ (window)
  host.__KENOS_APP_LOGS__ = api
  api.notice(`${options.app} web log session started`, {
    category: 'lifecycle',
    metadata: { route: safeRoute(window.location) },
  })
  return () => api.dispose()
}
