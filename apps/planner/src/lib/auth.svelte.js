import { browser } from '$app/environment';
import { createAuthSyncHandler } from '@life-os/sync';
import { supabase } from './supabase.js';
import { clearAllCache } from './localCache.js';
import { syncBidirectional, resetSyncCooldown } from './sync.js';
import { t } from './i18n/index.js';

export const auth = $state({
  user: null,
  session: null,
  ready: false
});

export function initAuth() {
  if (!browser) return () => {};

  supabase.auth.getSession().then(({ data }) => {
    auth.session = data.session;
    auth.user = data.session?.user ?? null;
    auth.ready = true;
  });

  const handleAuthSync = createAuthSyncHandler({
    onSignedOut: () => {
      resetSyncCooldown();
      clearAllCache();
    },
    onSyncSession: ({ silent, force }) => syncBidirectional({ silent, force })
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
  clearAllCache();
}

export function authErrorMessage(err) {
  const msg = err?.message || '';
  if (/invalid login credentials/i.test(msg)) return t('auth.errInvalidCredentials');
  if (/email not confirmed/i.test(msg)) return t('auth.errEmailNotConfirmed');
  if (/user already registered/i.test(msg)) return t('auth.errAlreadyRegistered');
  if (/password should be at least/i.test(msg)) return t('auth.errPasswordShort');
  if (/unable to validate email|invalid email/i.test(msg)) return t('auth.errInvalidEmail');
  if (/rate limit|too many requests/i.test(msg)) return t('auth.errRateLimit');
  if (/network|fetch/i.test(msg)) return t('auth.errNetwork');
  return msg || t('auth.errGeneric');
}
