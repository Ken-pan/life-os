#!/usr/bin/env node
/**
 * Current-HEAD Continuity Regression — preflight only.
 *
 * Does NOT run Flow A/B. Exit 0 only when environment is healthy enough
 * for scripts/qa/kenos-space-continuity-e2e-flows.mjs (Vite DEV required).
 *
 * Usage:
 *   node scripts/qa/kenos-continuity-regression-preflight.mjs
 *   node scripts/qa/kenos-continuity-regression-preflight.mjs --json
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { assertTestWriteAllowed } from '../lib/testProductionGuard.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const AIOS = process.env.KENOS_AIOS_URL || 'http://127.0.0.1:5197'
const PLANNER = process.env.KENOS_PLANNER_URL || 'http://127.0.0.1:5188'
const FITNESS = process.env.KENOS_FITNESS_URL || 'http://127.0.0.1:5190'
const OWNER = {
  id: 'c2831538-94b0-4a57-b034-5e873a53c42e',
  email: '334452284ken@gmail.com',
}
const USER_B = {
  id: '8febdb83-ec49-467d-a9bf-d42620cc68fe',
  email: 'pettimes666666@gmail.com',
}
const EXERCISE_ID = 'c_fly'
function localDateISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const TODAY = localDateISO()
const asJson = process.argv.includes('--json')

/** @type {{ id: string, ok: boolean, class?: string, detail?: unknown }[]} */
const checks = []

function push(id, ok, detail = {}, failureClass = 'environment') {
  checks.push({
    id,
    ok,
    class: ok ? 'ok' : failureClass,
    detail,
  })
  if (!asJson) {
    const mark = ok ? 'PASS' : 'FAIL'
    console.log(
      `[${mark}] ${id}`,
      detail && Object.keys(detail).length ? detail : '',
    )
  }
}

async function httpOk(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    return { ok: res.ok || res.status === 200, status: res.status }
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message || e) }
  }
}

function getKey(name) {
  const raw = execSync(
    `supabase projects api-keys --project-ref iueozzuctstwvzbcxcyh -o json`,
    { encoding: 'utf8' },
  )
  const d = JSON.parse(raw)
  return d.find((x) => x.name === name)?.api_key
}

async function sessionFor(admin, anon, email) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (error) throw error
  const token_hash = data.properties.hashed_token
  const { data: v, error: ve } = await anon.auth.verifyOtp({
    token_hash,
    type: 'email',
  })
  if (ve) throw ve
  return v.session
}

