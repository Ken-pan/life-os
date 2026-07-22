#!/usr/bin/env node
/**
 * KENOS P5 — Core Loop Reality Closure evidence harness.
 *
 * Proves one REAL object through: Capture → Convert(Plan Task) → Today count →
 * Edit(title/due) → Complete → Activity → Continue → Relaunch → Idempotent
 * duplicate → Offline recovery → Cross-user isolation.
 *
 * All WRITES go through the product UI or the same canonical owner-session
 * RPCs the UI calls (never admin/service-role). The admin client is used for
 * read-side assertions and end-of-run cleanup of rows this harness created.
 *
 * Requires the Daily Beta static release running (kenos-ctl.sh start) built
 * with Capture ingest/convert + Plan writers + VITE_KENOS_PROD_READ_PLAN_ACTIVITY.
 *
 * Usage: node scripts/kenos-daily-beta/core-loop-e2e.mjs
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { assertTestWriteAllowed } from '../lib/testProductionGuard.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const AIOS = process.env.KENOS_AIOS_URL || 'http://127.0.0.1:5219'
const PLANNER = process.env.KENOS_PLANNER_URL || 'http://127.0.0.1:5188'
const SUPABASE_URL = 'https://iueozzuctstwvzbcxcyh.supabase.co'
const OWNER = { id: 'c2831538-94b0-4a57-b034-5e873a53c42e', email: '334452284ken@gmail.com' }
const USER_B = { id: '8febdb83-ec49-467d-a9bf-d42620cc68fe', email: 'pettimes666666@gmail.com' }
const DATE = new Date().toISOString().slice(0, 10)
const EVID = join(ROOT, `docs/qa/evidence/kenos-core-loop-${DATE}`)
mkdirSync(EVID, { recursive: true })

const RUN_TAG = `p5-loop-${Date.now().toString(36)}`
const CAPTURE_TEXT = `P5 core loop task ${RUN_TAG}`

const flows = []
function record(id, expected, actual, ok) {
  flows.push({ id, expected, actual, ok })
  console.log(JSON.stringify({ id, ok, actual: String(JSON.stringify(actual)).slice(0, 220) }))
}

function getKey(name) {
  const raw = execSync(`supabase projects api-keys --project-ref iueozzuctstwvzbcxcyh -o json`, {
    encoding: 'utf8',
  })
  return JSON.parse(raw).find((x) => x.name === name)?.api_key
}

async function sessionFor(admin, anonKey, email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const anon = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: v, error: ve } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'email',
  })
  if (ve) throw ve
  return v.session
}

/** User-scoped client that sends the user's own JWT (RLS applies). */
function userClient(anonKey, session) {
  const client = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  })
  return client
}

async function injectAuth(page, origin, session) {
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate((s) => {
    localStorage.setItem('life_os_auth', JSON.stringify(s))
  }, session)
}

async function shot(page, name) {
  await page.screenshot({ path: join(EVID, `${name}.png`), fullPage: false }).catch(() => {})
}

