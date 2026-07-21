#!/usr/bin/env node
/**
 * Kenos Space Continuity — live Flow A / Flow B / account isolation E2E.
 *
 * Requires local vite dev:
 *   AIOS http://127.0.0.1:5197
 *   Planner http://127.0.0.1:5188
 *   Fitness http://127.0.0.1:5190
 *
 * Auth: service-role magiclink → verifyOtp (no password in repo).
 * Evidence: docs/qa/evidence/kenos-space-continuity-2026-07-20/e2e-flows/
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const RUN_ID = `continuity-e2e-${new Date().toISOString().replace(/[:.]/g, '-')}`
const EVID = join(
  ROOT,
  'docs/qa/evidence/kenos-space-continuity-2026-07-20/e2e-flows',
  RUN_ID,
)
const AIOS = 'http://127.0.0.1:5197'
const PLANNER = 'http://127.0.0.1:5188'
const FITNESS = 'http://127.0.0.1:5190'
const OWNER = {
  id: 'c2831538-94b0-4a57-b034-5e873a53c42e',
  email: '334452284ken@gmail.com',
}
const USER_B = {
  id: '8febdb83-ec49-467d-a9bf-d42620cc68fe',
  email: 'pettimes666666@gmail.com',
}
const TASK_ID = `kenos-cont-${Date.now().toString(36)}`
const TASK_TITLE = `Continuity Planner Test ${RUN_ID.slice(-15)}`
const TASK_TITLE_MUTATED = `Continuity Planner MUT ${RUN_ID.slice(-12)}`
const TASK_NOTES_MUTATED = `Continuity E2E ${RUN_ID} · UI-mutated by owner A`
const EXERCISE_ID = 'c_fly'
/** Local calendar date — must match Fitness session_date (not UTC ISO date). */
function localDateISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const TODAY = localDateISO()

mkdirSync(EVID, { recursive: true })

/** @type {Array<Record<string, unknown>>} */
const screenshotBindings = []

