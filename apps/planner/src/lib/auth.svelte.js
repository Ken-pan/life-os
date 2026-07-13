import { createAppAuthStore } from '@life-os/sync/svelte/auth-store'
import { supabase } from './supabase.js'
import { clearAllCache } from './localCache.js'
import { syncBidirectional, resetSyncCooldown } from './sync.js'
import { t } from './i18n/index.js'

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
    onSignedOut: () => {
      resetSyncCooldown()
      clearAllCache()
    },
    onSyncSession: ({ force }) => syncBidirectional({ silent: true, force }),
  })
