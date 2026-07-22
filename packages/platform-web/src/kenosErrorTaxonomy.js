/**
 * KENOS F5-06.7 — one canonical operational error taxonomy.
 *
 * The read path (aios classifyReadError) and write path (planner
 * classifyFlushError) grew independent classifiers. This module is the single
 * stable set of categories both map into, each with: whether it is retryable,
 * whether it needs auth, and a human recovery hint (no raw DB text to users).
 * New code should classify with `toErrorCategory`; the existing classifiers'
 * outputs map here via CATEGORY_ALIASES.
 */

export const ERROR_CATEGORY = Object.freeze({
  AUTH_EXPIRED: 'auth_expired',
  UNAUTHORIZED: 'unauthorized',
  VALIDATION: 'validation',
  CONFLICT: 'conflict',
  DUPLICATE_REPLAY: 'duplicate_replay',
  NETWORK_UNAVAILABLE: 'network_unavailable',
  REQUEST_TIMEOUT: 'request_timeout',
  SERVER_UNAVAILABLE: 'server_unavailable',
  DATABASE_FAILURE: 'database_failure',
  LOCAL_PERSISTENCE: 'local_persistence_failure',
  CONTRACT_MISMATCH: 'contract_mismatch',
  MIGRATION_MISMATCH: 'migration_mismatch',
  REALTIME_DISCONNECTED: 'realtime_disconnected',
  CONNECTOR_FAILURE: 'connector_failure',
  AI_EXTRACTION_FAILURE: 'ai_extraction_failure',
  APPROVAL_REQUIRED: 'approval_required',
  ACTION_PROHIBITED: 'action_prohibited',
  UNKNOWN: 'unknown',
})

/** @type {Record<string, { retryable: boolean, needsAuth: boolean, recovery: string }>} */
export const ERROR_CATEGORY_META = Object.freeze({
  [ERROR_CATEGORY.AUTH_EXPIRED]: { retryable: true, needsAuth: true, recovery: '重新登录后会自动继续。' },
  [ERROR_CATEGORY.UNAUTHORIZED]: { retryable: false, needsAuth: true, recovery: '没有权限；请确认是本人账户。' },
  [ERROR_CATEGORY.VALIDATION]: { retryable: false, needsAuth: false, recovery: '内容不符合要求，请修改后重试。' },
  [ERROR_CATEGORY.CONFLICT]: { retryable: false, needsAuth: false, recovery: '有更新版本，请查看并选择保留哪个。' },
  [ERROR_CATEGORY.DUPLICATE_REPLAY]: { retryable: false, needsAuth: false, recovery: '已处理过，无需重复。' },
  [ERROR_CATEGORY.NETWORK_UNAVAILABLE]: { retryable: true, needsAuth: false, recovery: '网络恢复后会自动重试。' },
  [ERROR_CATEGORY.REQUEST_TIMEOUT]: { retryable: true, needsAuth: false, recovery: '超时；稍后会自动重试。' },
  [ERROR_CATEGORY.SERVER_UNAVAILABLE]: { retryable: true, needsAuth: false, recovery: '服务暂时不可用；稍后自动重试。' },
  [ERROR_CATEGORY.DATABASE_FAILURE]: { retryable: true, needsAuth: false, recovery: '暂时无法保存；稍后自动重试。' },
  [ERROR_CATEGORY.LOCAL_PERSISTENCE]: { retryable: true, needsAuth: false, recovery: '本机存储异常；请检查空间后重试。' },
  [ERROR_CATEGORY.CONTRACT_MISMATCH]: { retryable: false, needsAuth: false, recovery: '请更新到最新版本。' },
  [ERROR_CATEGORY.MIGRATION_MISMATCH]: { retryable: false, needsAuth: false, recovery: '服务正在升级，请稍后再试。' },
  [ERROR_CATEGORY.REALTIME_DISCONNECTED]: { retryable: true, needsAuth: false, recovery: '连接中断；已通过重新拉取恢复。' },
  [ERROR_CATEGORY.CONNECTOR_FAILURE]: { retryable: true, needsAuth: false, recovery: '外部连接失败；可稍后重试或重新授权。' },
  [ERROR_CATEGORY.AI_EXTRACTION_FAILURE]: { retryable: true, needsAuth: false, recovery: 'AI 处理失败；可重试或手动填写。' },
  [ERROR_CATEGORY.APPROVAL_REQUIRED]: { retryable: false, needsAuth: false, recovery: '此操作需要你确认后才能执行。' },
  [ERROR_CATEGORY.ACTION_PROHIBITED]: { retryable: false, needsAuth: false, recovery: '此操作不被允许。' },
  [ERROR_CATEGORY.UNKNOWN]: { retryable: true, needsAuth: false, recovery: '出现未知问题；稍后自动重试。' },
})

