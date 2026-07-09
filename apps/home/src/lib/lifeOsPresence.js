import { browser } from '$app/environment'
import { touchAppLastOpened } from '@life-os/sync'
import { auth } from './auth.svelte.js'
import { supabase, isSupabaseConfigured } from './supabase.js'

let lastTouchAt = 0
const MIN_INTERVAL_MS = 60_000

/** 登录用户打开 Home 时更新 Portal「继续」用的 last_opened_at */
export function touchLifeOsPresence() {
  if (!browser || !isSupabaseConfigured || !auth.user) return
  const now = Date.now()
  if (now - lastTouchAt < MIN_INTERVAL_MS) return
  lastTouchAt = now
  touchAppLastOpened(supabase, auth.user.id, 'home').catch(() => {})
}

/** @returns {() => void} */
export function bindLifeOsPresence() {
  if (!browser) return () => {}

  const onVisible = () => {
    if (document.visibilityState === 'visible' && auth.ready) touchLifeOsPresence()
  }

  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}