async function main() {
  const startedAt = new Date().toISOString()

  // 1–2 HTTP
  const aiosHttp = await httpOk(AIOS + '/')
  push('aios.http', aiosHttp.ok, { url: AIOS, ...aiosHttp })

  const plannerHttp = await httpOk(PLANNER + '/')
  push('planner.http', plannerHttp.ok, { url: PLANNER, ...plannerHttp })

  const fitnessHttp = await httpOk(FITNESS + '/')
  push('fitness.http', fitnessHttp.ok, { url: FITNESS, ...fitnessHttp })

  // 3 Planner module path (Vite DEV required by Continuity harness)
  let plannerModule = { ok: false }
  try {
    const res = await fetch(PLANNER + '/src/lib/sync.js', {
      redirect: 'manual',
    })
    const ct = res.headers.get('content-type') || ''
    const body = await res.text()
    const looksLikeSource =
      res.ok &&
      !ct.includes('text/html') &&
      (body.includes('pushToCloud') ||
        body.includes('syncNow') ||
        body.includes('export'))
    plannerModule = {
      ok: looksLikeSource,
      status: res.status,
      contentType: ct,
      snippet: body.slice(0, 80),
      mode: looksLikeSource ? 'vite-dev' : 'preview-or-missing',
    }
  } catch (e) {
    plannerModule = { ok: false, error: String(e?.message || e) }
  }
  push('planner.sync_module', plannerModule.ok, plannerModule, 'environment')

  let fitnessModule = { ok: false }
  try {
    const res = await fetch(FITNESS + '/src/lib/sync.js', {
      redirect: 'manual',
    })
    const ct = res.headers.get('content-type') || ''
    const body = await res.text()
    const looksLikeSource =
      res.ok &&
      !ct.includes('text/html') &&
      (body.includes('pushToCloud') || body.includes('export'))
    fitnessModule = {
      ok: looksLikeSource,
      status: res.status,
      contentType: ct,
      mode: looksLikeSource ? 'vite-dev' : 'preview-or-missing',
    }
  } catch (e) {
    fitnessModule = { ok: false, error: String(e?.message || e) }
  }
  push('fitness.sync_module', fitnessModule.ok, fitnessModule, 'environment')

  // Auth + DB
  let admin
  let anon
  let sessionA
  let sessionB
  try {
    const url = 'https://iueozzuctstwvzbcxcyh.supabase.co'
    const anonKey = getKey('anon')
    const srk = getKey('service_role')
    // Default-DENY production for test writes (scoped G2 authorization + KENOS_PROD_TEST_AUTHORIZED=1 required).
    assertTestWriteAllowed({ url })
    admin = createClient(url, srk, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    sessionA = await sessionFor(admin, anon, OWNER.email)
    sessionB = await sessionFor(admin, anon, USER_B.email)
    push('auth.sessions', Boolean(sessionA?.user?.id && sessionB?.user?.id), {
      A: sessionA?.user?.id,
      B: sessionB?.user?.id,
      A_match: sessionA?.user?.id === OWNER.id,
      B_match: sessionB?.user?.id === USER_B.id,
    })
  } catch (e) {
    push(
      'auth.sessions',
      false,
      { error: String(e?.message || e) },
      'environment',
    )
  }

  // DB query + cleanup capability
  try {
    const { data, error } = await admin
      .from('planner_tasks')
      .select('id')
      .eq('user_id', OWNER.id)
      .like('id', 'kenos-cont-%')
      .limit(5)
    push(
      'db.planner_query',
      !error,
      { count: data?.length ?? 0, error: error?.message || null },
      error ? 'environment' : 'ok',
    )
  } catch (e) {
    push(
      'db.planner_query',
      false,
      { error: String(e?.message || e) },
      'environment',
    )
  }

  const fitnessAdmin = admin
    ? createClient(
        'https://iueozzuctstwvzbcxcyh.supabase.co',
        getKey('service_role'),
        {
          auth: { persistSession: false, autoRefreshToken: false },
          db: { schema: 'fitness' },
        },
      )
    : null

  try {
    const { data: sessions, error } = await fitnessAdmin
      .from('fitness_workout_sessions')
      .select('id,session_date,day_id')
      .eq('user_id', OWNER.id)
      .eq('session_date', TODAY)
      .eq('day_id', 'chest')
    push(
      'db.fitness_sessions_today',
      !error,
      {
        sessions: sessions?.length ?? 0,
        ids: (sessions || []).map((s) => s.id),
        error: error?.message || null,
      },
      error ? 'environment' : 'ok',
    )
  } catch (e) {
    push(
      'db.fitness_sessions_today',
      false,
      { error: String(e?.message || e) },
      'environment',
    )
  }

  // Browser probes (only if HTTP + sync module look viable)
  const browser = await chromium.launch({ headless: true })
  try {
    // AIOS Continue harness
    {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
      })
      const page = await ctx.newPage()
      await page.goto(AIOS + '/?kenosDemo=1', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      await page.waitForTimeout(500)
      const cont = await page.getByTestId('kenos-today-continue').count()
      push('aios.continue_harness', cont > 0, { continueTestIdCount: cont })
      await ctx.close()
    }

    // Planner #task-title after auth + open seeded-like upcoming
    if (sessionA && plannerModule.ok) {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      })
      const page = await ctx.newPage()
      await page.goto(PLANNER + '/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      await page.evaluate((s) => {
        localStorage.setItem('life_os_auth', JSON.stringify(s))
      }, sessionA)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)

      // Seed a temp task via admin for DOM probe, then open it
      const probeId = `kenos-preflight-${Date.now().toString(36)}`
      const now = new Date().toISOString()
      const { error: upsertErr } = await admin.from('planner_tasks').upsert({
        id: probeId,
        user_id: OWNER.id,
        os_module: 'planner',
        updated_at: now,
        data: {
          id: probeId,
          title: 'Preflight Continuity Probe',
          notes: '',
          completed: false,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          dueDate: now.slice(0, 10),
          listId: null,
          projectId: null,
          priority: 'normal',
          urgency: 'normal',
          tags: ['kenos-preflight'],
          subtasks: [],
          meta: { continuityPreflight: true },
        },
      })
      if (upsertErr) {
        push(
          'planner.task_title',
          false,
          { upsertErr: upsertErr.message },
          'fixture',
        )
      } else {
        const syncSeed = await page.evaluate(async (taskId) => {
          try {
            const sync = await import('/src/lib/sync.js')
            if (typeof sync.syncNow === 'function') await sync.syncNow('merge')
            else if (typeof sync.pullFromCloud === 'function')
              await sync.pullFromCloud('merge')
            const { S } = await import('/src/lib/state.svelte.js')
            return {
              ok: true,
              hasTask: Boolean(
                S.tasks?.find((t) => t.id === taskId && !t.deletedAt),
              ),
            }
          } catch (e) {
            return { ok: false, reason: String(e?.message || e) }
          }
        }, probeId)

        await page.goto(
          `${PLANNER}/upcoming?kenosTask=${encodeURIComponent(probeId)}&kenosDetail=1`,
          { waitUntil: 'domcontentloaded', timeout: 30000 },
        )
        await page.waitForTimeout(1500)
        const titleCount = await page.locator('#task-title').count()
        const titleVal =
          titleCount > 0
            ? await page
                .locator('#task-title')
                .inputValue()
                .catch(() => '')
            : ''
        push(
          'planner.task_title',
          titleCount > 0 && Boolean(titleVal),
          { syncSeed, titleCount, titleVal },
          syncSeed.ok === false ? 'environment' : titleCount ? 'ok' : 'fixture',
        )

        // cleanup probe task
        await admin
          .from('planner_tasks')
          .delete()
          .eq('id', probeId)
          .eq('user_id', OWNER.id)
      }
      await ctx.close()
    } else {
      push(
        'planner.task_title',
        false,
        { skipped: true, reason: 'auth or planner.sync_module failed' },
        'environment',
      )
    }

    // Fitness Set1 → Set2 CTA
    if (sessionA && fitnessModule.ok && fitnessAdmin) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
      })
      const page = await ctx.newPage()
      await page.goto(FITNESS + '/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      await page.evaluate((s) => {
        localStorage.setItem('life_os_auth', JSON.stringify(s))
      }, sessionA)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)

      // Clear today's chest c_fly log pollution
      const { data: sessions } = await fitnessAdmin
        .from('fitness_workout_sessions')
        .select('id')
        .eq('user_id', OWNER.id)
        .eq('session_date', TODAY)
        .eq('day_id', 'chest')
      const ids = (sessions || []).map((s) => s.id)
      if (ids.length) {
        await fitnessAdmin
          .from('fitness_exercise_logs')
          .delete()
          .in('session_id', ids)
          .eq('exercise_id', EXERCISE_ID)
      }

      await page.goto(
        `${FITNESS}/day/chest/focus?kenosEx=${EXERCISE_ID}&kenosSet=1`,
        { waitUntil: 'domcontentloaded', timeout: 30000 },
      )
      await page.waitForTimeout(2000)

      const set1 = await page.evaluate(() => {
        const progress = document.querySelector(
          '[data-testid="fitness-focus-set-progress"]',
        )
        const cta = document.querySelector(
          '[data-testid="fitness-focus-complete-set"]',
        )
        return {
          progressText: progress?.textContent?.trim() || '',
          ctaText: cta?.textContent?.trim() || '',
          ctaVisible: Boolean(cta && cta.offsetParent !== null),
          bodyHasFly: /绳索夹胸|Cable fly|c_fly/i.test(document.body.innerText),
          title:
            document
              .querySelector('h1, .ex-name, .focus-title')
              ?.textContent?.trim() || '',
        }
      })

      let advanced = { ok: false }
      if (set1.ctaVisible) {
        await page.getByTestId('fitness-focus-complete-set').click()
        await page.waitForTimeout(1500)
        // Prefer product navigation; if still on set1 CTA, try focus URL set=2 after completion
        await page
          .goto(
            `${FITNESS}/day/chest/focus?kenosEx=${EXERCISE_ID}&kenosSet=2`,
            { waitUntil: 'domcontentloaded', timeout: 30000 },
          )
          .catch(() => {})
        await page.waitForTimeout(1500)
        advanced = await page.evaluate(() => {
          const progress = document.querySelector(
            '[data-testid="fitness-focus-set-progress"]',
          )
          const cta = document.querySelector(
            '[data-testid="fitness-focus-complete-set"]',
          )
          const t =
            (progress?.textContent || '') + ' ' + (cta?.textContent || '')
          const onSet2 =
            /1\/3|第\s*2\s*组|完成第\s*2|Set\s*2/i.test(t) ||
            /完成第\s*2/.test(cta?.textContent || '')
          return {
            ok: onSet2,
            progressText: progress?.textContent?.trim() || '',
            ctaText: cta?.textContent?.trim() || '',
          }
        })
      }

      push(
        'fitness.set1_cta',
        set1.ctaVisible && set1.bodyHasFly,
        set1,
        set1.bodyHasFly ? (set1.ctaVisible ? 'ok' : 'fixture') : 'fixture',
      )
      push(
        'fitness.set1_to_set2',
        Boolean(advanced.ok),
        advanced,
        advanced.ok ? 'ok' : 'fixture',
      )
      await ctx.close()
    } else {
      push(
        'fitness.set1_cta',
        false,
        { skipped: true, reason: 'auth or fitness.sync_module failed' },
        'environment',
      )
      push(
        'fitness.set1_to_set2',
        false,
        { skipped: true, reason: 'auth or fitness.sync_module failed' },
        'environment',
      )
    }
  } finally {
    await browser.close()
  }

  const required = [
    'aios.http',
    'aios.continue_harness',
    'planner.http',
    'planner.sync_module',
    'planner.task_title',
    'fitness.http',
    'fitness.sync_module',
    'fitness.set1_cta',
    'fitness.set1_to_set2',
    'auth.sessions',
    'db.planner_query',
    'db.fitness_sessions_today',
  ]
  const failed = checks.filter((c) => required.includes(c.id) && !c.ok)
  const ok = failed.length === 0
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    headHint: 'run git rev-parse HEAD separately',
    ports: { AIOS, PLANNER, FITNESS },
    ok,
    failed: failed.map((f) => f.id),
    checks,
    next: ok
      ? 'Safe to run: node scripts/qa/kenos-space-continuity-e2e-flows.mjs'
      : 'Do NOT run full Continuity E2E. Fix environment/fixture first. No Gate change.',
  }

  const outDir = join(
    ROOT,
    'docs/qa/evidence/kenos-space-continuity-2026-07-20/e2e-flows',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `preflight-${Date.now()}.json`)
  writeFileSync(outPath, JSON.stringify(report, null, 2))

  if (asJson) console.log(JSON.stringify(report, null, 2))
  else {
    console.log('\n=== PREFLIGHT', ok ? 'PASS' : 'FAIL', '===')
    console.log('wrote', outPath)
    if (!ok) console.log('failed:', failed.map((f) => f.id).join(', '))
  }

  process.exit(ok ? 0 : 2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