// Raw RPC / network error codes → canonical category.
const CODE_MAP = new Map([
  ['auth_required', ERROR_CATEGORY.AUTH_EXPIRED],
  ['jwt expired', ERROR_CATEGORY.AUTH_EXPIRED],
  ['jwt_expired', ERROR_CATEGORY.AUTH_EXPIRED],
  ['token_expired', ERROR_CATEGORY.AUTH_EXPIRED],
  ['unauthorized', ERROR_CATEGORY.UNAUTHORIZED],
  ['permission denied', ERROR_CATEGORY.UNAUTHORIZED],
  ['42501', ERROR_CATEGORY.UNAUTHORIZED],
  ['actor_user_mismatch', ERROR_CATEGORY.UNAUTHORIZED],
  ['wrong_owner', ERROR_CATEGORY.UNAUTHORIZED],
  ['security_domain_not_allowed', ERROR_CATEGORY.ACTION_PROHIBITED],
  ['risk_not_allowed', ERROR_CATEGORY.APPROVAL_REQUIRED],
  ['title_required', ERROR_CATEGORY.VALIDATION],
  ['invalid_action_payload', ERROR_CATEGORY.VALIDATION],
  ['capture_id_required', ERROR_CATEGORY.VALIDATION],
  ['idempotency_key_required', ERROR_CATEGORY.VALIDATION],
  ['requested_at_required', ERROR_CATEGORY.VALIDATION],
  ['device_id_required', ERROR_CATEGORY.VALIDATION],
  ['correlation_id_required', ERROR_CATEGORY.VALIDATION],
  ['capture_not_found', ERROR_CATEGORY.VALIDATION],
  ['task_not_found', ERROR_CATEGORY.VALIDATION],
  ['action_id_reused', ERROR_CATEGORY.DUPLICATE_REPLAY],
  ['stale_version', ERROR_CATEGORY.CONFLICT],
  ['version_conflict', ERROR_CATEGORY.CONFLICT],
  ['schema_version_not_supported', ERROR_CATEGORY.CONTRACT_MISMATCH],
  ['unsupported_action', ERROR_CATEGORY.CONTRACT_MISMATCH],
  ['pgrst205', ERROR_CATEGORY.MIGRATION_MISMATCH],
  ['42p01', ERROR_CATEGORY.MIGRATION_MISMATCH],
  ['fetch failed', ERROR_CATEGORY.NETWORK_UNAVAILABLE],
  ['failed to fetch', ERROR_CATEGORY.NETWORK_UNAVAILABLE],
  ['networkerror', ERROR_CATEGORY.NETWORK_UNAVAILABLE],
  ['timeout', ERROR_CATEGORY.REQUEST_TIMEOUT],
  ['503', ERROR_CATEGORY.SERVER_UNAVAILABLE],
  ['502', ERROR_CATEGORY.SERVER_UNAVAILABLE],
  ['500', ERROR_CATEGORY.DATABASE_FAILURE],
])

// Map the two existing classifiers' outputs into the canonical set.
export const CATEGORY_ALIASES = Object.freeze({
  // classifyFlushError (write): retryable | rejected | conflict | auth
  retryable: ERROR_CATEGORY.NETWORK_UNAVAILABLE,
  rejected: ERROR_CATEGORY.VALIDATION,
  conflict: ERROR_CATEGORY.CONFLICT,
  auth: ERROR_CATEGORY.AUTH_EXPIRED,
  // classifyReadError (read): offline | permission_denied | unavailable
  offline: ERROR_CATEGORY.NETWORK_UNAVAILABLE,
  permission_denied: ERROR_CATEGORY.UNAUTHORIZED,
  unavailable: ERROR_CATEGORY.SERVER_UNAVAILABLE,
})

/**
 * Classify a raw error string/code into a canonical category.
 * @param {string | null | undefined} raw
 * @returns {string} ERROR_CATEGORY value
 */
export function toErrorCategory(raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (!s) return ERROR_CATEGORY.UNKNOWN
  if (CATEGORY_ALIASES[s]) return CATEGORY_ALIASES[s]
  const code = s.split(':')[0].trim()
  if (CODE_MAP.has(code)) return CODE_MAP.get(code)
  for (const [needle, cat] of CODE_MAP) if (s.includes(needle)) return cat
  return ERROR_CATEGORY.UNKNOWN
}

/**
 * Recovery metadata for a raw error (safe to show; retry semantics).
 * @param {string | null | undefined} raw
 */
export function describeError(raw) {
  const category = toErrorCategory(raw)
  const meta = ERROR_CATEGORY_META[category] || ERROR_CATEGORY_META[ERROR_CATEGORY.UNKNOWN]
  return { category, ...meta }
}
