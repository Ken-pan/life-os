#!/usr/bin/env node
/**
 * iOS Daily Beta — FLOW A/B device harness (17 Pro).
 *
 * Uses phone WKWebView same-origin probes + Supabase user JWT (already in AIOS
 * LocalStorage) to mutate/verify Planner, and deep-links for Continuity resume.
 * Does NOT claim DOM UI taps on #task-title (no XCUITest); labels honestly.
 *
 * Requires: unlocked device, Daily Beta LAN up, Auth already on AIOS origin.
 */
import { execSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const DEVICE =
  process.env.KENOS_IOS_DEVICE || '8097F071-CAB6-5AF0-8258-BCD985E9D79E'
const BUNDLE = 'space.kenos.app.ios'
const REF = 'iueozzuctstwvzbcxcyh'
const OWNER = {
  id: 'c2831538-94b0-4a57-b034-5e873a53c42e',
  email: '334452284ken@gmail.com',
}
const EXERCISE_ID = 'c_fly'
const RELEASE =
  process.env.KENOS_DAILY_BETA_RELEASE ||
  join(process.env.HOME, '.kenos-daily-beta/current')
const AIOS_ROOT = join(RELEASE, 'apps/aios/build')
const PLANNER_ROOT = join(RELEASE, 'apps/planner/build')
const FITNESS_ROOT = join(RELEASE, 'apps/fitness/build')
const EVID = join(ROOT, 'docs/qa/evidence/kenos-ios-daily-beta-2026-07-21')
const RUN_ID = `ios-flow-ab-${new Date().toISOString().replace(/[:.]/g, '-')}`
const LOG_DIR = join(EVID, 'logs', RUN_ID)
const AIOS_LOG = join(
  process.env.HOME,
  'Library/Logs/KenosDailyBeta/aios.stderr.log',
)
const PLANNER_LOG = join(
  process.env.HOME,
  'Library/Logs/KenosDailyBeta/planner.stderr.log',
)
const FITNESS_LOG = join(
  process.env.HOME,
  'Library/Logs/KenosDailyBeta/fitness.stderr.log',
)

mkdirSync(LOG_DIR, { recursive: true })

function lan() {
  return execSync('ipconfig getifaddr en0', { encoding: 'utf8' }).trim()
}

function log(step, detail = {}) {
  const row = { ts: new Date().toISOString(), step, ...detail }
  console.log(JSON.stringify(row))
  return row
}

function getKeys() {
  const raw = execSync(
    `supabase projects api-keys --project-ref ${REF} -o json`,
    { encoding: 'utf8' },
  )
  const d = JSON.parse(raw)
  return {
    service_role: d.find((x) => x.name === 'service_role')?.api_key,
    anon: d.find((x) => x.name === 'anon')?.api_key,
  }
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

function localDateISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function launchOnce(url) {
  const r = spawnSync(
    'xcrun',
    [
      'devicectl',
      'device',
      'process',
      'launch',
      '--device',
      DEVICE,
      '--terminate-existing',
      '--payload-url',
      url,
      BUNDLE,
    ],
    { encoding: 'utf8' },
  )
  writeFileSync(
    join(
      LOG_DIR,
      `launch-${createHash('sha1').update(url).digest('hex').slice(0, 8)}.txt`,
    ),
    (r.stdout || '') + (r.stderr || ''),
  )
  return r
}

function launch(url, { retries = 18, delayMs = 5000 } = {}) {
  let last = ''
  for (let i = 1; i <= retries; i++) {
    const r = launchOnce(url)
    const out = (r.stdout || '') + (r.stderr || '')
    last = out
    if (
      r.status === 0 &&
      !/Locked|could not be established|Connection was invalidated|unable to locate a device|CoreDeviceError/i.test(
        out,
      )
    ) {
      return r
    }
    log('launch.retry', {
      i,
      locked: /Locked/.test(out),
      conn: /could not be established|invalidated|unable to locate|CoreDeviceError/i.test(
        out,
      ),
    })
    sleep(delayMs)
  }
  throw new Error(`launch failed after retries: ${last.slice(0, 400)}`)
}

function waitUnlocked(max = 36) {
  const host = lan()
  const url = `http://${host}:5219/?iosNativeShell=1`
  for (let i = 1; i <= max; i++) {
    const r = launchOnce(url)
    const out = (r.stdout || '') + (r.stderr || '')
    if (
      r.status === 0 &&
      !/Locked|could not be established|Connection was invalidated|unable to locate a device|CoreDeviceError/i.test(
        out,
      )
    ) {
      log('device.unlocked', { i })
      return
    }
    log('device.wait', {
      i,
      locked: /Locked/.test(out),
      conn: /could not be established|invalidated|unable to locate|CoreDeviceError/i.test(
        out,
      ),
      status: r.status,
    })
    sleep(5000)
  }
  throw new Error('device still locked / unreachable')
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function tailPhoneBeacons(logPath, needle, phoneIp, limit = 20) {
  if (!existsSync(logPath)) return []
  const lines = readFileSync(logPath, 'utf8').split('\n')
  return lines
    .filter((l) => l.includes(phoneIp) && l.includes(needle))
    .slice(-limit)
}

function writeProbe(root, name, html) {
  const p = join(root, name)
  writeFileSync(p, html)
  return p
}

function scrub(...paths) {
  for (const p of paths) {
    try {
      rmSync(p, { force: true })
    } catch {
      /* ignore */
    }
  }
}

function encodeResume(descriptor) {
  return Buffer.from(JSON.stringify(descriptor), 'utf8').toString('base64url')
}

async function main() {
  const host = lan()
  const phoneIp = '10.20.202.6'
  const AIOS = `http://${host}:5219`
  const PLANNER = `http://${host}:5188`
  const FITNESS = `http://${host}:5190`
  const report = {
    runId: RUN_ID,
    host,
    phoneIp,
    flowA: { status: 'NOT_RUN' },
    flowB: { status: 'NOT_RUN' },
    layout: { status: 'PRIOR_PASS' },
    auth: { status: 'PRIOR_PASS' },
    notes: [],
  }

  waitUnlocked()

  const keys = getKeys()
  const url = `https://${REF}.supabase.co`
  const admin = createClient(url, keys.service_role, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const anon = createClient(url, keys.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const session = await sessionFor(admin, anon, OWNER.email)
  log('auth.session', { email: OWNER.email })

  const TASK_ID = `ios-ab-${Date.now().toString(36)}`
  const TASK_TITLE = `iOS FlowA Seed ${RUN_ID.slice(-12)}`
  const TASK_TITLE_MUT = `iOS FlowA MUT ${RUN_ID.slice(-10)}`
  const now = new Date().toISOString()
  const TODAY = localDateISO()

  // --- Seed Planner task ---
  const taskData = {
    id: TASK_ID,
    title: TASK_TITLE,
    notes: `iOS Daily Beta ${RUN_ID}`,
    completed: false,
    deletedAt: null,
    createdAt: now,
    dueDate: TODAY,
    listId: null,
    projectId: null,
    priority: 'normal',
    urgency: 'normal',
    tags: ['kenos-ios-daily-beta'],
    subtasks: [],
    meta: { iosFlowRunId: RUN_ID },
  }
  const { error: upsertErr } = await admin.from('planner_tasks').upsert({
    user_id: OWNER.id,
    id: TASK_ID,
    data: taskData,
    updated_at: now,
    os_module: 'planner',
  })
  if (upsertErr) throw upsertErr
  log('db.seed.task', { TASK_ID, TASK_TITLE })

  // --- Inject auth to all three origins (session JSON scrubbed after) ---
  const sessionPayload = {
    access_token: session.access_token,
    token_type: session.token_type || 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + 3600,
    refresh_token: session.refresh_token,
    user: session.user,
  }
  for (const [root, onceName] of [
    [AIOS_ROOT, '__ios_auth_once.json'],
    [PLANNER_ROOT, '__ios_auth_once.json'],
    [FITNESS_ROOT, '__ios_auth_once.json'],
  ]) {
    writeFileSync(join(root, onceName), JSON.stringify(sessionPayload))
  }

  const authBootstrap = `<!doctype html><html><body><script>
(async function(){
  const key='life_os_auth';
  const res=await fetch('/__ios_auth_once.json',{cache:'no-store'});
  const session=await res.json();
  localStorage.setItem(key, JSON.stringify(session));
  if (session.access_token && session.refresh_token) {
    const tokens=encodeURIComponent(JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }));
    document.cookie='lifeos_shared_session='+tokens+'; path=/; max-age=31536000; SameSite=Lax';
  }
  const email=(session.user&&session.user.email)||'none';
  await fetch('/__health?kenos_auth_inject='+encodeURIComponent(email)+'&o='+encodeURIComponent(location.origin),{cache:'no-store'}).catch(()=>{});
  location.replace(location.origin+(location.port==='5219'?'/?iosNativeShell=1':'/'));
})();
</script></body></html>`

  writeProbe(AIOS_ROOT, '__ios_auth_bootstrap.html', authBootstrap)
  writeProbe(PLANNER_ROOT, '__ios_auth_bootstrap.html', authBootstrap)
  writeProbe(FITNESS_ROOT, '__ios_auth_bootstrap.html', authBootstrap)

  for (const origin of [AIOS, PLANNER, FITNESS]) {
    launch(`${origin}/__ios_auth_bootstrap.html`)
    sleep(3500)
  }
  scrub(
    join(AIOS_ROOT, '__ios_auth_once.json'),
    join(PLANNER_ROOT, '__ios_auth_once.json'),
    join(FITNESS_ROOT, '__ios_auth_once.json'),
    join(AIOS_ROOT, '__ios_auth_bootstrap.html'),
    join(PLANNER_ROOT, '__ios_auth_bootstrap.html'),
    join(FITNESS_ROOT, '__ios_auth_bootstrap.html'),
  )
  report.notes.push('Auth injected to AIOS+Planner+Fitness origins on device')

  // --- FLOW A: mutate via phone JWT probe, open Continuity, cold re-verify ---
  const flowAProbe = `<!doctype html><html><body><script>
(async function(){
  const REF='${REF}';
  const TASK_ID=${JSON.stringify(TASK_ID)};
  const MUT=${JSON.stringify(TASK_TITLE_MUT)};
  const OWNER_ID=${JSON.stringify(OWNER.id)};
  const key='life_os_auth';
  let status='fail';
  let detail={};
  try{
    const raw=localStorage.getItem(key);
    const sess=JSON.parse(raw||'{}');
    const jwt=sess.access_token;
    if(!jwt) throw new Error('no_jwt');
    // Read current
    const r1=await fetch('https://'+REF+'.supabase.co/rest/v1/planner_tasks?id=eq.'+encodeURIComponent(TASK_ID)+'&select=id,data',{
      headers:{apikey:sess.access_token?'${keys.anon}':'', Authorization:'Bearer '+jwt, Accept:'application/json'}
    });
    const rows=await r1.json();
    const data=(rows[0]&&rows[0].data)||{};
    data.title=MUT;
    data.notes=(data.notes||'')+' · phone-mut '+Date.now();
    data.updatedAt=new Date().toISOString();
    const r2=await fetch('https://'+REF+'.supabase.co/rest/v1/planner_tasks?id=eq.'+encodeURIComponent(TASK_ID),{
      method:'PATCH',
      headers:{
        apikey:'${keys.anon}',
        Authorization:'Bearer '+jwt,
        'Content-Type':'application/json',
        Prefer:'return=representation'
      },
      body:JSON.stringify({data, updated_at:new Date().toISOString()})
    });
    const patched=await r2.json();
    const title=(patched[0]&&patched[0].data&&patched[0].data.title)||null;
    // Seed Continue store
    const resume={
      v:1,
      spaceId:'plan',
      route:'${PLANNER}/upcoming',
      entityId:TASK_ID,
      title:MUT,
      summary:MUT,
      updatedAt:new Date().toISOString(),
      substate:{detailOpen:true, filter:'upcoming'}
    };
    const store={
      ownerId:OWNER_ID,
      recent:['plan'],
      pinned:[],
      resume:{plan:resume},
      currentListKey:'plan',
      version:1
    };
    localStorage.setItem('kenos.spaceSwitcher.v1', JSON.stringify(store));
    status = title===MUT ? 'ok' : 'mismatch';
    detail={title, taskId:TASK_ID, http:r2.status};
  }catch(e){ detail={error:String(e)}; }
  await fetch('/__health?kenos_flow_a='+encodeURIComponent(JSON.stringify({status,...detail})),{cache:'no-store'});
  location.replace('/?iosNativeShell=1&openContinue=1');
})();
</script></body></html>`

  writeProbe(AIOS_ROOT, '__ios_flow_a.html', flowAProbe)
  launch(`${AIOS}/__ios_flow_a.html`)
  sleep(5000)
  const flowABeacons = tailPhoneBeacons(AIOS_LOG, 'kenos_flow_a=', phoneIp)
  writeFileSync(
    join(LOG_DIR, 'flow-a-mutate-beacons.txt'),
    flowABeacons.join('\n'),
  )
  log('flowA.mutate.beacons', {
    n: flowABeacons.length,
    last: flowABeacons.at(-1)?.slice(0, 200),
  })

  // Open Planner deep resume on device
  const plannerUrl = `${PLANNER}/upcoming?kenosTask=${encodeURIComponent(TASK_ID)}&kenosDetail=1`
  launch(plannerUrl)
  sleep(4000)
  const plannerHits = tailPhoneBeacons(PLANNER_LOG, 'kenosTask=', phoneIp)
  writeFileSync(
    join(LOG_DIR, 'flow-a-planner-hits.txt'),
    plannerHits.join('\n'),
  )

  // Force quit + cold verify via probe (read-only)
  const verifyProbe = `<!doctype html><html><body><script>
(async function(){
  const REF='${REF}';
  const TASK_ID=${JSON.stringify(TASK_ID)};
  const MUT=${JSON.stringify(TASK_TITLE_MUT)};
  const key='life_os_auth';
  let status='fail'; let title=null;
  try{
    const sess=JSON.parse(localStorage.getItem(key)||'{}');
    const jwt=sess.access_token;
    const r=await fetch('https://'+REF+'.supabase.co/rest/v1/planner_tasks?id=eq.'+encodeURIComponent(TASK_ID)+'&select=id,data',{
      headers:{apikey:'${keys.anon}', Authorization:'Bearer '+jwt, Accept:'application/json'}
    });
    const rows=await r.json();
    title=(rows[0]&&rows[0].data&&rows[0].data.title)||null;
    status = title===MUT ? 'ok' : 'mismatch';
  }catch(e){ status='err'; title=String(e); }
  await fetch('/__health?kenos_flow_a_verify='+encodeURIComponent(JSON.stringify({status,title,taskId:TASK_ID})),{cache:'no-store'});
  location.replace('/?iosNativeShell=1&openContinue=1');
})();
</script></body></html>`

  // terminate = force quit path via --terminate-existing on next launch
  writeProbe(AIOS_ROOT, '__ios_flow_a_verify.html', verifyProbe)
  sleep(1000)
  launch(`${AIOS}/__ios_flow_a_verify.html`)
  sleep(4500)
  const verifyBeacons = tailPhoneBeacons(
    AIOS_LOG,
    'kenos_flow_a_verify=',
    phoneIp,
  )
  writeFileSync(
    join(LOG_DIR, 'flow-a-verify-beacons.txt'),
    verifyBeacons.join('\n'),
  )

  // Also confirm DB from Mac with user JWT
  const clientA = createClient(url, keys.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  })
  const { data: afterRows } = await clientA
    .from('planner_tasks')
    .select('id,data')
    .eq('id', TASK_ID)
  const dbTitle = afterRows?.[0]?.data?.title || null
  const phoneMutOk =
    /kenos_flow_a=.*ok/.test(flowABeacons.join('\n')) ||
    flowABeacons.some(
      (l) =>
        l.includes('%22status%22%3A%22ok%22') ||
        l.includes('"status":"ok"') ||
        decodeURIComponent(l).includes('"status":"ok"'),
    )
  const phoneVerifyOk = verifyBeacons.some((l) => {
    try {
      const q = l.split('kenos_flow_a_verify=')[1]?.split(' ')[0] || ''
      const j = JSON.parse(decodeURIComponent(q))
      return j.status === 'ok' && j.title === TASK_TITLE_MUT
    } catch {
      return decodeURIComponent(l).includes('"status":"ok"')
    }
  })

  report.flowA = {
    status:
      dbTitle === TASK_TITLE_MUT && (phoneMutOk || phoneVerifyOk)
        ? 'PASS_DEVICE_SESSION_MUTATE'
        : dbTitle === TASK_TITLE_MUT
          ? 'PARTIAL_DB_ONLY'
          : 'FAIL',
    taskId: TASK_ID,
    seedTitle: TASK_TITLE,
    mutatedTitle: TASK_TITLE_MUT,
    dbTitle,
    phoneMutOk,
    phoneVerifyOk,
    plannerDeepLinkHits: plannerHits.length,
    method:
      'phone WKWebView JWT PATCH + force-quit re-read (not XCUITest DOM edit)',
  }
  log('flowA.done', report.flowA)
  scrub(
    join(AIOS_ROOT, '__ios_flow_a.html'),
    join(AIOS_ROOT, '__ios_flow_a_verify.html'),
  )

  // --- FLOW B: seed set progress, deep-link set 2, Continue handoff ---
  // Tables live in fitness schema (not public) — match continuity e2e harness.
  const fitnessAdmin = createClient(url, keys.service_role, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'fitness' },
  })
  const { data: chestSessions } = await fitnessAdmin
    .from('fitness_workout_sessions')
    .select('id')
    .eq('user_id', OWNER.id)
    .eq('session_date', TODAY)
    .eq('day_id', 'chest')
  const chestIds = (chestSessions || []).map((s) => s.id)
  if (chestIds.length) {
    await fitnessAdmin
      .from('fitness_exercise_logs')
      .delete()
      .in('session_id', chestIds)
      .eq('exercise_id', EXERCISE_ID)
  }

  // Ensure a session exists
  let sessionId = chestIds[0]
  if (!sessionId) {
    const { data: created, error: cErr } = await fitnessAdmin
      .from('fitness_workout_sessions')
      .insert({
        user_id: OWNER.id,
        session_date: TODAY,
        day_id: 'chest',
        status: 'active',
      })
      .select('id')
      .single()
    if (cErr) {
      report.flowB = { status: 'FAIL', error: cErr.message }
      log('flowB.session.create.fail', cErr)
    } else {
      sessionId = created.id
    }
  }

  if (sessionId) {
    // Insert one completed set log if schema allows — best-effort
    // Schema: done int + sets jsonb (not per-set columns)
    const { error: logErr } = await fitnessAdmin
      .from('fitness_exercise_logs')
      .upsert(
        {
          session_id: sessionId,
          user_id: OWNER.id,
          exercise_id: EXERCISE_ID,
          done: 1,
          sets: [
            { reps: 10, weight: 20, rir: null, ts: new Date().toISOString() },
          ],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,exercise_id' },
      )
    log('flowB.seed.set1', { sessionId, error: logErr?.message || null })

    const set2Url = `${FITNESS}/day/chest/focus?kenosEx=${EXERCISE_ID}&kenosSet=2`
    launch(set2Url)
    sleep(4000)
    const fitnessHits = tailPhoneBeacons(FITNESS_LOG, 'kenosSet=2', phoneIp)
    writeFileSync(
      join(LOG_DIR, 'flow-b-fitness-hits.txt'),
      fitnessHits.join('\n'),
    )

    const resumeB = {
      v: 1,
      spaceId: 'training',
      route: `${FITNESS}/day/chest/focus`,
      entityId: EXERCISE_ID,
      title: 'Cable Fly',
      summary: 'Set 2 of 3',
      updatedAt: new Date().toISOString(),
      substate: { set: 2, exerciseId: EXERCISE_ID, dayId: 'chest' },
    }
    const handoff = `${AIOS}/?iosNativeShell=1&openContinue=1&kenosResume=${encodeResume(resumeB)}`
    launch(handoff)
    sleep(3500)
    const continueHits = tailPhoneBeacons(AIOS_LOG, 'kenosResume=', phoneIp)
    writeFileSync(
      join(LOG_DIR, 'flow-b-continue-hits.txt'),
      continueHits.join('\n'),
    )

    // Re-open set 2 after terminate
    launch(set2Url)
    sleep(3500)
    const fitnessHits2 = tailPhoneBeacons(FITNESS_LOG, 'kenosSet=2', phoneIp)
    report.flowB = {
      status:
        fitnessHits.length + fitnessHits2.length > 0
          ? 'PASS_DEVICE_DEEPLINK_SET2'
          : 'FAIL',
      sessionId,
      exerciseId: EXERCISE_ID,
      set: 2,
      fitnessDeepLinkHits: fitnessHits.length + fitnessHits2.length,
      continueHandoffHits: continueHits.length,
      seedLogError: logErr?.message || null,
      method:
        'device deep-link kenosSet=2 + Continue handoff (set ladder UI not XCUITest-tapped)',
    }
    log('flowB.done', report.flowB)
  }

  // Final Today home
  launch(`${AIOS}/?iosNativeShell=1`)
  sleep(2000)

  writeFileSync(join(LOG_DIR, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(
    join(EVID, 'logs', 'ios-flow-ab-latest.json'),
    JSON.stringify(report, null, 2),
  )
  console.log('\n=== REPORT ===')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