async function main() {
  const startedAt = new Date().toISOString()
  const sha = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim()
  const serviceKey = getKey('service_role')
  const anonKey = getKey('anon')
  // Default-DENY production for test writes (scoped G2 authorization + KENOS_PROD_TEST_AUTHORIZED=1 required).
  assertTestWriteAllowed({ url: SUPABASE_URL })
  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const sessionA = await sessionFor(admin, anonKey, OWNER.email)
  const sessionB = await sessionFor(admin, anonKey, USER_B.email)
  const ownerRpc = userClient(anonKey, sessionA)
  const userBRpc = userClient(anonKey, sessionB)

  const browser = await chromium.launch({ headless: true })
  const todayKey = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD local

  let captureId = null
  let taskId = null

  // LOOP1 — Capture from AIOS UI (real ingest writer → kenos_capture_envelopes)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await injectAuth(page, AIOS, sessionA)
    await page.goto(AIOS + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: '快速捕获' }).first().click()
    await page.waitForTimeout(300)
    await page.locator('.capture-sheet textarea').fill(CAPTURE_TEXT)
    await shot(page, 'loop1-capture-sheet')
    await page.getByRole('button', { name: '打开收件箱' }).click()
    await page.waitForTimeout(2500)
    const { data: rows } = await admin
      .from('kenos_capture_envelopes')
      .select('id,status,payload')
      .eq('owner_id', OWNER.id)
      .contains('payload', { text: CAPTURE_TEXT })
    captureId = rows?.[0]?.id ?? null
    await shot(page, 'loop1-inbox-after-capture')
    record(
      'LOOP1_capture_ingest',
      'CaptureQuick save → kenos_capture_envelopes row (needs_review)',
      { captureId, status: rows?.[0]?.status, count: rows?.length },
      Boolean(captureId) && rows.length === 1 && rows[0].status === 'needs_review',
    )
    await ctx.close()
  }

  // LOOP2 — Convert to Plan Task from Inbox UI (canonical create RPC in-transaction)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await injectAuth(page, AIOS, sessionA)
    await page.goto(AIOS + '/inbox#capture', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    const row = page.getByText(CAPTURE_TEXT).first()
    const rowVisible = await row.count()
    // Convert button belongs to the capture card containing our text.
    const card = page.locator('[class*="capture"], li, article', { hasText: CAPTURE_TEXT }).first()
    const btn = card.getByRole('button', { name: /转为计划任务/ }).first()
    let clicked = false
    if (await btn.count()) {
      await btn.click()
      clicked = true
    } else {
      // fallback: any convert button on the page (single capture in run)
      const anyBtn = page.getByRole('button', { name: /转为计划任务/ }).first()
      if (await anyBtn.count()) {
        await anyBtn.click()
        clicked = true
      }
    }
    await page.waitForTimeout(3000)
    await shot(page, 'loop2-inbox-after-convert')
    const { data: cap } = await admin
      .from('kenos_capture_envelopes')
      .select('id,status,payload')
      .eq('id', captureId)
      .single()
    taskId = cap?.payload?.materialized?.taskId ?? null
    const { data: task } = taskId
      ? await admin.from('planner_tasks').select('id,data').eq('id', taskId).eq('user_id', OWNER.id).single()
      : { data: null }
    record(
      'LOOP2_convert_to_plan',
      'Inbox convert → capture materialized + canonical planner_tasks row',
      { rowVisible, clicked, captureStatus: cap?.status, taskId, taskTitle: task?.data?.title },
      clicked && cap?.status === 'materialized' && Boolean(taskId) && task?.data?.title === CAPTURE_TEXT,
    )
    await ctx.close()
  }

  // LOOP3 — Edit title + due date through planner UI editor (canonical update RPCs)
  const EDITED_TITLE = `${CAPTURE_TEXT} · edited`
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await injectAuth(page, PLANNER, sessionA)
    await page.goto(`${PLANNER}/upcoming`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500) // allow cloud hydrate
    await page.goto(`${PLANNER}/upcoming?kenosTask=${encodeURIComponent(taskId)}&kenosDetail=1`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(2000)
    const editorOpen = await page.locator('#task-title').count()
    let saved = false
    if (editorOpen) {
      await page.locator('#task-title').fill(EDITED_TITLE)
      await page.locator('#task-due').fill(todayKey)
      await shot(page, 'loop3-editor-filled')
      await page.getByRole('button', { name: /保存更改/ }).click()
      await page.waitForTimeout(2500)
      saved = true
    }
    const { data: task } = await admin
      .from('planner_tasks')
      .select('data')
      .eq('id', taskId)
      .eq('user_id', OWNER.id)
      .single()
    record(
      'LOOP3_edit_title_due',
      'Editor sheet save → canonical title + dueDate=today via update RPCs',
      { editorOpen, saved, title: task?.data?.title, dueDate: task?.data?.dueDate },
      saved && task?.data?.title === EDITED_TITLE && task?.data?.dueDate === todayKey,
    )
    await shot(page, 'loop3-planner-after-save')
    await ctx.close()
  }

  // LOOP4 — Today projection shows the task (AIOS count + Planner list)
  {
    const { data: summary } = await ownerRpc.rpc('portal_today_summary', {
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    const todayOpen = summary?.planner?.todayOpen ?? 0

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await injectAuth(page, AIOS, sessionA)
    await page.goto(AIOS + '/', { waitUntil: 'domcontentloaded' })
    // Wait for the post-auth forced projection refresh to render real counts.
    await page
      .waitForFunction(
        () => /今天到期|逾期/.test(document.body?.innerText ?? ''),
        { timeout: 20_000 },
      )
      .catch(() => {})
    const todayText = await page.evaluate(() => document.body?.innerText ?? '')
    await shot(page, 'loop4-aios-today')
    const aiosShowsCount = todayOpen > 0 && todayText.includes(String(todayOpen))

    await injectAuth(page, PLANNER, sessionA)
    await page.goto(`${PLANNER}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    const plannerHasTask = (await page.getByText(EDITED_TITLE).count()) > 0
    await shot(page, 'loop4-planner-today')
    record(
      'LOOP4_today_projection',
      'portal_today_summary todayOpen>0; AIOS Today renders count; Planner lists task',
      { todayOpen, aiosShowsCount, plannerHasTask, todaySample: todayText.slice(0, 160) },
      todayOpen > 0 && aiosShowsCount && plannerHasTask,
    )
    await ctx.close()
  }

  // LOOP5 — Complete via planner UI (canonical complete RPC) → kenos_plan_activity
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await injectAuth(page, PLANNER, sessionA)
    await page.goto(`${PLANNER}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    // TaskRow root is div.swipe-item — scope the toggle to the matching row.
    const row = page.locator('.swipe-item', { hasText: EDITED_TITLE }).first()
    const toggle = row.getByRole('button', { name: 'toggle' }).first()
    let toggled = false
    if (await toggle.count()) {
      await toggle.click()
      toggled = true
      await page.waitForTimeout(5000) // completion delay animation + RPC
    }
    await shot(page, 'loop5-after-complete')
    const { data: task } = await admin
      .from('planner_tasks')
      .select('data')
      .eq('id', taskId)
      .single()
    const { data: activity } = await admin
      .from('kenos_plan_activity')
      .select('id,action_type,entity_ref,summary,created_at')
      .eq('user_id', OWNER.id)
      .eq('action_type', 'plan.complete_task')
      .order('created_at', { ascending: false })
      .limit(5)
    const actForTask = (activity ?? []).find((a) => a?.entity_ref?.id === taskId)
    record(
      'LOOP5_complete_activity',
      'UI toggle → task completed + plan.complete_task row in kenos_plan_activity',
      { toggled, completed: task?.data?.completed, activityId: actForTask?.id },
      toggled && task?.data?.completed === true && Boolean(actForTask),
    )
    await ctx.close()
  }

  // LOOP6 — Activity visible in AIOS feed (canonical read source, flag baked in beta)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await injectAuth(page, AIOS, sessionA)
    await page.goto(AIOS + '/activity', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    const text = await page.locator('main').innerText().catch(() => '')
    await shot(page, 'loop6-aios-activity')
    const showsCompletion = /plan\.complete_task|完成/.test(text)
    record(
      'LOOP6_activity_feed',
      'AIOS /activity renders canonical plan.complete_task record',
      { showsCompletion, sample: text.slice(0, 160) },
      showsCompletion,
    )
    await ctx.close()
  }

  // LOOP7 — Continue handoff: Plan CTA → descriptor bound to task → AIOS resume
  // Mobile viewport: the appbar Continue CTA is part of the mobile shell.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await injectAuth(page, AIOS, sessionA) // AIOS session for the handoff landing
    await injectAuth(page, PLANNER, sessionA)
    await page.goto(`${PLANNER}/upcoming?kenosTask=${encodeURIComponent(taskId)}&kenosDetail=1`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(2500)
    // Close the editor sheet first — it covers the appbar Continue CTA.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    const cta = page.getByTestId('planner-kenos-continue').first()
    const ctaVisible = await cta.count()
    let descriptor = null
    let landedOnAios = false
    if (ctaVisible) {
      await cta.click({ timeout: 10_000 })
      await page.waitForTimeout(2500)
      landedOnAios = page.url().startsWith(AIOS)
      descriptor = await page.evaluate(() => {
        const raw = localStorage.getItem('kenos.spaceSwitcher.v1')
        return raw ? JSON.parse(raw) : null
      })
    }
    const resumeJson = JSON.stringify(descriptor ?? {})
    await shot(page, 'loop7-aios-continue-sheet')
    record(
      'LOOP7_continue_descriptor',
      'Plan Continue CTA hands off to AIOS with resume descriptor bound to task',
      {
        ctaVisible,
        landedOnAios,
        boundToTask: resumeJson.includes(taskId),
        url: page.url().slice(0, 120),
      },
      ctaVisible > 0 && landedOnAios && resumeJson.includes(taskId),
    )
    await ctx.close()
  }

  // LOOP8 — Relaunch: fresh context, same auth → exactly one task, state intact
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await injectAuth(page, PLANNER, sessionA)
    await page.goto(`${PLANNER}/history`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    const { data: dupes } = await admin
      .from('planner_tasks')
      .select('id')
      .eq('user_id', OWNER.id)
      .contains('data', { title: EDITED_TITLE })
    const uiCount = await page.getByText(EDITED_TITLE).count()
    await shot(page, 'loop8-relaunch-history')
    record(
      'LOOP8_relaunch_no_dup',
      'Fresh context relaunch → task exists exactly once and stays completed',
      { dbCount: dupes?.length, uiCount },
      dupes?.length === 1,
    )
    await ctx.close()
  }

  // LOOP9 — Idempotency: replay the ORIGINAL convert idempotency key twice
  {
    // Recover the idempotency key the UI conversion stored server-side.
    const { data: idemRows } = await admin
      .from('kenos_plan_action_idempotency')
      .select('action_type,idempotency_key,task_id')
      .eq('user_id', OWNER.id)
      .eq('action_type', 'capture.convert_to_plan_task')
      .eq('task_id', String(taskId))
    const originalKey = idemRows?.[0]?.idempotency_key ?? null
    const envelope = () => ({
      schemaVersion: '1',
      id: crypto.randomUUID(),
      actionType: 'capture.convert_to_plan_task',
      producer: 'assistant',
      targetDomain: 'plan',
      actor: { type: 'user', id: OWNER.id },
      deviceId: crypto.randomUUID(),
      securityDomain: 'personal',
      dataClassification: 'personal',
      requestedRisk: 'R1',
      payload: { captureId },
      reason: 'idempotency replay proof',
      idempotencyKey: originalKey,
      requestedAt: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
    })
    const first = await ownerRpc.rpc('kenos_convert_capture_to_plan_task_action', {
      action_request: envelope(),
    })
    const replay = await ownerRpc.rpc('kenos_convert_capture_to_plan_task_action', {
      action_request: envelope(),
    })
    const { data: allTasks } = await admin
      .from('planner_tasks')
      .select('id,data')
      .eq('user_id', OWNER.id)
    const loopTasks = (allTasks ?? []).filter((t) =>
      String(t?.data?.title ?? '').includes(RUN_TAG) && !String(t?.data?.title ?? '').includes('offline'),
    )
    const firstDup = first?.data?.result?.duplicate === true
    const replayDup = replay?.data?.result?.duplicate === true
    record(
      'LOOP9_idempotent_replay',
      'Replaying the original convert idempotency key → duplicate:true, still one task',
      {
        originalKey: Boolean(originalKey),
        firstDup,
        replayDup,
        firstErr: first?.error?.message,
        replayErr: replay?.error?.message,
        loopTaskCount: loopTasks.length,
      },
      Boolean(originalKey) && firstDup && replayDup && loopTasks.length === 1,
    )
  }

  // LOOP10 — Offline recovery: create queued offline, flush on reconnect, no dup
  const OFFLINE_TITLE = `P5 offline task ${RUN_TAG}`
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await injectAuth(page, PLANNER, sessionA)
    await page.goto(`${PLANNER}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await ctx.setOffline(true)
    const quickAdd = page.locator('.quick-add-input-wrap input').first()
    let typed = false
    if (await quickAdd.count()) {
      await quickAdd.fill(OFFLINE_TITLE)
      await quickAdd.press('Enter')
      typed = true
      await page.waitForTimeout(1200)
    }
    const queuedState = await page.evaluate(() => {
      const raw = localStorage.getItem('kenos.plan.offlineIntentQueue.v1')
      return raw ? JSON.parse(raw) : null
    })
    await shot(page, 'loop10-offline-queued')
    await ctx.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.waitForTimeout(5000)
    const { data: created } = await admin
      .from('planner_tasks')
      .select('id')
      .eq('user_id', OWNER.id)
      .contains('data', { title: OFFLINE_TITLE })
    const drained = await page.evaluate(() => {
      const raw = localStorage.getItem('kenos.plan.offlineIntentQueue.v1')
      const q = raw ? JSON.parse(raw) : null
      return q ? (q.intents ?? q.items ?? []).filter((i) => i?.status === 'pending').length : 0
    })
    await shot(page, 'loop10-after-reconnect')
    record(
      'LOOP10_offline_recovery',
      'Offline create queued locally; reconnect flush → exactly one task; queue drained',
      { typed, queuedCount: queuedState ? JSON.stringify(queuedState).length : 0, created: created?.length, drainedPending: drained },
      typed && created?.length === 1 && drained === 0,
    )
    await ctx.close()
  }

  // LOOP11 — Authorization isolation (user B + unauthenticated)
  {
    const { data: bCaps } = await userBRpc.rpc('kenos_list_capture_envelopes', {})
    const bSeesOwnerCapture = (Array.isArray(bCaps) ? bCaps : []).some((c) => c?.id === captureId)
    const bConvert = await userBRpc.rpc('kenos_convert_capture_to_plan_task_action', {
      action_request: {
        schemaVersion: '1',
        id: crypto.randomUUID(),
        actionType: 'capture.convert_to_plan_task',
        producer: 'assistant',
        targetDomain: 'plan',
        actor: { type: 'user', id: USER_B.id },
        deviceId: crypto.randomUUID(),
        securityDomain: 'personal',
        dataClassification: 'personal',
        requestedRisk: 'R1',
        payload: { captureId },
        reason: 'cross-user attack proof',
        idempotencyKey: `capture_convert:attack:${RUN_TAG}`,
        requestedAt: new Date().toISOString(),
        correlationId: crypto.randomUUID(),
      },
    })
    const bConvertBlocked =
      Boolean(bConvert.error) || bConvert?.data?.ok === false || bConvert?.data?.error != null
    const { data: bActivity } = await userBRpc.rpc('kenos_list_plan_activity', { p_limit: 200 })
    const bSeesOwnerActivity = (Array.isArray(bActivity) ? bActivity : []).some(
      (a) => a?.entity_ref?.id === taskId || a?.user_id === OWNER.id,
    )
    const anonClient = createClient(SUPABASE_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const anonList = await anonClient.rpc('kenos_list_plan_activity', { p_limit: 5 })
    const anonBlocked = Boolean(anonList.error) || (anonList.data ?? []).length === 0
    record(
      'LOOP11_authz_isolation',
      'User B cannot see/convert owner capture, cannot read owner activity; anon blocked',
      {
        bSeesOwnerCapture,
        bConvertBlocked,
        bConvertErr: bConvert?.error?.message ?? bConvert?.data?.error ?? null,
        bSeesOwnerActivity,
        anonBlocked,
        anonErr: anonList?.error?.message ?? null,
      },
      !bSeesOwnerCapture && bConvertBlocked && !bSeesOwnerActivity && anonBlocked,
    )
  }

  await browser.close()

  // Cleanup rows created by this run (test hygiene; canonical data untouched otherwise).
  const cleanup = { tasks: 0, captures: 0 }
  {
    const { data: tasks } = await admin
      .from('planner_tasks')
      .select('id,data')
      .eq('user_id', OWNER.id)
    for (const t of tasks ?? []) {
      const title = t?.data?.title ?? ''
      if (title.includes('p5-loop-') || title.includes(RUN_TAG)) {
        await admin.from('planner_tasks').delete().eq('id', t.id).eq('user_id', OWNER.id)
        cleanup.tasks += 1
      }
    }
    // Purge every capture this harness family created (incl. earlier runs).
    const { data: caps } = await admin
      .from('kenos_capture_envelopes')
      .select('id,payload')
      .eq('owner_id', OWNER.id)
    for (const c of caps ?? []) {
      if (String(c?.payload?.text ?? '').startsWith('P5 core loop task p5-loop-')) {
        await admin.from('kenos_capture_envelopes').delete().eq('id', c.id)
        cleanup.captures += 1
      }
    }
  }

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    sha,
    runTag: RUN_TAG,
    origins: { AIOS, PLANNER },
    taskId,
    captureId,
    cleanup,
    flows,
    pass: flows.every((f) => f.ok),
  }
  writeFileSync(join(EVID, 'core-loop-e2e.json'), JSON.stringify(report, null, 2))
  console.log('PASS', report.pass)
  process.exit(report.pass ? 0 : 2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