function log(step, detail = {}) {
  const row = { ts: new Date().toISOString(), step, ...detail }
  console.log(JSON.stringify(row))
  return row
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

/** Prefer DOM readiness over networkidle (Supabase realtime keeps connections open). */
async function gotoReady(page, url, { selector, timeout = 20000 } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
  if (selector) {
    await page.waitForSelector(selector, { timeout }).catch(() => null)
  }
  await page
    .waitForFunction(() => (document.body?.innerText || '').length > 20, {
      timeout: 10000,
    })
    .catch(() => {})
}

async function injectAuth(page, origin, session) {
  await gotoReady(page, origin + '/')
  await page.evaluate((s) => {
    localStorage.setItem('life_os_auth', JSON.stringify(s))
  }, session)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page
    .waitForFunction(() => (document.body?.innerText || '').length > 20, {
      timeout: 10000,
    })
    .catch(() => {})
}

/**
 * Bind screenshot ↔ auth context (P2). Watermark is QA-only overlay.
 * @param {import('playwright').Page} page
 * @param {string} name
 * @param {{
 *   stepId: string,
 *   contextId: string,
 *   authUid: string,
 *   accountLabel?: string,
 *   assertedState?: string,
 * }} meta
 */
async function shot(page, name, meta) {
  const stepId = meta?.stepId || name
  const contextId = meta?.contextId || 'unknown'
  const authUid = meta?.authUid || ''
  const uidShort = authUid ? `…${authUid.slice(-4)}` : 'n/a'
  const accountLabel = meta?.accountLabel || 'X'
  const assertedState = meta?.assertedState || ''
  const ts = new Date().toISOString()
  const pageUrl = page.url().slice(0, 120)
  await page
    .evaluate(
      ({
        runId,
        stepId,
        contextId,
        uidShort,
        accountLabel,
        ts,
        pageUrl,
        assertedState,
      }) => {
        const id = 'kenos-continuity-qa-watermark'
        document.getElementById(id)?.remove()
        const el = document.createElement('div')
        el.id = id
        el.setAttribute('data-testid', 'kenos-continuity-qa-watermark')
        const lines = [
          `Context ${accountLabel} · UID ${uidShort} · ${runId}`,
          `${stepId} · ${contextId} · ${ts}`,
          pageUrl ? `url ${pageUrl}` : '',
          assertedState ? `assert ${assertedState}` : '',
        ].filter(Boolean)
        el.textContent = lines.join('\n')
        Object.assign(el.style, {
          position: 'fixed',
          left: '6px',
          right: '6px',
          top: '6px',
          bottom: 'auto',
          zIndex: '2147483647',
          pointerEvents: 'none',
          font: '9px/1.35 ui-monospace, Menlo, monospace',
          color: '#fff',
          background: 'rgba(0,0,0,0.78)',
          borderRadius: '6px',
          padding: '6px 8px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: '28%',
          overflow: 'hidden',
        })
        document.body.appendChild(el)
      },
      {
        runId: RUN_ID,
        stepId,
        contextId,
        uidShort,
        accountLabel,
        ts,
        pageUrl,
        assertedState,
      },
    )
    .catch(() => {})
  const path = join(EVID, `${name}.png`)
  await page.screenshot({ path, fullPage: false })
  await page
    .evaluate(() =>
      document.getElementById('kenos-continuity-qa-watermark')?.remove(),
    )
    .catch(() => {})
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
  const binding = {
    filename: `${name}.png`,
    step_id: stepId,
    run_id: RUN_ID,
    browser_context_id: contextId,
    auth_uid: authUid,
    auth_uid_short: uidShort,
    account_label: accountLabel,
    timestamp: ts,
    page_url: pageUrl,
    asserted_state: assertedState || null,
    sha256,
  }
  screenshotBindings.push(binding)
  return { path, binding }
}

async function readFocusSet(page) {
  return page.evaluate(() => {
    const el = document.querySelector(
      '[data-testid="fitness-focus-set-progress"]',
    )
    if (!el) return { nextSet: null, done: null, total: null, text: '' }
    return {
      nextSet: el.getAttribute('data-next-set')
        ? Number(el.getAttribute('data-next-set'))
        : null,
      done: Number(el.getAttribute('data-done') || 0),
      total: Number(el.getAttribute('data-total') || 0),
      text: el.textContent || '',
    }
  })
}

async function main() {
  const report = {
    run_id: RUN_ID,
    startedAt: new Date().toISOString(),
    accounts: { A: OWNER, B: USER_B },
    entityIds: {
      taskId: TASK_ID,
      exerciseId: EXERCISE_ID,
      dayId: 'chest',
      date: TODAY,
    },
    stamps: {
      flowA: 'NOT_YET_VALIDATED',
      flowB: 'NOT_YET_VALIDATED',
      accountIsolation: 'NOT_YET_VALIDATED',
    },
    blockers: [],
    steps: [],
    db: {},
    network: [],
  }
  const push = (step, detail) => report.steps.push(log(step, detail))

  const srk = getKey('service_role')
  const anonKey = getKey('anon')
  if (!srk || !anonKey) {
    report.blockers.push('Missing Supabase API keys from CLI')
    writeFileSync(join(EVID, 'report.json'), JSON.stringify(report, null, 2))
    process.exit(1)
  }

  const url = 'https://iueozzuctstwvzbcxcyh.supabase.co'
  const admin = createClient(url, srk, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const sessionA = await sessionFor(admin, anon, OWNER.email)
  const sessionB = await sessionFor(admin, anon, USER_B.email)
  push('auth.sessions', { A: OWNER.email, B: USER_B.email })

  const clientA = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${sessionA.access_token}` } },
  })
  const clientB = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${sessionB.access_token}` } },
  })

  // --- DB seed task (owner A) ---
  const now = new Date().toISOString()
  const taskData = {
    id: TASK_ID,
    title: TASK_TITLE,
    notes: `Continuity E2E ${RUN_ID}`,
    completed: false,
    deletedAt: null,
    createdAt: now,
    dueDate: now.slice(0, 10),
    listId: null,
    projectId: null,
    priority: 'normal',
    urgency: 'normal',
    tags: ['kenos-continuity'],
    subtasks: [],
    meta: { continuityRunId: RUN_ID },
  }
  const { error: upsertErr } = await admin.from('planner_tasks').upsert({
    user_id: OWNER.id,
    id: TASK_ID,
    data: taskData,
    updated_at: now,
    os_module: 'planner',
  })
  if (upsertErr) throw upsertErr
  push('db.seed.planner_task', { taskId: TASK_ID })

  const { data: beforeA, error: beforeAErr } = await clientA
    .from('planner_tasks')
    .select('id,data')
    .eq('id', TASK_ID)
  const { data: beforeB, error: beforeBErr } = await clientB
    .from('planner_tasks')
    .select('id,data')
    .eq('id', TASK_ID)
  report.db.before = {
    A_rows: beforeA?.length ?? 0,
    B_rows: beforeB?.length ?? 0,
    A_error: beforeAErr?.message || null,
    B_error: beforeBErr?.message || null,
    A_title: beforeA?.[0]?.data?.title || null,
  }
  push('db.before.isolation', report.db.before)

  const isoPass =
    (beforeA?.length ?? 0) === 1 && (beforeB?.length ?? 0) === 0 && !beforeAErr
  if (isoPass) report.stamps.accountIsolation = 'PARTIAL' // UI/Continue still pending

  const browser = await chromium.launch({ headless: true })
  /** @type {import('playwright').BrowserContext} */
  let context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  // Prefer Playwright internal guid when present; else synthetic.
  const ctxA =
    typeof (/** @type {any} */ (context)._guid) === 'string'
      ? `ctx-A-${/** @type {any} */ (context)._guid}`
      : `ctx-A-${Date.now().toString(36)}`
  let activeCtx = ctxA
  let activeUid = OWNER.id
  let activeLabel = 'A'
  let page = await context.newPage()
  /** @type {Record<string, string|null>} */
  let continueStoreSnapshot = {}

  /** @param {string} name @param {string} [stepId] @param {string} [assertedState] */
  const shotA = (name, stepId, assertedState) =>
    shot(page, name, {
      stepId: stepId || name,
      contextId: activeCtx,
      authUid: activeUid,
      accountLabel: activeLabel,
      assertedState,
    })

  async function clickContinue(testId) {
    // Prefer DOM click — bypasses sheet backdrops / display:none parents.
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el) throw new Error(`missing ${id}`)
      el.click()
    }, testId)
  }

  async function dismissSheets() {
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
    }
    await page
      .evaluate(() => {
        document
          .querySelectorAll('.sheet-bg, .modal-backdrop, [data-sheet-open]')
          .forEach((el) => {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          })
        // Close buttons
        document
          .querySelectorAll(
            'button.sheet-close, [aria-label="Close"], [aria-label="关闭"]',
          )
          .forEach((el) => {
            /** @type {HTMLElement} */ ;(el).click()
          })
      })
      .catch(() => {})
    await page.waitForTimeout(250)
  }

  /** @param {import('playwright').Page} p @param {string} needle */
  async function pageSeesTitle(p, needle) {
    const fromInput = await p
      .locator('#task-title')
      .inputValue()
      .then((v) => v.includes(needle))
      .catch(() => false)
    const fromBody = await p
      .locator('body')
      .innerText()
      .then((t) => t.includes(needle))
      .catch(() => false)
    return { ok: fromInput || fromBody, fromInput, fromBody }
  }

  async function pushPlannerCloud() {
    return page
      .evaluate(async () => {
        try {
          const mod = await import('/src/lib/sync.js')
          if (typeof mod.pushToCloud === 'function') {
            await mod.pushToCloud()
            return { ok: true }
          }
          return { ok: false, reason: 'no pushToCloud export' }
        } catch (e) {
          return { ok: false, reason: String(e?.message || e) }
        }
      })
      .catch((e) => ({ ok: false, reason: String(e) }))
  }

  async function pushFitnessCloud() {
    return page
      .evaluate(async () => {
        try {
          const mod = await import('/src/lib/sync.js')
          if (typeof mod.pushToCloud === 'function') {
            await mod.pushToCloud()
            return { ok: true }
          }
          return { ok: false, reason: 'no pushToCloud export' }
        } catch (e) {
          return { ok: false, reason: String(e?.message || e) }
        }
      })
      .catch((e) => ({ ok: false, reason: String(e) }))
  }

  /**
   * Query fitness.exercise log done for c_fly on today's chest session.
   */
  async function readFitnessDoneFromDb() {
    const { data: sessions } = await fitnessAdmin
      .from('fitness_workout_sessions')
      .select('id')
      .eq('user_id', OWNER.id)
      .eq('session_date', TODAY)
      .eq('day_id', 'chest')
    const ids = (sessions || []).map((s) => s.id)
    if (!ids.length) return { done: null, sessionIds: [], row: null }
    const { data: logs } = await fitnessAdmin
      .from('fitness_exercise_logs')
      .select('session_id,exercise_id,done,sets,updated_at')
      .in('session_id', ids)
      .eq('exercise_id', EXERCISE_ID)
    const row = (logs || [])[0] || null
    return {
      done: row?.done ?? null,
      sessionIds: ids,
      row,
    }
  }

  // fitnessAdmin used later — declare early for helper above
  const fitnessAdmin = createClient(url, srk, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'fitness' },
  })

  try {
    // ========== FLOW A — Planner authenticated UI mutation ==========
    push('flowA.start')
    await injectAuth(page, PLANNER, sessionA)
    // Ensure seeded cloud task is in local S.tasks before Continuity open
    const syncSeed = await page
      .evaluate(async (taskId) => {
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
            taskCount: S.tasks?.length ?? 0,
          }
        } catch (e) {
          return { ok: false, reason: String(e?.message || e) }
        }
      }, TASK_ID)
      .catch((e) => ({ ok: false, reason: String(e) }))
    push('flowA.syncSeed', syncSeed)

    await gotoReady(
      page,
      `${PLANNER}/upcoming?kenosTask=${TASK_ID}&kenosDetail=1`,
      { selector: '#task-title, input.task-editor-title-input, textarea' },
    )
    // Retry once if editor still closed (resume sync path)
    if ((await page.locator('#task-title').count()) === 0) {
      await page
        .evaluate(async (taskId) => {
          try {
            const sync = await import('/src/lib/sync.js')
            if (typeof sync.syncNow === 'function') await sync.syncNow('merge')
            const adapter =
              await import('/src/lib/kenos/plannerSpaceAdapter.js')
            await adapter.resumePlannerSpace({
              spaceId: 'plan',
              route: `/upcoming?kenosTask=${taskId}&kenosDetail=1`,
              entityId: taskId,
              displayTitle: 'Plan',
              displaySubtitle: 'Plan',
              substate: { detailOpen: true },
            })
          } catch {
            /* ignore */
          }
        }, TASK_ID)
        .catch(() => {})
      await page.waitForTimeout(1200)
    }
    await page.waitForTimeout(800)
    await shotA('A01-planner-task-seed-open', 'A01')
    await shotA('A02-planner-task-restored', 'A02')

    const titleInInput = await page
      .locator('#task-title')
      .inputValue()
      .then((v) => v.includes(TASK_TITLE))
      .catch(() => false)
    const titleAttr = await page
      .locator(`input[value="${TASK_TITLE}"]`)
      .count()
      .then((n) => n > 0)
      .catch(() => false)
    const bodyHas = (await page.locator('body').innerText()).includes(
      TASK_TITLE,
    )
    const taskVisible = titleInInput || titleAttr || bodyHas
    push('flowA.taskVisible', { taskVisible, titleInInput, titleAttr, bodyHas })

    // P0: authenticated UI mutation (title + notes) — NO admin/service-role write
    const titleInput = page.locator('#task-title')
    if ((await titleInput.count()) === 0) {
      report.blockers.push('Flow A: #task-title missing — cannot UI-mutate')
      report.stamps.flowA = 'PARTIAL'
    } else {
      await titleInput.fill(TASK_TITLE_MUTATED)
      const notes = page.locator('textarea').first()
      if (await notes.count()) {
        await notes.fill(TASK_NOTES_MUTATED)
      }
      await shotA('A03-planner-before-save', 'A03')
      const saveBtn = page.getByRole('button', {
        name: /Save changes|保存更改/,
      })
      if ((await saveBtn.count()) === 0) {
        report.blockers.push('Flow A: Save button missing')
        report.stamps.flowA = 'PARTIAL'
      } else {
        await saveBtn.click()
        await page.waitForTimeout(800)
        await shotA('A03b-planner-after-ui-save', 'A03b')

        // Wait for product auto-sync debounce, then explicit user-session push
        await page.waitForTimeout(2800)
        const uiPush = await pushPlannerCloud()
        push('flowA.uiPush', { ...uiPush, at: new Date().toISOString() })

        let clientTitle = null
        let clientNotes = null
        let clientCompleted = null
        for (let i = 0; i < 20; i++) {
          const { data: afterA } = await clientA
            .from('planner_tasks')
            .select('id,data,updated_at')
            .eq('id', TASK_ID)
            .maybeSingle()
          clientTitle = afterA?.data?.title || null
          clientNotes = afterA?.data?.notes || null
          clientCompleted = afterA?.data?.completed ?? null
          if (clientTitle === TASK_TITLE_MUTATED) break
          await page.waitForTimeout(500)
        }
        const mutationPersisted = clientTitle === TASK_TITLE_MUTATED
        report.db.afterFlowA = {
          mutationPath: 'planner-ui-save+user-jwt-push',
          adminWriteUsed: false,
          title: clientTitle,
          notes: clientNotes,
          completed: clientCompleted,
          mutationPersisted,
          expectedTitle: TASK_TITLE_MUTATED,
        }
        push('flowA.db.after', report.db.afterFlowA)
        if (!mutationPersisted) {
          report.blockers.push(
            `Flow A: user JWT DB title not mutated (got ${clientTitle})`,
          )
        }

        // Re-open task so Continue descriptor carries mutated title
        await gotoReady(
          page,
          `${PLANNER}/upcoming?kenosTask=${TASK_ID}&kenosDetail=1`,
          { selector: '#task-title, input, textarea' },
        )
        await page.waitForTimeout(900)
        await shotA('A03c-planner-reopen-mutated', 'A03c')
        const reopen = await pageSeesTitle(page, TASK_TITLE_MUTATED)
        push('flowA.reopenSeesMutated', {
          reopenSeesMutated: reopen.ok,
          ...reopen,
        })

        await dismissSheets()
        // Keep detail open for richer Continue subtitle — reopen briefly
        await gotoReady(
          page,
          `${PLANNER}/upcoming?kenosTask=${TASK_ID}&kenosDetail=1`,
          { selector: '#task-title' },
        )
        await page.waitForTimeout(500)

        const cont = page.getByTestId('planner-kenos-continue')
        if ((await cont.count()) === 0) {
          report.blockers.push(
            'Planner Continue control missing (stale build?)',
          )
          report.stamps.flowA = 'PARTIAL'
        } else {
          await Promise.all([
            page.waitForURL(/5197/, { timeout: 20000 }).catch(() => null),
            clickContinue('planner-kenos-continue'),
          ])
          if (!page.url().includes('5197')) {
            await clickContinue('planner-kenos-continue')
            await page.waitForURL(/5197/, { timeout: 15000 }).catch(() => null)
          }
          await page.waitForTimeout(1200)
          await page
            .waitForFunction(
              () => (document.body?.innerText || '').length > 40,
              { timeout: 15000 },
            )
            .catch(() => {})
          await shotA('A04-kenos-after-planner-continue', 'A04')

          if (
            !(await page
              .getByTestId('kenos-space-switcher')
              .isVisible()
              .catch(() => false))
          ) {
            const fab = page.getByTestId('kenos-space-switcher-fab')
            if (await fab.count()) {
              await page.evaluate(() =>
                document
                  .querySelector('[data-testid="kenos-space-switcher-fab"]')
                  ?.click(),
              )
            } else {
              await gotoReady(page, `${AIOS}/?openContinue=1`, {
                selector:
                  '[data-testid="kenos-space-switcher"], [data-testid="kenos-space-switcher-fab"]',
              })
            }
          }
          await page.waitForTimeout(600)
          await shotA('A05-kenos-continue-sheet', 'A05')

          const sheetText = await page
            .getByTestId('kenos-space-switcher')
            .innerText()
            .catch(() => page.locator('body').innerText())
          const planInSheet = /Plan|Continuity|Upcoming|MUT/i.test(sheetText)
          const kenosSeesMutatedTitle =
            String(sheetText).includes(TASK_TITLE_MUTATED)
          push('flowA.continueSheet', {
            planInSheet,
            kenosSeesMutatedTitle,
            snippet: String(sheetText).slice(0, 600),
          })
          if (!kenosSeesMutatedTitle) {
            report.blockers.push(
              'Flow A: Kenos Continue sheet missing mutated title (summary sync)',
            )
          }

          // Fresh-context reload + re-login (no prior Planner LS)
          await context.close()
          context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
          })
          activeCtx =
            typeof (/** @type {any} */ (context)._guid) === 'string'
              ? `ctx-A-reload-${/** @type {any} */ (context)._guid}`
              : `ctx-A-reload-${Date.now().toString(36)}`
          activeUid = OWNER.id
          activeLabel = 'A'
          page = await context.newPage()

          await injectAuth(page, PLANNER, sessionA)
          // Clear non-auth local state so cloud pull is required
          await page.evaluate(() => {
            const auth = localStorage.getItem('life_os_auth')
            const keys = []
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i)
              if (k && k !== 'life_os_auth') keys.push(k)
            }
            keys.forEach((k) => localStorage.removeItem(k))
            sessionStorage.clear()
            if (auth) localStorage.setItem('life_os_auth', auth)
          })
          await page.reload({ waitUntil: 'domcontentloaded' })
          await page.waitForTimeout(1500)
          // Force pull
          await page
            .evaluate(async () => {
              try {
                const mod = await import('/src/lib/sync.js')
                if (typeof mod.syncNow === 'function')
                  await mod.syncNow('replace')
                else if (typeof mod.pullFromCloud === 'function')
                  await mod.pullFromCloud('replace')
              } catch {
                /* ignore */
              }
            })
            .catch(() => {})
          await page.waitForTimeout(1200)
          await gotoReady(
            page,
            `${PLANNER}/upcoming?kenosTask=${TASK_ID}&kenosDetail=1`,
            { selector: '#task-title, input, textarea' },
          )
          await page.waitForTimeout(1000)
          await shotA('A07-planner-fresh-context-reload', 'A07')
          const reloadMut = await pageSeesTitle(page, TASK_TITLE_MUTATED)
          const reloadSeed = await pageSeesTitle(page, TASK_TITLE)
          const reloadSeesMutated = reloadMut.ok
          const reloadSeesTask = reloadMut.ok || reloadSeed.ok
          push('flowA.reload', {
            reloadSeesTask,
            reloadSeesMutated,
            reloadMut,
            reloadSeed,
            at: new Date().toISOString(),
          })

          // Logout / login again
          await page.goto(PLANNER + '/', { waitUntil: 'domcontentloaded' })
          await page.evaluate(() => {
            localStorage.clear()
            sessionStorage.clear()
          })
          await injectAuth(page, PLANNER, sessionA)
          await page
            .evaluate(async () => {
              try {
                const mod = await import('/src/lib/sync.js')
                if (typeof mod.syncNow === 'function')
                  await mod.syncNow('replace')
              } catch {
                /* ignore */
              }
            })
            .catch(() => {})
          await page.waitForTimeout(1200)
          await gotoReady(
            page,
            `${PLANNER}/upcoming?kenosTask=${TASK_ID}&kenosDetail=1`,
            { selector: '#task-title, input, textarea' },
          )
          await page.waitForTimeout(900)
          await shotA('A08-planner-relogin', 'A08')
          const relogin = await pageSeesTitle(page, TASK_TITLE_MUTATED)
          const reloginSeesMutated = relogin.ok
          push('flowA.relogin', {
            reloginSeesMutated,
            ...relogin,
            at: new Date().toISOString(),
          })

          if (
            taskVisible &&
            mutationPersisted &&
            kenosSeesMutatedTitle &&
            reloadSeesMutated &&
            reloginSeesMutated
          ) {
            report.stamps.flowA = 'VALIDATED'
          } else if (taskVisible && mutationPersisted) {
            report.stamps.flowA = 'PARTIAL'
            report.blockers.push(
              `Flow A partial: kenosSummary=${kenosSeesMutatedTitle} reloadMut=${reloadSeesMutated} reloginMut=${reloginSeesMutated} reloadSeesTask=${reloadSeesTask}`,
            )
          } else if (taskVisible) {
            report.stamps.flowA = 'PARTIAL'
          }
        }
      }
    }

    // ========== FLOW B — Fitness Continuity + cold DB read ==========
    push('flowB.start')

    // Clear today's chest logs in cloud so merge cannot restore done=3 for c_fly.
    const { data: chestSessions } = await fitnessAdmin
      .from('fitness_workout_sessions')
      .select('id')
      .eq('user_id', OWNER.id)
      .eq('session_date', TODAY)
      .eq('day_id', 'chest')
    const chestIds = (chestSessions || []).map((s) => s.id)
    if (chestIds.length) {
      const { error: delLogErr } = await fitnessAdmin
        .from('fitness_exercise_logs')
        .delete()
        .in('session_id', chestIds)
        .eq('exercise_id', EXERCISE_ID)
      push('flowB.db.clear_c_fly', {
        sessions: chestIds.length,
        error: delLogErr?.message || null,
      })
    } else {
      push('flowB.db.clear_c_fly', {
        sessions: 0,
        note: 'no chest session today',
      })
    }

    await injectAuth(page, FITNESS, sessionA)
    await page.evaluate(() => {
      const auth = localStorage.getItem('life_os_auth')
      localStorage.removeItem('fitos_v2')
      sessionStorage.clear()
      if (auth) localStorage.setItem('life_os_auth', auth)
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(600)

    // Land on Cable Fly set 1, complete set 1 → now at set 2
    await gotoReady(
      page,
      `${FITNESS}/day/chest/focus?kenosEx=${EXERCISE_ID}&kenosSet=1`,
      {
        selector: '[data-testid="fitness-focus-set-progress"], .focus-cta-set',
      },
    )
    await page.waitForTimeout(1400)
    await shotA('B01-fitness-focus-set1', 'B01')
    let setInfo = await readFocusSet(page)
    push('flowB.set1Landed', setInfo)

    if ((await page.getByTestId('fitness-focus-complete-set').count()) === 0) {
      await gotoReady(
        page,
        `${FITNESS}/day/chest/focus?kenosEx=${EXERCISE_ID}&kenosSet=1`,
        { selector: '[data-testid="fitness-focus-complete-set"]' },
      )
      await page.waitForTimeout(1400)
    }
    if (await page.getByTestId('fitness-focus-complete-set').count()) {
      await page.getByTestId('fitness-focus-complete-set').click()
      await page.waitForTimeout(700)
    }
    await shotA('B01b-fitness-after-set1', 'B01b')

    setInfo = await readFocusSet(page)
    let onSet2 = setInfo.nextSet === 2
    if (!onSet2) {
      await gotoReady(
        page,
        `${FITNESS}/day/chest/focus?kenosEx=${EXERCISE_ID}&kenosSet=2`,
        { selector: '[data-testid="fitness-focus-set-progress"]' },
      )
      await page.waitForTimeout(1400)
      setInfo = await readFocusSet(page)
      onSet2 = setInfo.nextSet === 2
    }
    // B02 must show Set2 focus CTA — not leftover Set1 log sheet
    await dismissSheets()
    await page
      .waitForFunction(
        () => {
          const el = document.querySelector(
            '[data-testid="fitness-focus-set-progress"]',
          )
          return el?.getAttribute('data-next-set') === '2'
        },
        { timeout: 8000 },
      )
      .catch(() => null)
    setInfo = await readFocusSet(page)
    onSet2 = setInfo.nextSet === 2
    const ctaSet2Visible = await page
      .getByTestId('fitness-focus-complete-set')
      .isVisible()
      .catch(() => false)
    const ctaSet2Text = await page
      .getByTestId('fitness-focus-complete-set')
      .innerText()
      .catch(() => '')
    const b02Ok =
      onSet2 && ctaSet2Visible && /第\s*2\s*组|Set\s*2/i.test(ctaSet2Text)
    if (!b02Ok) {
      report.blockers.push(
        `B02 precondition failed: onSet2=${onSet2} ctaVisible=${ctaSet2Visible} cta="${ctaSet2Text.slice(0, 40)}"`,
      )
      await shotA(
        'B02-UNEXPECTED-not-set2-cta',
        'B02',
        `FAIL nextSet=${setInfo.nextSet}`,
      )
    } else {
      await shotA(
        'B02-fitness-at-set2',
        'B02',
        `nextSet=2 cta=${ctaSet2Text.trim().slice(0, 24)}`,
      )
    }
    push('flowB.set2Visible', {
      onSet2,
      b02Ok,
      ctaSet2Visible,
      ctaSet2Text: ctaSet2Text.slice(0, 80),
      ...setInfo,
    })

    const fCont = page.getByTestId('fitness-focus-kenos-continue')
    if ((await fCont.count()) === 0) {
      report.blockers.push('Fitness Focus Continue missing')
      report.stamps.flowB = 'PARTIAL'
    } else {
      await Promise.all([
        page.waitForURL(/5197/, { timeout: 15000 }).catch(() => null),
        clickContinue('fitness-focus-kenos-continue'),
      ])
      await page.waitForTimeout(1200)
      await page
        .waitForFunction(() => (document.body?.innerText || '').length > 40, {
          timeout: 15000,
        })
        .catch(() => {})
      await shotA('B03-kenos-after-fitness-continue-set2', 'B03')

      if (
        !(await page
          .getByTestId('kenos-space-switcher')
          .isVisible()
          .catch(() => false))
      ) {
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="kenos-space-switcher-fab"]')
            ?.click(),
        )
      }
      await page.waitForTimeout(600)
      await shotA('B04-kenos-continue-sheet-set2', 'B04')
      const sheetSet2 = await page
        .getByTestId('kenos-space-switcher')
        .innerText()
        .catch(() => page.locator('body').innerText())
      const descHasSet2 = /Set\s*2|第\s*2|绳索|夹胸|Training|1\/3/i.test(
        String(sheetSet2),
      )
      push('flowB.continueSheet.set2', {
        descHasSet2,
        snippet: String(sheetSet2).slice(0, 500),
      })

      const trainRow = page
        .locator('[data-testid="kenos-space-switcher"]')
        .getByText(/Training|绳索|夹胸|Cable|Set/i)
        .first()
      if (await trainRow.count()) {
        await Promise.all([
          page.waitForURL(/5190|focus/, { timeout: 15000 }).catch(() => null),
          trainRow.click({ force: true }),
        ])
        await page.waitForTimeout(1600)
      } else {
        await gotoReady(
          page,
          `${FITNESS}/day/chest/focus?kenosEx=${EXERCISE_ID}&kenosSet=2`,
          { selector: '[data-testid="fitness-focus-set-progress"]' },
        )
        report.blockers.push('Training row missing for set2 resume — deep link')
      }
      await shotA('B05-fitness-resumed-set2', 'B05')
      setInfo = await readFocusSet(page)
      const landedSet2 = setInfo.nextSet === 2
      push('flowB.resumedSet2', {
        landedSet2,
        ...setInfo,
        url: page.url().slice(0, 160),
      })

      // Complete Set 2 → expect Set 3
      const cta2 = page.getByTestId('fitness-focus-complete-set')
      if (await cta2.count()) {
        await cta2.click()
        await page.waitForTimeout(700)
      }
      await shotA('B06-fitness-after-complete-set2', 'B06')
      setInfo = await readFocusSet(page)
      push('flowB.afterCompleteSet2', {
        ...setInfo,
        at: new Date().toISOString(),
      })

      // P1 ORDER: cloudPush FIRST, then DB assert, then fresh context cold read
      const pushAt = new Date().toISOString()
      const pushResult = await pushFitnessCloud()
      push('flowB.cloudPush', { ...pushResult, at: pushAt })

      let dbDone = null
      let dbRow = null
      for (let i = 0; i < 16; i++) {
        const r = await readFitnessDoneFromDb()
        dbDone = r.done
        dbRow = r.row
        if (dbDone === 2) break
        await page.waitForTimeout(400)
      }
      const dbAssertAt = new Date().toISOString()
      report.db.fitnessAfterSet2 = {
        done: dbDone,
        expectedDone: 2,
        expectedNextSet: 3,
        row: dbRow,
        at: dbAssertAt,
      }
      push('flowB.db.afterCloudPush', report.db.fitnessAfterSet2)
      if (dbDone !== 2) {
        report.blockers.push(
          `Flow B: DB done=${dbDone} after cloudPush (want 2 → next Set 3)`,
        )
      }

      // Handoff to Kenos so Continue has Training (before we wipe Fitness LS)
      await Promise.all([
        page.waitForURL(/5197/, { timeout: 15000 }).catch(() => null),
        clickContinue('fitness-focus-kenos-continue'),
      ])
      await page.waitForTimeout(1000)
      if (
        !(await page
          .getByTestId('kenos-space-switcher')
          .isVisible()
          .catch(() => false))
      ) {
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="kenos-space-switcher-fab"]')
            ?.click(),
        )
      }
      await page.waitForTimeout(500)
      await shotA('B07-kenos-continue-after-set2-push', 'B07')
      const sheetAfter = await page
        .getByTestId('kenos-space-switcher')
        .innerText()
        .catch(() => page.locator('body').innerText())
      push('flowB.continueSheet.afterSet2', {
        snippet: String(sheetAfter).slice(0, 500),
      })

      // Capture Continue store only (canonical key + close matches)
      continueStoreSnapshot = await page.evaluate(() => {
        const KEY = 'kenos.spaceSwitcher.v1'
        const out = {}
        const primary = localStorage.getItem(KEY)
        if (primary != null) out[KEY] = primary
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (
            k &&
            k !== KEY &&
            (k.includes('spaceSwitcher') || k.startsWith('kenos.'))
          ) {
            out[k] = localStorage.getItem(k)
          }
        }
        return out
      })
      push('flowB.continueStoreSnapshot', {
        keys: Object.keys(continueStoreSnapshot),
        hasPrimary: Boolean(continueStoreSnapshot['kenos.spaceSwitcher.v1']),
      })

      // FRESH browser context — no Fitness/Planner LS reuse
      await context.close()
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      })
      activeCtx =
        typeof (/** @type {any} */ (context)._guid) === 'string'
          ? `ctx-A-cold-${/** @type {any} */ (context)._guid}`
          : `ctx-A-cold-${Date.now().toString(36)}`
      activeUid = OWNER.id
      activeLabel = 'A'
      page = await context.newPage()
      const coldContextAt = new Date().toISOString()
      push('flowB.freshContext', { at: coldContextAt, contextId: activeCtx })

      await injectAuth(page, AIOS, sessionA)
      // Wait until auth is readable so bindSpaceSwitcherOwner won't race
      await page
        .waitForFunction(
          () => {
            try {
              const raw = localStorage.getItem('life_os_auth')
              if (!raw) return false
              const s = JSON.parse(raw)
              return Boolean(s?.user?.id || s?.access_token)
            } catch {
              return false
            }
          },
          { timeout: 10000 },
        )
        .catch(() => null)

      await page.evaluate((snap) => {
        for (const [k, v] of Object.entries(snap || {})) {
          if (v != null) localStorage.setItem(k, v)
        }
      }, continueStoreSnapshot)

      // Hard reload so SpaceSwitcher rehydrates from LS after auth is present
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
      await page
        .waitForFunction(
          () => {
            try {
              const raw = localStorage.getItem('kenos.spaceSwitcher.v1')
              if (!raw) return false
              const st = JSON.parse(raw)
              return Array.isArray(st?.recent) && st.recent.length > 0
            } catch {
              return false
            }
          },
          { timeout: 8000 },
        )
        .catch(() => null)

      await gotoReady(page, `${AIOS}/?openContinue=1`, {
        selector:
          '[data-testid="kenos-space-switcher"], [data-testid="kenos-space-switcher-fab"]',
      })
      if (
        !(await page
          .getByTestId('kenos-space-switcher')
          .isVisible()
          .catch(() => false))
      ) {
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="kenos-space-switcher-fab"]')
            ?.click(),
        )
        await page.waitForTimeout(500)
      }

      const sheetCold = await page
        .getByTestId('kenos-space-switcher')
        .innerText()
        .catch(() => page.locator('body').innerText())
      const b08HasTrainingRecent =
        /RECENT[\s\S]*Training|绳索夹胸|Set\s*3/i.test(String(sheetCold)) &&
        !/还没有最近 Space/.test(String(sheetCold))
      push('flowB.coldContinueSheet', {
        b08HasTrainingRecent,
        snippet: String(sheetCold).slice(0, 500),
      })
      if (!b08HasTrainingRecent) {
        report.blockers.push(
          'B08: cold Continue Recent empty after auth-ready reload — Continue→Fitness path not proven',
        )
        await shotA('B08-UNEXPECTED-continue-empty', 'B08', 'FAIL empty Recent')
      } else {
        await shotA(
          'B08-kenos-continue-fresh-before-fitness',
          'B08',
          'Recent Training Set3',
        )
      }

      const trainRow3 = page
        .locator('[data-testid="kenos-space-switcher"]')
        .getByText(/Training|绳索|夹胸|Cable|Set/i)
        .first()
      if (b08HasTrainingRecent && (await trainRow3.count())) {
        await Promise.all([
          page
            .waitForURL(/5190|focus|fitness/, { timeout: 15000 })
            .catch(() => null),
          trainRow3.click({ force: true }),
        ])
        await page.waitForTimeout(2000)
      }
      // If Continue routed to production Fitness, force local cold open (no kenosSet pin)
      if (!page.url().includes('127.0.0.1:5190')) {
        await injectAuth(page, FITNESS, sessionA)
        await page.evaluate(() => {
          const auth = localStorage.getItem('life_os_auth')
          localStorage.clear()
          sessionStorage.clear()
          if (auth) localStorage.setItem('life_os_auth', auth)
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(800)
        await page
          .evaluate(async () => {
            try {
              const mod = await import('/src/lib/sync.js')
              if (typeof mod.pullFromCloud === 'function')
                await mod.pullFromCloud()
            } catch {
              /* ignore */
            }
          })
          .catch(() => {})
        await gotoReady(
          page,
          `${FITNESS}/day/chest/focus?kenosEx=${EXERCISE_ID}`,
          { selector: '[data-testid="fitness-focus-set-progress"]' },
        )
        push('flowB.note.continueRoutedNonLocal', {
          note: 'Continue Training row opened non-local Fitness; forced local cold deep link without kenosSet',
        })
      }
      await page.waitForTimeout(1600)
      setInfo = await readFocusSet(page)
      const coldSet3 = setInfo.nextSet === 3
      await shotA(
        'B09-fitness-cold-resume-set3',
        'B09',
        `nextSet=${setInfo.nextSet} coldSet3=${coldSet3}`,
      )
      push('flowB.coldRead', {
        coldSet3,
        viaContinue: b08HasTrainingRecent,
        ...setInfo,
        url: page.url().slice(0, 180),
        at: new Date().toISOString(),
        order: {
          cloudPushAt: pushAt,
          dbAssertAt,
          freshContextAt: coldContextAt,
        },
      })

      // Extra isolation: Fitness cold without any Continue pin (no kenosSet)
      await page.evaluate(() => {
        const auth = localStorage.getItem('life_os_auth')
        localStorage.clear()
        sessionStorage.clear()
        if (auth) localStorage.setItem('life_os_auth', auth)
      })
      await injectAuth(page, FITNESS, sessionA)
      await page.evaluate(() => {
        const auth = localStorage.getItem('life_os_auth')
        for (const k of Object.keys(localStorage)) {
          if (k !== 'life_os_auth') localStorage.removeItem(k)
        }
        sessionStorage.clear()
        if (auth) localStorage.setItem('life_os_auth', auth)
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1000)
      await page
        .evaluate(async () => {
          try {
            const mod = await import('/src/lib/sync.js')
            if (typeof mod.pullFromCloud === 'function')
              await mod.pullFromCloud()
          } catch {
            /* ignore */
          }
        })
        .catch(() => {})
      await gotoReady(
        page,
        `${FITNESS}/day/chest/focus?kenosEx=${EXERCISE_ID}`,
        { selector: '[data-testid="fitness-focus-set-progress"]' },
      )
      await page.waitForTimeout(1800)
      const coldNoPin = await readFocusSet(page)
      const coldNoPinSet3 = coldNoPin.nextSet === 3
      await shotA(
        'B10-fitness-cold-no-kenosSet',
        'B10',
        `nextSet=${coldNoPin.nextSet} noPin=${coldNoPinSet3}`,
      )
      push('flowB.coldReadNoPin', {
        coldNoPinSet3,
        ...coldNoPin,
        at: new Date().toISOString(),
      })

      const { data: sessions } = await fitnessAdmin
        .from('fitness_workout_sessions')
        .select('id,session_date,day_id,user_id')
        .eq('user_id', OWNER.id)
        .order('started_at', { ascending: false })
        .limit(3)
      report.db.fitnessSessionsA = sessions || []

      const fitnessClientB = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        db: { schema: 'fitness' },
        global: {
          headers: { Authorization: `Bearer ${sessionB.access_token}` },
        },
      })
      const { data: sessionsB, error: sessBErr } = await fitnessClientB
        .from('fitness_workout_sessions')
        .select('id')
        .eq('user_id', OWNER.id)
      report.db.fitnessIsolation = {
        B_sees_A_sessions: sessionsB?.length ?? 0,
        B_error: sessBErr?.message || null,
      }
      push('flowB.db', {
        sessionsA: report.db.fitnessSessionsA.length,
        isolation: report.db.fitnessIsolation,
        pushResult,
        dbDone,
      })

      if (
        b02Ok &&
        onSet2 &&
        landedSet2 &&
        dbDone === 2 &&
        pushResult.ok &&
        b08HasTrainingRecent &&
        coldSet3 &&
        coldNoPinSet3
      ) {
        report.stamps.flowB = 'VALIDATED'
      } else if (
        onSet2 &&
        landedSet2 &&
        dbDone === 2 &&
        pushResult.ok &&
        (coldSet3 || coldNoPinSet3)
      ) {
        report.stamps.flowB = 'PARTIAL'
        report.blockers.push(
          `Flow B persistence ok but screenshot path incomplete: b02Ok=${b02Ok} b08Continue=${b08HasTrainingRecent} coldSet3=${coldSet3} coldNoPinSet3=${coldNoPinSet3}`,
        )
      } else if (onSet2 || landedSet2 || coldSet3 || coldNoPinSet3) {
        report.stamps.flowB = 'PARTIAL'
        report.blockers.push(
          `Flow B incomplete: onSet2=${onSet2} landedSet2=${landedSet2} dbDone=${dbDone} push=${pushResult.ok} coldSet3=${coldSet3} coldNoPinSet3=${coldNoPinSet3}`,
        )
      } else {
        report.blockers.push('Flow B did not land set2 Continuity / cold Set3')
      }
    }

    // ========== Account isolation: dual-UI Continue (A has Recent; B must not) ==========
    push('isolation.dual_ui.start')
    await gotoReady(page, `${AIOS}/?openContinue=1`, {
      selector:
        '[data-testid="kenos-space-switcher"], [data-testid="kenos-space-switcher-fab"]',
    })
    if (
      !(await page
        .getByTestId('kenos-space-switcher')
        .isVisible()
        .catch(() => false))
    ) {
      await page
        .evaluate(() =>
          document
            .querySelector('[data-testid="kenos-space-switcher-fab"]')
            ?.click(),
        )
        .catch(() => {})
      await page.waitForTimeout(500)
    }
    // Re-inject Continue snapshot for A so C01 is meaningful
    await page.evaluate((snap) => {
      for (const [k, v] of Object.entries(snap || {})) {
        if (v != null) localStorage.setItem(k, v)
      }
    }, continueStoreSnapshot)
    await gotoReady(page, `${AIOS}/?openContinue=1`, {
      selector: '[data-testid="kenos-space-switcher"]',
    })
    await shotA('C01-continue-account-A', 'C01')
    const sheetA = await page
      .getByTestId('kenos-space-switcher')
      .innerText()
      .catch(() => '')
    const aHasTrainingOrPlan =
      /Training|Plan|绳索|Set \d|Cable|Continuity Planner|MUT/i.test(sheetA)
    push('isolation.dual_ui.A', {
      aHasTrainingOrPlan,
      snippet: String(sheetA).slice(0, 400),
    })

    // Fresh context as B — must not inherit A's localStorage Continue
    const contextB = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    const ctxB =
      typeof (/** @type {any} */ (contextB)._guid) === 'string'
        ? `ctx-B-${/** @type {any} */ (contextB)._guid}`
        : `ctx-B-${Date.now().toString(36)}`
    const pageB = await contextB.newPage()
    await injectAuth(pageB, AIOS, sessionB)
    await gotoReady(pageB, `${AIOS}/?openContinue=1`, {
      selector:
        '[data-testid="kenos-space-switcher"], [data-testid="kenos-space-switcher-fab"]',
    })
    if (
      !(await pageB
        .getByTestId('kenos-space-switcher')
        .isVisible()
        .catch(() => false))
    ) {
      await pageB
        .evaluate(() =>
          document
            .querySelector('[data-testid="kenos-space-switcher-fab"]')
            ?.click(),
        )
        .catch(() => {})
      await pageB.waitForTimeout(500)
    }
    await shot(pageB, 'C02-continue-account-B', {
      stepId: 'C02',
      contextId: ctxB,
      authUid: USER_B.id,
      accountLabel: 'B',
    })
    const sheetB = await pageB
      .getByTestId('kenos-space-switcher')
      .innerText()
      .catch(() => pageB.locator('body').innerText())
    const bLeaksA =
      /Continuity Planner|绳索夹胸|Cable fly|kenos-cont-|MUT/i.test(
        String(sheetB),
      )
    push('isolation.dual_ui.B', {
      bLeaksA,
      contextId: ctxB,
      authUidShort: `…${USER_B.id.slice(-4)}`,
      snippet: String(sheetB).slice(0, 400),
    })
    await contextB.close()

    // Same browser: switch A → B (owner bind clear)
    await page.goto(AIOS + '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => {
      localStorage.removeItem('life_os_auth')
    })
    await injectAuth(page, AIOS, sessionB)
    activeUid = USER_B.id
    activeLabel = 'B'
    activeCtx =
      typeof (/** @type {any} */ (context)._guid) === 'string'
        ? `ctx-B-switch-${/** @type {any} */ (context)._guid}`
        : `ctx-B-switch-${Date.now().toString(36)}`
    await gotoReady(page, `${AIOS}/?openContinue=1`, {
      selector:
        '[data-testid="kenos-space-switcher"], [data-testid="kenos-space-switcher-fab"]',
    })
    if (
      !(await page
        .getByTestId('kenos-space-switcher')
        .isVisible()
        .catch(() => false))
    ) {
      await page
        .evaluate(() =>
          document
            .querySelector('[data-testid="kenos-space-switcher-fab"]')
            ?.click(),
        )
        .catch(() => {})
      await page.waitForTimeout(500)
    }
    await shotA(
      'C03-continue-after-switch-A-to-B',
      'C03',
      'account-switch shared-physical-ctx',
    )
    const sheetSwitch = await page
      .getByTestId('kenos-space-switcher')
      .innerText()
      .catch(() => '')
    const switchLeaksA =
      /Continuity Planner|绳索夹胸|Cable fly|kenos-cont-|MUT/i.test(
        String(sheetSwitch),
      )
    push('isolation.account_switch', {
      switchLeaksA,
      snippet: String(sheetSwitch).slice(0, 400),
    })

    // ========== Account isolation (API/RLS) final ==========
    const { data: finalA } = await clientA
      .from('planner_tasks')
      .select('id')
      .eq('id', TASK_ID)
    const { data: finalB } = await clientB
      .from('planner_tasks')
      .select('id')
      .eq('id', TASK_ID)
    report.db.finalIsolation = {
      A_rows: finalA?.length ?? 0,
      B_rows: finalB?.length ?? 0,
      fitnessBSeesA: report.db.fitnessIsolation?.B_sees_A_sessions ?? null,
      dualUi: {
        aHasTrainingOrPlan,
        bLeaksA,
        switchLeaksA,
      },
    }
    const isoApi =
      report.db.finalIsolation.A_rows === 1 &&
      report.db.finalIsolation.B_rows === 0 &&
      (report.db.finalIsolation.fitnessBSeesA === 0 ||
        report.db.finalIsolation.fitnessBSeesA === null)
    const isoUi = aHasTrainingOrPlan && !bLeaksA && !switchLeaksA
    const isoBinding =
      screenshotBindings.filter(
        (b) => b.step_id === 'C01' || b.step_id === 'C02',
      ).length >= 2 &&
      screenshotBindings.some(
        (b) => b.step_id === 'C01' && b.auth_uid === OWNER.id,
      ) &&
      screenshotBindings.some(
        (b) => b.step_id === 'C02' && b.auth_uid === USER_B.id,
      )
    if (isoApi && isoUi && isoBinding) {
      report.stamps.accountIsolation = 'VALIDATED'
      push('isolation.final', {
        ok: true,
        api: true,
        dualUi: true,
        binding: true,
      })
    } else if (isoApi && isoUi) {
      report.stamps.accountIsolation = 'PARTIAL'
      report.blockers.push(
        `Account isolation API+UI ok; screenshot binding incomplete binding=${isoBinding}`,
      )
    } else if (isoApi) {
      report.stamps.accountIsolation = 'PARTIAL'
      report.blockers.push(
        `Account isolation API ok; dual-UI incomplete aHas=${aHasTrainingOrPlan} bLeaks=${bLeaksA} switchLeaks=${switchLeaksA}`,
      )
    } else {
      report.stamps.accountIsolation = 'NOT_YET_VALIDATED'
      report.blockers.push('Account isolation API check failed')
    }
  } catch (e) {
    report.blockers.push(String(e?.stack || e))
    push('error', { message: String(e?.message || e) })
    await shotA('ZZ-error', 'ZZ-error').catch(() => {})
  } finally {
    await browser.close().catch(() => {})
  }

  report.finishedAt = new Date().toISOString()
  report.screenshotBindings = screenshotBindings
  report.network = report.network.slice(-200)
  writeFileSync(join(EVID, 'report.json'), JSON.stringify(report, null, 2))

  const plannerValidated = report.stamps.flowA === 'VALIDATED'
  const fitnessValidated = report.stamps.flowB === 'VALIDATED'
  const isolationValidated = report.stamps.accountIsolation === 'VALIDATED'
  const overallPassed =
    plannerValidated && fitnessValidated && isolationValidated

  const validationResults = {
    run_id: RUN_ID,
    finishedAt: report.finishedAt,
    testCommand: 'node scripts/qa/kenos-space-continuity-e2e-flows.mjs',
    environment: {
      aios: AIOS,
      planner: PLANNER,
      fitness: FITNESS,
      mode: 'vite-dev',
    },
    accounts: {
      A: {
        email: OWNER.email,
        authUid: OWNER.id,
        authUidShort: OWNER.id.slice(-4),
      },
      B: {
        email: USER_B.email,
        authUid: USER_B.id,
        authUidShort: USER_B.id.slice(-4),
      },
    },
    entities: {
      taskId: TASK_ID,
      taskTitleSeed: TASK_TITLE,
      taskTitleMutated: TASK_TITLE_MUTATED,
      exerciseId: EXERCISE_ID,
      dayId: 'chest',
      date: TODAY,
    },
    stamps: {
      contract: 'IMPLEMENTED',
      plannerEntityRestore: taskVisibleStamp(report),
      plannerContinuity: report.stamps.flowA,
      fitnessContinuity: report.stamps.flowB,
      accountIsolation: report.stamps.accountIsolation,
      visualQuality: 'IN_PROGRESS',
      ownerReview: 'NOT_OPEN',
      overallContinuityGate: overallPassed ? 'PASSED' : 'NOT_PASSED',
    },
    assertions: {
      reloadSeesTask:
        report.steps.find((s) => s.step === 'flowA.reload')?.reloadSeesTask ??
        null,
      reloadSeesMutated:
        report.steps.find((s) => s.step === 'flowA.reload')
          ?.reloadSeesMutated ?? null,
      reloginSeesMutated:
        report.steps.find((s) => s.step === 'flowA.relogin')
          ?.reloginSeesMutated ?? null,
      kenosSeesMutatedTitle:
        report.steps.find((s) => s.step === 'flowA.continueSheet')
          ?.kenosSeesMutatedTitle ?? null,
      mutationPersisted: report.db.afterFlowA?.mutationPersisted ?? null,
      adminWriteUsed: report.db.afterFlowA?.adminWriteUsed ?? null,
      fitnessDbDone: report.db.fitnessAfterSet2?.done ?? null,
      fitnessColdSet3:
        report.steps.find((s) => s.step === 'flowB.coldRead')?.coldSet3 ?? null,
      fitnessColdNoPinSet3:
        report.steps.find((s) => s.step === 'flowB.coldReadNoPin')
          ?.coldNoPinSet3 ?? null,
    },
    screenshotBindings,
    blockers: report.blockers,
  }
  writeFileSync(
    join(EVID, 'validation-results.json'),
    JSON.stringify(validationResults, null, 2),
  )

  writeFileSync(
    join(EVID, 'VALIDATION_MANIFEST.md'),
    buildManifest(report, validationResults, overallPassed),
  )

  writeFileSync(
    join(EVID, 'SUMMARY.md'),
    `# Continuity E2E ${RUN_ID}

## Stamps
- Flow A (Planner): ${report.stamps.flowA}
- Flow B (Fitness): ${report.stamps.flowB}
- Account isolation: ${report.stamps.accountIsolation}
- Overall Continuity Gate: ${overallPassed ? 'PASSED' : 'NOT_PASSED'}
- Visual Quality: IN_PROGRESS
- Owner Review: NOT OPEN

## Accounts
- A: ${OWNER.email} (${OWNER.id})
- B: ${USER_B.email} (${USER_B.id})

## Entities
- Task: ${TASK_ID} / seed=${TASK_TITLE} / mutated=${TASK_TITLE_MUTATED}
- Exercise: c_fly

## Blockers
${report.blockers.length ? report.blockers.map((b) => `- ${b}`).join('\n') : '- (none)'}

## DB after Flow A
\`\`\`json
${JSON.stringify(report.db.afterFlowA || null, null, 2)}
\`\`\`

## Fitness cold order
\`\`\`json
${JSON.stringify(
  {
    afterSet2: report.db.fitnessAfterSet2,
    cold: report.steps.find((s) => s.step === 'flowB.coldRead'),
    coldNoPin: report.steps.find((s) => s.step === 'flowB.coldReadNoPin'),
  },
  null,
  2,
)}
\`\`\`
`,
  )
  console.log('\nEVIDENCE', EVID)
  console.log('STAMPS', report.stamps)
  console.log('OVERALL', overallPassed ? 'PASSED' : 'NOT_PASSED')
  console.log('BLOCKERS', report.blockers)
  process.exitCode = overallPassed ? 0 : 2
}

