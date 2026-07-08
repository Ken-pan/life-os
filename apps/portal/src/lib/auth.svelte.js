import { browser } from '$app/environment'
import { createLifeOsAuth } from '@life-os/sync'
import { supabase } from './supabase.js'

/** @type {{ user: import('@supabase/supabase-js').User | null; session: import('@supabase/supabase-js').Session | null; ready: boolean }} */
export const auth = $state({
  user: null,
  session: null,
  ready: false,
})

const lifeOsAuth = createLifeOsAuth(supabase, {
  appId: 'portal',
  onSession: (session) => {
    auth.session = session
    auth.user = session?.user ?? null
    auth.ready = true
  },
})

export function initAuth() {
  if (!browser) return () => {}
  return lifeOsAuth.init()
}

export const { signOut } = lifeOsAuth
