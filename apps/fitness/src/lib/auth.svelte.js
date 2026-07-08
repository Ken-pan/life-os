import { createLifeOsAuth, mapAuthErrorMessage } from '@life-os/sync'
import { supabase } from './supabase.js'
import { syncBidirectional, resetSyncCooldown } from './sync.js'
import { t } from './i18n/index.js'

export const auth = $state({
  user: null,
  session: null,
  ready: false,
})

const lifeOsAuth = createLifeOsAuth(supabase, {
  appId: 'fitness',
  onSession: (session) => {
    auth.session = session
    auth.user = session?.user ?? null
    auth.ready = true
  },
  onSignedOut: resetSyncCooldown,
  onSyncSession: ({ force }) => syncBidirectional({ silent: true, force }),
})

export const initAuth = lifeOsAuth.init
export const { signUp, signIn, signOut } = lifeOsAuth

const authErrorLabels = () => ({
  invalidCredentials: t('auth.errInvalidCredentials'),
  emailNotConfirmed: t('auth.errEmailNotConfirmed'),
  alreadyRegistered: t('auth.errAlreadyRegistered'),
  passwordShort: t('auth.errPasswordShort'),
  invalidEmail: t('auth.errInvalidEmail'),
  rateLimit: t('auth.errRateLimit'),
  network: t('auth.errNetwork'),
  generic: t('auth.errGeneric'),
})

export function authErrorMessage(err) {
  return mapAuthErrorMessage(err, authErrorLabels())
}
