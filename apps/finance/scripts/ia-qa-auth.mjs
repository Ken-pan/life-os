/**
 * Shared Supabase session helpers for Finance IA QA scripts (F-P0).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export const LIFE_OS_AUTH_STORAGE_KEY = 'life_os_auth'

/** @param {string} root Finance app root (directory containing .env.local) */
export function loadFinanceQaEnv(root) {
  const envPath = resolve(root, '.env.local')
  if (!existsSync(envPath)) {
    throw new Error(`Missing ${envPath} — copy from .env.example or set VITE_SUPABASE_*`)
  }
  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i), l.slice(i + 1)]
      }),
  )
}

/**
 * @param {Record<string, string>} env
 * @param {{ email?: string, password?: string }} [options]
 */
export async function signInForFinanceQa(env, options = {}) {
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
  }

  const email = options.email ?? process.env.FINANCE_QA_EMAIL ?? process.env.UI_QA_EMAIL
  const password = options.password ?? process.env.FINANCE_QA_PASSWORD ?? process.env.UI_QA_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Missing FINANCE_QA_EMAIL or FINANCE_QA_PASSWORD. Set rotated disposable QA credentials; values are never logged.',
    )
  }

  const sb = createClient(url, anonKey, {
    auth: { storageKey: LIFE_OS_AUTH_STORAGE_KEY, persistSession: false },
  })

  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(error?.message ?? 'signInWithPassword returned no session')
  }
  return data.session
}

/**
 * @param {import('playwright').Page} page
 * @param {import('@supabase/supabase-js').Session} session
 * @param {string} baseUrl
 */
export async function injectLifeOsSession(page, session, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ key, session: s }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: s.access_token,
          refresh_token: s.refresh_token,
          expires_at: s.expires_at,
          expires_in: s.expires_in,
          token_type: s.token_type,
          user: s.user,
        }),
      )
    },
    { key: LIFE_OS_AUTH_STORAGE_KEY, session },
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.app-shell', { timeout: 30000 })
}
