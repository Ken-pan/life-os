import { createAuthSyncHandler, mapAuthErrorMessage } from '@life-os/sync';
import { supabase } from './supabase.js';
import { syncBidirectional, resetSyncCooldown } from './sync.js';
import { t } from './i18n/index.js';

export const auth = $state({
  user: null,
  session: null,
  ready: false
});

export function initAuth() {
  if (typeof window === 'undefined') return () => {};

  supabase.auth.getSession().then(({ data }) => {
    auth.session = data.session;
    auth.user = data.session?.user ?? null;
    auth.ready = true;
  });

  const handleAuthSync = createAuthSyncHandler({
    onSignedOut: resetSyncCooldown,
    onSyncSession: ({ force }) => syncBidirectional({ silent: true, force })
  });

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    auth.session = session;
    auth.user = session?.user ?? null;
    auth.ready = true;
    handleAuthSync(event, session);
  });

  return () => data.subscription.unsubscribe();
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { needsConfirm: !data.session, user: data.user };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

const authErrorLabels = () => ({
  invalidCredentials: t('auth.errInvalidCredentials'),
  emailNotConfirmed: t('auth.errEmailNotConfirmed'),
  alreadyRegistered: t('auth.errAlreadyRegistered'),
  passwordShort: t('auth.errPasswordShort'),
  invalidEmail: t('auth.errInvalidEmail'),
  rateLimit: t('auth.errRateLimit'),
  network: t('auth.errNetwork'),
  generic: t('auth.errGeneric')
});

export function authErrorMessage(err) {
  return mapAuthErrorMessage(err, authErrorLabels());
}
