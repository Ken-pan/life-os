export {
  LIFE_OS_AUTH_STORAGE_KEY,
  LIFE_OS_PERSONAL_OWNER_EMAIL,
  SYNC_DEFAULTS,
  AUTH_SYNC_EVENTS,
  syncMetaStorageKey,
  readSyncMeta,
  writeSyncMeta,
} from './constants.js'

export { createBidirectionalSync } from './bidirectional.js'
export { createDebouncedTask } from './debounced.js'
export { bindVisibilitySync } from './visibility.js'
export { createAuthSyncHandler } from './authSync.js'
export { formatSyncErrorMessage } from './syncErrorMessage.js'
export { createSyncNotify } from './syncNotify.js'
export { mapAuthErrorMessage } from './authErrorMessage.js'
export { notifyManualSyncResult } from './manualSyncResult.js'
export { resolveSupabaseEnv, createSupabaseAuthOptions } from './supabaseEnv.js'
export {
  LIFE_OS_SUPABASE_URL,
  LIFE_OS_SUPABASE_PUBLISHABLE_KEY,
  createLifeOsSupabaseClient,
  ensureLifeOsSsoReady,
} from './supabaseClient.js'
export { createLifeOsAuth } from './authController.js'
export {
  ensureCoreProfile,
  touchAppLastOpened,
  createCoreIdentityHandler,
} from './coreIdentity.js'
export { syncHomePortalSummary } from './homePortalMetadata.js'
export {
  setupCrossDomainSSO,
  LIFE_OS_SSO_COOKIE_NAME,
  resolveSsoCookieDomain,
  parseJwtExp,
  isAccessTokenFresh,
  normalizeSsoTokens,
  isFatalAuthRestoreError,
} from './sso.js'

/** Life OS 四端 appId */
export const LIFE_OS_APP_IDS = /** @type {const} */ ([
  'finance',
  'fitness',
  'planner',
  'music',
  'portal',
  'home',
])
