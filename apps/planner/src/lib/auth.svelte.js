import { createAppAuthStore } from '@life-os/sync/svelte/auth-store'
import { supabase } from './supabase.js'
import { clearAllCache } from './localCache.js'
import { syncBidirectional, resetSyncCooldown } from './sync.js'
import { clearSessionUserData } from './state.svelte.js'
import { buildSignedOutState } from './kenos/sessionCleanup.core.js'
import { clearOfflineQueue } from './kenos/planOfflineIntentQueue.core.js'
import { t } from './i18n/index.js'

/** Tracks whether this tab ever held an authenticated session (avoid wiping local-first cold start). */
let hadAuthenticatedSession = false

function clearUserSessionSurfaces() {
  resetSyncCooldown()
  clearAllCache()
  clearSessionUserData(buildSignedOutState)
  if (typeof localStorage !== 'undefined') clearOfflineQueue(localStorage)
  if (typeof document !== 'undefined' && /·/.test(document.title || '')) {
    document.title = 'PLANNER.OS'
  }
}

export const { auth, initAuth, authErrorMessage, signUp, signIn, signOut } =
  createAppAuthStore(supabase, {
    appId: 'planner',
    errorLabels: () => ({
      invalidCredentials: t('auth.errInvalidCredentials'),
      emailNotConfirmed: t('auth.errEmailNotConfirmed'),
      alreadyRegistered: t('auth.errAlreadyRegistered'),
      passwordShort: t('auth.errPasswordShort'),
      invalidEmail: t('auth.errInvalidEmail'),
      rateLimit: t('auth.errRateLimit'),
      network: t('auth.errNetwork'),
      generic: t('auth.errGeneric'),
    }),
    onSessionChange: (session) => {
      if (session?.user) {
        hadAuthenticatedSession = true
        return
      }
      // Only clear after an authenticated session ends — not on never-logged-in cold start.
      if (hadAuthenticatedSession) {
        hadAuthenticatedSession = false
        clearUserSessionSurfaces()
      }
    },
    onSignedOut: () => {
      hadAuthenticatedSession = false
      clearUserSessionSurfaces()
    },
    onSyncSession: ({ force }) => syncBidirectional({ silent: true, force }),
  })
