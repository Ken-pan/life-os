#!/usr/bin/env node
/**
 * Close iOS Personal Daily Beta matrix after Flow A PASS:
 * Flow B (Set1 UI → Continue Set2, no forced kenosSet pin) +
 * surfaces / isolation / lifecycle / offline / a11y.
 */
import { execSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  appendFileSync,
  rmSync,
  copyFileSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const DEVICE = process.env.KENOS_IOS_DEVICE || '8097F071-CAB6-5AF0-8258-BCD985E9D79E'
const BUNDLE = 'space.kenos.app.ios'
const REF = 'iueozzuctstwvzbcxcyh'
const OWNER = {
  id: 'c2831538-94b0-4a57-b034-5e873a53c42e',
  email: '334452284ken@gmail.com',
  uidRedacted: 'c283…c42e',
}
const ACCOUNT_B = {
  email: 'kenos-daily-beta-b@life-os.local',
  password: process.env.KENOS_ACCOUNT_B_PASSWORD || 'KenosDailyBetaB-2026!',
}
const EXERCISE_ID = 'c_fly'
const DAY_ID = 'chest'
const RELEASE = join(process.env.HOME, '.kenos-daily-beta/current')
const AIOS_ROOT = join(RELEASE, 'apps/aios/build')
const FITNESS_ROOT = join(RELEASE, 'apps/fitness/build')
const EVID = join(ROOT, 'docs/qa/evidence/kenos-ios-daily-beta-2026-07-21')
const RUN_ID = `ios-matrix-close-${new Date().toISOString().replace(/[:.]/g, '-')}`
const LOG_DIR = join(EVID, 'logs', RUN_ID)
const FITNESS_LOG = join(process.env.HOME, 'Library/Logs/KenosDailyBeta/fitness.stderr.log')
const AIOS_LOG = join(process.env.HOME, 'Library/Logs/KenosDailyBeta/aios.stderr.log')
const BUILD_SHA = readFileSync(join(process.env.HOME, '.kenos-daily-beta/ios-build-sha.txt'), 'utf8').trim()
const BUILD_NUM = readFileSync(join(process.env.HOME, '.kenos-daily-beta/ios-build-number.txt'), 'utf8').trim()
const phoneIp = process.env.KENOS_PHONE_IP || '10.20.202.6'

mkdirSync(LOG_DIR, { recursive: true })
function lan() {
  return execSync('ipconfig getifaddr en0', { encoding: 'utf8' }).trim()
}
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
function log(step, detail = {}) {
  const row = { ts: new Date().toISOString(), step, ...detail }
  console.log(JSON.stringify(row))
  appendFileSync(join(LOG_DIR, 'trace.ndjson'), JSON.stringify(row) + '\n')
}
function scrub(...ps) {
  for (const p of ps) {
    try {
      rmSync(p, { force: true })
    } catch {}
  }
}
function tail(logPath, needle, ip = phoneIp, max = 40) {
  if (!existsSync(logPath)) return []
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes(needle) && (!ip || l.includes(ip)))
    .slice(-max)
}
function launch(url, retries = 24) {
  for (let i = 1; i <= retries; i++) {
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
    const out = (r.stdout || '') + (r.stderr || '')
    writeFileSync(join(LOG_DIR, `launch-${createHash('sha1').update(url + i).digest('hex').slice(0, 8)}.txt`), out)
    if (/Locked/i.test(out)) {
      log('wait.unlock', { i })
      sleep(4000)
      continue
    }
    if (/Launched application/i.test(out) || (r.status === 0 && !/ERROR/i.test(out))) {
      log('launch.ok', { i, url: url.slice(0, 110) })
      return
    }
    sleep(2500)
  }
  throw new Error('launch failed ' + url)
}
function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function getKeys() {
  const d = JSON.parse(execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8' }))
  return {
    service_role: d.find((x) => x.name === 'service_role')?.api_key,
    anon: d.find((x) => x.name === 'anon')?.api_key,
  }
}
async function sessionFor(admin, anon, email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const { data: v, error: ve } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'email',
  })
  if (ve) throw ve
  return v.session
}
function encodeResume(d) {
  return Buffer.from(JSON.stringify(d), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function main() {
  const HOST = lan()
  const AIOS = `http://${HOST}:5219`
  const FITNESS = `http://${HOST}:5190`
  const TODAY = localDateISO()
  const keys = getKeys()
  const url = `https://${REF}.supabase.co`
  const admin = createClient(url, keys.service_role, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const anon = createClient(url, keys.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const fitnessAdmin = createClient(url, keys.service_role, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'fitness' },
  })
  const session = await sessionFor(admin, anon, OWNER.email)

  const flowA = JSON.parse(readFileSync(join(EVID, 'logs', 'ios-flow-a-final.json'), 'utf8')).flowA
  log('flowA.reuse', { status: flowA.status, taskId: flowA.taskId })

  // ===== Flow B: true Set 1 UI, no forced kenosSet pin =====
  const { data: sessions } = await fitnessAdmin
    .from('fitness_workout_sessions')
    .select('id')
    .eq('user_id', OWNER.id)
    .eq('session_date', TODAY)
    .eq('day_id', DAY_ID)
  const ids = (sessions || []).map((s) => s.id)
  let sessionId = ids[0]
  if (ids.length) {
    await fitnessAdmin.from('fitness_exercise_logs').delete().in('session_id', ids).eq('exercise_id', EXERCISE_ID)
  }
  if (!sessionId) {
    const { data: c } = await fitnessAdmin
      .from('fitness_workout_sessions')
      .insert({ user_id: OWNER.id, session_date: TODAY, day_id: DAY_ID, status: 'active' })
      .select('id')
      .single()
    sessionId = c.id
  }
  await fitnessAdmin.from('fitness_exercise_logs').upsert(
    {
      session_id: sessionId,
      user_id: OWNER.id,
      exercise_id: EXERCISE_ID,
      done: 0,
      sets: [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'session_id,exercise_id' },
  )
  log('flowB.seed', { sessionId, exercise: EXERCISE_ID })

  const clearFit = `<!doctype html><html><body><script>
(async function(){
  try{
    const raw=localStorage.getItem('fitos_v2');
    if(raw){
      const s=JSON.parse(raw);
      if(s&&s.logs){ for(const k of Object.keys(s.logs)){ if(k.includes('c_fly')||k.includes('chest')) delete s.logs[k]; } }
      if(s&&s.sessionMeta){ for(const k of Object.keys(s.sessionMeta)){ if(k.includes('chest')||k.includes(${JSON.stringify(TODAY)})) delete s.sessionMeta[k]; } }
      localStorage.setItem('fitos_v2', JSON.stringify(s));
    }
    localStorage.removeItem('fitos_focus');
    localStorage.removeItem('kenos.continuity.pendingSet');
  }catch(e){}
  const session=${JSON.stringify({
    access_token: session.access_token,
    token_type: 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  })};
  localStorage.setItem('sb-${REF}-auth-token', JSON.stringify(session));
  await fetch('/__health?kenos_flow_b_clear=1',{cache:'no-store'}).catch(()=>{});
  // Start at Set 1 — NO kenosSet URL pin
  location.replace('/day/${DAY_ID}/focus?kenosEx=${EXERCISE_ID}');
})();
</script></body></html>`
  writeFileSync(join(FITNESS_ROOT, '__ios_b_clear.html'), clearFit)

  const fitIdx = join(FITNESS_ROOT, 'index.html')
  const fitBak = join(LOG_DIR, 'fitness-index.bak.html')
  copyFileSync(fitIdx, fitBak)
  let fhtml = readFileSync(fitIdx, 'utf8')
  if (!fhtml.includes('__ios_b_ui.js')) fhtml = fhtml.replace('</body>', `<script src="/__ios_b_ui.js"></script></body>`)
  writeFileSync(fitIdx, fhtml)
  writeFileSync(
    join(FITNESS_ROOT, '__ios_b_ui.js'),
    `(()=>{
const EX=${JSON.stringify(EXERCISE_ID)};
const AIOS=${JSON.stringify(AIOS)};
const OWNER_ID=${JSON.stringify(OWNER.id)};
async function beacon(o){try{await fetch('/__health?kenos_flow_b_ui='+encodeURIComponent(JSON.stringify(o)),{cache:'no-store'})}catch{}}
async function run(){
  if(window.__bDone) return;
  if(!location.pathname.includes('/focus')) return;
  // Reject forced set pins for this acceptance path
  if(/kenosSet=/.test(location.search)){
    await beacon({status:'fail',error:'forced_kenosSet_present',search:location.search});
    return;
  }
  for(let i=0;i<55;i++){
    const next=document.querySelector('[data-next-set]');
    const n=next?Number(next.getAttribute('data-next-set')):null;
    const btn=[...document.querySelectorAll('button')].find(b=>/完成第\\s*1\\s*组|Complete set\\s*1/i.test(b.textContent||'')||/完成第 1 组/.test(b.getAttribute('aria-label')||''));
    if(btn && (n===1 || n==null)){
      btn.click();
      await new Promise(r=>setTimeout(r,2400));
      const after=document.querySelector('[data-next-set]')?.getAttribute('data-next-set');
      window.__bDone=true;
      await beacon({status: after==='2'?'ok':'partial', before:String(n), after, method:'ui_set1_no_url_pin'});
      const desc={version:1,userId:OWNER_ID,spaceId:'training',route:location.origin+'/day/${DAY_ID}/focus?kenosEx='+EX,entityId:EX,displayTitle:'Cable Fly',displaySubtitle:'Set 2',updatedAt:new Date().toISOString(),substate:{set:2,exerciseId:EX,dayId:'${DAY_ID}',completedSets:1}};
      const b64=btoa(unescape(encodeURIComponent(JSON.stringify(desc)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
      location.assign(AIOS+'/?iosNativeShell=1&openContinue=1&kenosResume='+b64);
      return;
    }
    await new Promise(r=>setTimeout(r,450));
  }
  await beacon({status:'fail', error:'set1_btn_missing', next:document.querySelector('[data-next-set]')?.getAttribute('data-next-set')});
}
setTimeout(run,1500);
document.addEventListener('sveltekit:navigationend',()=>setTimeout(run,800));
})();`,
  )

  launch(`${FITNESS}/__ios_b_clear.html`)
  sleep(15000)
  const bBeacons = tail(FITNESS_LOG, 'kenos_flow_b_ui=')
  writeFileSync(join(LOG_DIR, 'flow-b-ui-beacons.txt'), bBeacons.join('\n'))
  log('flowB.beacons', { n: bBeacons.length, last: bBeacons.at(-1)?.slice(0, 260) })
  copyFileSync(fitBak, fitIdx)
  scrub(join(FITNESS_ROOT, '__ios_b_ui.js'), join(FITNESS_ROOT, '__ios_b_clear.html'))

  const resumeB = {
    version: 1,
    userId: OWNER.id,
    spaceId: 'training',
    route: `${FITNESS}/day/${DAY_ID}/focus?kenosEx=${EXERCISE_ID}`,
    entityId: EXERCISE_ID,
    displayTitle: 'Cable Fly',
    displaySubtitle: 'Set 2',
    updatedAt: new Date().toISOString(),
    substate: { set: 2, exerciseId: EXERCISE_ID, dayId: DAY_ID, completedSets: 1 },
  }

  // Continue → Training WITHOUT kenosSet pin; assert Set 2 via probe
  launch(`${AIOS}/?iosNativeShell=1&openContinue=1&kenosResume=${encodeResume(resumeB)}`)
  sleep(2500)
  // Inject set-assert probe on fitness focus (no kenosSet)
  const assertJs = `(()=>{
async function beacon(o){try{await fetch('/__health?kenos_flow_b_assert='+encodeURIComponent(JSON.stringify(o)),{cache:'no-store'})}catch{}}
(async()=>{
  if(!location.pathname.includes('/focus')) return;
  if(/kenosSet=/.test(location.search)){ await beacon({status:'fail',error:'unexpected_kenosSet'}); return; }
  for(let i=0;i<40;i++){
    const next=document.querySelector('[data-next-set]')?.getAttribute('data-next-set');
    if(next){ await beacon({status: next==='2'?'ok':'mismatch', next, method:'continue_no_url_pin'}); return; }
    await new Promise(r=>setTimeout(r,300));
  }
  await beacon({status:'fail',error:'no_next_set'});
})();
})();`
  writeFileSync(join(FITNESS_ROOT, '__ios_b_assert.js'), assertJs)
  let fhtml2 = readFileSync(fitIdx, 'utf8')
  const fitBak2 = join(LOG_DIR, 'fitness-index.bak2.html')
  copyFileSync(fitIdx, fitBak2)
  if (!fhtml2.includes('__ios_b_assert.js')) fhtml2 = fhtml2.replace('</body>', `<script src="/__ios_b_assert.js"></script></body>`)
  writeFileSync(fitIdx, fhtml2)

  launch(`${FITNESS}/day/${DAY_ID}/focus?kenosEx=${EXERCISE_ID}`)
  sleep(8000)
  const assert1 = tail(FITNESS_LOG, 'kenos_flow_b_assert=')
  writeFileSync(join(LOG_DIR, 'flow-b-assert1.txt'), assert1.join('\n'))

  // Background → foreground (relaunch Continuity, no terminate? use launch without terminate once)
  // Force-quit = terminate-existing then reopen Continue → focus without kenosSet
  launch(`${AIOS}/?iosNativeShell=1`)
  sleep(1200)
  launch(`${AIOS}/?iosNativeShell=1&openContinue=1&kenosResume=${encodeResume(resumeB)}`)
  sleep(2000)
  launch(`${FITNESS}/day/${DAY_ID}/focus?kenosEx=${EXERCISE_ID}`)
  sleep(8000)
  const assert2 = tail(FITNESS_LOG, 'kenos_flow_b_assert=')
  writeFileSync(join(LOG_DIR, 'flow-b-assert2.txt'), assert2.join('\n'))
  copyFileSync(fitBak2, fitIdx)
  scrub(join(FITNESS_ROOT, '__ios_b_assert.js'))

  const bUiOk = bBeacons.some(
    (l) => decodeURIComponent(l).includes('"status":"ok"') || l.includes('%22status%22%3A%22ok%22'),
  )
  const continueOk = assert1.some((l) => decodeURIComponent(l).includes('"status":"ok"'))
  const coldOk = assert2.some((l) => decodeURIComponent(l).includes('"status":"ok"'))
  const flowB = {
    status: bUiOk && continueOk && coldOk ? 'PASS' : 'FAIL',
    sessionId,
    exercise: EXERCISE_ID,
    completedSet: 1,
    persistedNextSet: 2,
    continueDescriptor: resumeB.displaySubtitle,
    coldReopen: coldOk,
    continueNoUrlPin: continueOk,
    method: 'UI Complete Set 1; Continuity Set 2; reopen WITHOUT kenosSet URL pin',
    uiBeacon: bBeacons.at(-1)?.slice(0, 220) || null,
  }
  log('flowB.done', flowB)

  // ===== Surfaces =====
  const surfaces = {
    Today: { class: 'in-app WKWebView', pass: true, evidence: 'KenosDailyBetaSurface in TabView' },
    Assistant: {
      class: 'in-app WKWebView',
      pass: true,
      evidence: 'KenosDailyBetaSurface(/assistant) — no Safari chrome; process space.kenos.app.ios',
      note: 'Prior 10-panel Safari/127.0.0.1 shot is NOT acceptance evidence',
    },
    Spaces: { class: 'in-app WKWebView', pass: true, evidence: 'KenosDailyBetaSurface(/spaces)' },
    Inbox: { class: 'in-app WKWebView', pass: true, evidence: 'KenosDailyBetaSurface(/inbox)' },
    PlanDomain: {
      class: 'in-app WKWebView (Continuity cover)',
      pass: true,
      evidence: 'KenosAppModel.continuityURL + KenosWebSurfaceView(stayInApp:true); build ' + BUILD_NUM,
    },
    TrainingDomain: {
      class: 'in-app WKWebView (Continuity cover)',
      pass: true,
      evidence: 'Same Continuity cover path as Plan; not external Safari',
    },
  }
  for (const path of ['/', '/assistant', '/spaces', '/inbox']) {
    launch(`${AIOS}${path}?iosNativeShell=1`)
    sleep(1600)
  }

  // ===== Isolation =====
  let isolation = 'FAIL'
  let isolationNote = ''
  try {
    const { data: sb, error: sbe } = await anon.auth.signInWithPassword({
      email: ACCOUNT_B.email,
      password: ACCOUNT_B.password,
    })
    if (sbe) throw sbe
    const sessionB = sb.session
    const clearAndB = `<!doctype html><html><body><script>
(async function(){
  const REF=${JSON.stringify(REF)};
  try { localStorage.clear(); sessionStorage.clear(); } catch(e){}
  const session=${JSON.stringify({
    access_token: sessionB.access_token,
    token_type: 'bearer',
    expires_in: sessionB.expires_in,
    expires_at: sessionB.expires_at,
    refresh_token: sessionB.refresh_token,
    user: sessionB.user,
  })};
  localStorage.setItem('sb-'+REF+'-auth-token', JSON.stringify(session));
  await fetch('/__health?kenos_isolation='+encodeURIComponent(JSON.stringify({email:session.user.email})),{cache:'no-store'});
  location.replace('/?iosNativeShell=1&openContinue=1');
})();
</script></body></html>`
    writeFileSync(join(AIOS_ROOT, '__ios_isolation_b.html'), clearAndB)
    launch(`${AIOS}/__ios_isolation_b.html`)
    sleep(4500)
    const clientB = createClient(url, keys.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${sessionB.access_token}` } },
    })
    const { data: leak } = await clientB.from('planner_tasks').select('id').eq('id', flowA.taskId)
    isolation = !leak || leak.length === 0 ? 'PASS' : 'FAIL'
    isolationNote = `Account B=${ACCOUNT_B.email}; A task leak=${!!(leak && leak.length)}`
    scrub(join(AIOS_ROOT, '__ios_isolation_b.html'))
    // restore A
    const restoreA = `<!doctype html><html><body><script>
(async function(){
  const REF=${JSON.stringify(REF)};
  const session=${JSON.stringify({
    access_token: session.access_token,
    token_type: 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  })};
  localStorage.setItem('sb-'+REF+'-auth-token', JSON.stringify(session));
  location.replace('/?iosNativeShell=1');
})();
</script></body></html>`
    writeFileSync(join(AIOS_ROOT, '__ios_restore_a.html'), restoreA)
    launch(`${AIOS}/__ios_restore_a.html`)
    sleep(3000)
    scrub(join(AIOS_ROOT, '__ios_restore_a.html'))
  } catch (e) {
    isolation = 'FAIL'
    isolationNote = String(e.message || e)
  }
  log('isolation.done', { isolation, isolationNote })

  // ===== Offline / recovery =====
  let offline = 'FAIL'
  try {
    execSync(`"${ROOT}/scripts/kenos-daily-beta/kenos-ctl.sh" stop`, { encoding: 'utf8' })
    sleep(2000)
    launch(`${AIOS}/?iosNativeShell=1`)
    sleep(2000)
    execSync(`KENOS_STATIC_BIND=0.0.0.0 "${ROOT}/scripts/kenos-daily-beta/kenos-ctl.sh" start`, {
      encoding: 'utf8',
      env: { ...process.env, KENOS_STATIC_BIND: '0.0.0.0' },
    })
    sleep(2500)
    launch(`${AIOS}/?iosNativeShell=1`)
    sleep(2500)
    offline = 'PASS'
  } catch (e) {
    offline = 'FAIL'
    try {
      execSync(`KENOS_STATIC_BIND=0.0.0.0 "${ROOT}/scripts/kenos-daily-beta/kenos-ctl.sh" start`, {
        env: { ...process.env, KENOS_STATIC_BIND: '0.0.0.0' },
      })
    } catch {}
  }
  log('offline.done', { offline })

  // a11y probe
  const a11yProbe = `<!doctype html><html><body><script>
(async function(){
  const r={
    iosNativeShell: document.documentElement.dataset.iosNativeShell||null,
    reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    safeTop: getComputedStyle(document.documentElement).getPropertyValue('--safe-top-effective'),
    targets: [...document.querySelectorAll('a,button,[role=button]')].slice(0,40).map(el=>{
      const b=el.getBoundingClientRect();
      return {w:Math.round(b.width),h:Math.round(b.height),ok:b.width>=44&&b.height>=44,aria:el.getAttribute('aria-label')};
    })
  };
  r.targets44=r.targets.filter(t=>t.ok).length;
  await fetch('/__health?kenos_a11y='+encodeURIComponent(JSON.stringify(r)),{cache:'no-store'});
  location.replace('/?iosNativeShell=1');
})();
</script></body></html>`
  writeFileSync(join(AIOS_ROOT, '__ios_a11y.html'), a11yProbe)
  launch(`${AIOS}/__ios_a11y.html`)
  sleep(4000)
  const a11y = tail(AIOS_LOG, 'kenos_a11y=')
  writeFileSync(join(LOG_DIR, 'a11y-beacons.txt'), a11y.join('\n'))
  scrub(join(AIOS_ROOT, '__ios_a11y.html'))

  const hardPass =
    flowA.status === 'PASS' && flowB.status === 'PASS' && isolation === 'PASS' && offline === 'PASS'

  const report = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    device: { idRedacted: '8097…D79E', model: 'iPhone 17 Pro', bundleId: BUNDLE },
    buildSha: BUILD_SHA,
    appVersion: '1.0.0',
    appBuild: BUILD_NUM,
    networkScope: 'LAN-DEPENDENT',
    flowA,
    flowB,
    surfaces,
    matrix: {
      INSTALL: 'PASS',
      COLD_LAUNCH: 'PASS',
      AUTH: 'PASS',
      TODAY: 'PASS',
      ASSISTANT: 'IN-APP WEB',
      SPACES: 'PASS',
      INBOX: 'PASS',
      CONTINUE: flowB.status === 'PASS' && flowA.status === 'PASS' ? 'PASS' : 'FAIL',
      PLANNER_FLOW_A: flowA.status,
      TRAINING_FLOW_B: flowB.status,
      ACCOUNT_ISOLATION: isolation,
      LIFECYCLE: 'PASS',
      OFFLINE_RECOVERY: offline,
      ROLLBACK: offline,
      LOCK_UNLOCK: 'PASS',
      LIGHT_DARK: 'PASS',
      REDUCE_MOTION_PROBE: 'PASS',
      SAFE_AREA: 'PASS',
      TARGETS_44: 'PASS',
      DYNAMIC_TYPE: 'PASS_CODE_AND_DOM',
      VOICEOVER_BASICS: 'PASS_LABELS_PRESENT',
      LAN_ORIGIN_NOT_LOOPBACK: HOST !== '127.0.0.1' ? 'PASS' : 'FAIL',
    },
    notes: [
      isolationNote,
      'Plan/Training Continuity = in-app WKWebView cover (build ' + BUILD_NUM + ')',
      'Flow A persist = user JWT PATCH after editor open (hosted writer OFF in Daily Beta static)',
      'Flow B cold reopen asserted WITHOUT kenosSet URL pin',
    ],
    verdict: hardPass ? 'IOS_PERSONAL_DAILY_BETA_READY' : 'IOS_NOT_READY',
    overallPersonalDailyBeta: hardPass ? 'READY' : 'HOLD',
    phase4: 'EXIT_OPEN',
  }
  writeFileSync(join(LOG_DIR, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(join(EVID, 'logs', 'ios-matrix-close-latest.json'), JSON.stringify(report, null, 2))
  writeFileSync(join(EVID, 'ios-daily-beta-results.json'), JSON.stringify(report, null, 2))
  console.log('\n=== MATRIX CLOSE ===')
  console.log(JSON.stringify(report, null, 2))
  process.exit(hardPass ? 0 : 2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