function taskVisibleStamp(report) {
  const row = report.steps.find((s) => s.step === 'flowA.taskVisible')
  return row?.taskVisible ? 'VALIDATED' : 'NOT_PROVEN'
}

function buildManifest(report, validationResults, overallPassed) {
  return `# Continuity Validation Manifest

**Run:** \`${report.run_id}\`
**Overall Continuity Gate:** **${overallPassed ? 'PASSED' : 'NOT_PASSED'}**
**Owner Review:** NOT OPEN · **Visual Quality:** IN_PROGRESS

## Gate summary

| Gate | Status |
| ---- | ------ |
| Continuity Contract | IMPLEMENTED |
| Planner entity restore | ${validationResults.stamps.plannerEntityRestore} |
| Planner overall continuity | **${report.stamps.flowA}** |
| Fitness continuity | **${report.stamps.flowB}** |
| Account isolation | **${report.stamps.accountIsolation}** |
| Visual quality | IN_PROGRESS |
| Owner Review | NOT OPEN |
| Overall Continuity Gate | **${overallPassed ? 'PASSED' : 'NOT_PASSED'}** |

## Key assertions

| Assertion | Value |
| --------- | ----- |
| adminWriteUsed | ${validationResults.assertions.adminWriteUsed} |
| mutationPersisted (user JWT) | ${validationResults.assertions.mutationPersisted} |
| kenosSeesMutatedTitle | ${validationResults.assertions.kenosSeesMutatedTitle} |
| reloadSeesTask | ${validationResults.assertions.reloadSeesTask} |
| reloadSeesMutated | ${validationResults.assertions.reloadSeesMutated} |
| reloginSeesMutated | ${validationResults.assertions.reloginSeesMutated} |
| fitnessDbDone (want 2) | ${validationResults.assertions.fitnessDbDone} |
| fitnessColdSet3 | ${validationResults.assertions.fitnessColdSet3} |
| fitnessColdNoPinSet3 | ${validationResults.assertions.fitnessColdNoPinSet3} |

## Screenshot bindings (P2)

| File | step | context | UID | sha256 |
| ---- | ---- | ------- | --- | ------ |
${screenshotBindings
  .map(
    (b) =>
      `| \`${b.filename}\` | ${b.step_id} | \`${b.browser_context_id}\` | ${b.auth_uid_short} | \`${String(b.sha256).slice(0, 12)}…\` |`,
  )
  .join('\n')}

## Blockers
${report.blockers.length ? report.blockers.map((b) => `- ${b}`).join('\n') : '- (none)'}

## Command
\`\`\`bash
node scripts/qa/kenos-space-continuity-e2e-flows.mjs
\`\`\`
`
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
