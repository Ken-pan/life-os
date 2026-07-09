/**
 * Portal UI screenshot QA — 五卡摘要 · ⌘K · G-P8 inbox 铃铛角标
 *
 * Usage:
 *   npm run preview -- --host 127.0.0.1 --port 5195
 *   PORTAL_QA_URL=http://127.0.0.1:5195 node scripts/qa-screenshot.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import {
  LIFE_OS_SUPABASE_PUBLISHABLE_KEY,
  LIFE_OS_SUPABASE_URL,
} from '../../../packages/sync/src/supabaseClient.js'
import {
  resolveScreenshotDir,
  resolveShotPath,
  writeManifest,
} from '../../../scripts/qa/screenshot-output.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const { dir: outDir } = resolveScreenshotDir({
  app: 'portal',
  suite: 'main',
  importMetaUrl: import.meta.url,
})
const baseUrl = process.env.PORTAL_QA_URL ?? 'http://127.0.0.1:5195'
const LIFE_OS_AUTH_STORAGE_KEY = 'life_os_auth'
const plannerInboxPath = '/inbox'

/** @type {Record<string, unknown>} */
const manifest = {
  capturedAt: new Date().toISOString(),
  baseUrl,
  checks: [],
}

async function signIn() {
  const email = process.env.UI_QA_EMAIL ?? 'p1a-rls-test-b@example.test'
  const password = process.env.UI_QA_PASSWORD ?? 'P1aTestPass!2026'
  const sb = createClient(
    LIFE_OS_SUPABASE_URL,
    LIFE_OS_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { storageKey: LIFE_OS_AUTH_STORAGE_KEY, persistSession: false },
    },
  )
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session)
    throw new Error(error?.message ?? 'sign in failed')
  return data.session
}

async function injectSession(page, session) {
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
}

mkdirSync(outDir, { recursive: true })

const session = await signIn()
const browser = await chromium.launch()
const desktop = await browser.newContext({
  viewport: { width: 1280, height: 800 },
})
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
})

for (const [label, ctx] of [
  ['desktop', desktop],
  ['mobile', mobile],
]) {
  const page = await ctx.newPage()
  await injectSession(page, session)
  await page.waitForSelector('.portal-page-header, .page-title', {
    timeout: 20000,
  })
  await page.waitForTimeout(1500)

  await page.screenshot({
    path: resolveShotPath(outDir, { viewport: label, surface: 'home' }),
    fullPage: label === 'desktop',
  })

  if (label === 'mobile') {
    const launcher = page.locator('.portal-app-section')
    if (await launcher.isVisible().catch(() => false)) {
      await launcher.screenshot({
        path: resolveShotPath(outDir, { viewport: label, surface: 'launcher' }),
      })
    }
  }

  const summary = page.locator('.portal-summary')
  if (await summary.isVisible().catch(() => false)) {
    await summary.screenshot({
      path: resolveShotPath(outDir, { viewport: label, surface: 'summary' }),
    })
  }

  const appbar = page.locator('.portal-appbar')
  if (await appbar.isVisible().catch(() => false)) {
    await appbar.screenshot({
      path: resolveShotPath(outDir, { viewport: label, surface: 'appbar' }),
    })
  }

  const status = page.locator('.portal-status-summary')
  if (await status.isVisible().catch(() => false)) {
    await status.screenshot({
      path: resolveShotPath(outDir, { viewport: label, surface: 'status' }),
    })
  }

  const badge = page.locator('.portal-inbox-btn')
  const pendingLink = page.locator('.portal-pending-link')
  manifest.checks.push({
    viewport: label,
    pendingBadgeVisible: await badge.isVisible().catch(() => false),
    pendingBadgeHref:
      (await badge.getAttribute('href').catch(() => null)) ?? null,
    pendingLinkVisible: await pendingLink.isVisible().catch(() => false),
    pendingLinkHref:
      (await pendingLink.getAttribute('href').catch(() => null)) ?? null,
    inboxPathOk:
      ((await badge.getAttribute('href').catch(() => '')) ?? '').includes(
        plannerInboxPath,
      ) ||
      ((await pendingLink.getAttribute('href').catch(() => '')) ?? '').includes(
        plannerInboxPath,
      ),
  })

  await page.keyboard.press('Meta+k')
  await page.waitForSelector('.command-palette-modal[open]', { timeout: 5000 })
  await page.screenshot({
    path: resolveShotPath(outDir, {
      viewport: label,
      surface: 'command-palette',
    }),
    fullPage: false,
  })

  const input = page.locator('.cp-input')
  await input.fill('曲库')
  await page.waitForTimeout(300)
  await page.screenshot({
    path: resolveShotPath(outDir, {
      viewport: label,
      surface: 'command-palette',
      state: 'filter',
    }),
    fullPage: false,
  })

  await page.close()
}

await browser.close()
writeManifest(outDir, manifest)
console.log(`Portal screenshots → ${outDir}`)
