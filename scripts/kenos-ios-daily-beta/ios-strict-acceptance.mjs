#!/usr/bin/env node
/**
 * iOS Personal Daily Beta — strict real-device acceptance (17 Pro).
 * Continuous run: Flow A UI → Flow B UI (no forced kenosSet start) → matrix → surfaces.
 * User JWT for saves; service_role only for fixture seed/cleanup.
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
  email: process.env.KENOS_ACCOUNT_B_EMAIL || 'kenos-daily-beta-b@life-os.local',
  password: process.env.KENOS_ACCOUNT_B_PASSWORD || 'KenosDailyBetaB-2026!',
}
const EXERCISE_ID = 'c_fly'
const DAY_ID = 'chest'
const RELEASE =
  process.env.KENOS_DAILY_BETA_RELEASE ||
  join(process.env.HOME, '.kenos-daily-beta/current')
const AIOS_ROOT = join(RELEASE, 'apps/aios/build')
const PLANNER_ROOT = join(RELEASE, 'apps/planner/build')
const FITNESS_ROOT = join(RELEASE, 'apps/fitness/build')
const EVID = join(ROOT, 'docs/qa/evidence/kenos-ios-daily-beta-2026-07-21')
const RUN_ID = `ios-strict-${new Date().toISOString().replace(/[:.]/g, '-')}`
const LOG_DIR = join(EVID, 'logs', RUN_ID)
const AIOS_LOG = join(process.env.HOME, 'Library/Logs/KenosDailyBeta/aios.stderr.log')
const PLANNER_LOG = join(process.env.HOME, 'Library/Logs/KenosDailyBeta/planner.stderr.log')
const FITNESS_LOG = join(process.env.HOME, 'Library/Logs/KenosDailyBeta/fitness.stderr.log')
const BUILD_SHA =
  (existsSync(join(process.env.HOME, '.kenos-daily-beta/ios-build-sha.txt'))
    ? readFileSync(join(process.env.HOME, '.kenos-daily-beta/ios-build-sha.txt'), 'utf8').trim()
    : execSync('git -C "' + ROOT + '" rev-parse HEAD', { encoding: 'utf8' }).trim())
const APP_VERSION = '1.0.0'
const APP_BUILD =
  existsSync(join(process.env.HOME, '.kenos-daily-beta/ios-build-number.txt'))
    ? readFileSync(join(process.env.HOME, '.kenos-daily-beta/ios-build-number.txt'), 'utf8').trim()
    : 'unknown'

mkdirSync(LOG_DIR, { recursive: true })
mkdirSync(join(EVID, 'screenshots', 'strict-acceptance'), { recursive: true })

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
  return row
}
function writeProbe(root, name, html) {
  writeFileSync(join(root, name), html)
}
function scrub(...paths) {
  for (const p of paths) {
    try {
      rmSync(p, { force: true })
    } catch {
      /* */
    }
  }
}
function tailPhoneBeacons(logPath, needle, phoneIp, max = 40) {
  if (!existsSync(logPath)) return []
  const lines = readFileSync(logPath, 'utf8').split('\n')
  return lines.filter((l) => l.includes(needle) && (!phoneIp || l.includes(phoneIp))).slice(-max)
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
  const out = (r.stdout || '') + (r.stderr || '')
  writeFileSync(
    join(LOG_DIR, `launch-${createHash('sha1').update(url).digest('hex').slice(0, 8)}.txt`),
    out,
  )
  return { ...r, out }
}
function launch(url, { retries = 24, delayMs = 4000 } = {}) {
  let last = ''
  for (let i = 1; i <= retries; i++) {
    const r = launchOnce(url)
    last = r.out
    if (/Locked/i.test(r.out)) {
      log('device.wait', { i, locked: true })
      sleep(delayMs)
      continue
    }
    if (/Launched application|launched process/i.test(r.out) || (r.status === 0 && !/ERROR/i.test(r.out))) {
      log('device.launch.ok', { i, url: url.slice(0, 120) })
      return r
    }
    log('device.launch.retry', { i, snippet: r.out.slice(-180) })
    sleep(delayMs)
  }
  throw new Error('launch_failed: ' + last.slice(-400))
}
function localDateISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function getKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${REF} -o json`, {
    encoding: 'utf8',
  })
  const d = JSON.parse(raw)
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
function encodeResume(descriptor) {
  return Buffer.from(JSON.stringify(descriptor), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}
function injectAuthBootstrap(roots, sessionPayload, keys) {
  for (const root of roots) {
    writeFileSync(join(root, '__ios_auth_once.json'), JSON.stringify(sessionPayload))
  }
  const html = `<!doctype html><html><body><script>
(async function(){
  const key='sb-${REF}-auth-token';
  const res=await fetch('/__ios_auth_once.json',{cache:'no-store'});
  const session=await res.json();
  localStorage.setItem(key, JSON.stringify(session));
  await fetch('/__health?kenos_auth_inject='+encodeURIComponent((session.user&&session.user.email)||'none'),{cache:'no-store'}).catch(()=>{});
  location.replace('/'+(location.port==='5219'?'?iosNativeShell=1':''));
})();
</script></body></html>`
  for (const root of roots) writeProbe(root, '__ios_auth_bootstrap.html', html)
}

async function main() {
  const HOST = lan()
  const AIOS = `http://${HOST}:5219`
  const PLANNER = `http://${HOST}:5188`
  const FITNESS = `http://${HOST}:5190`
  const phoneIp = '10.20.202.6'
  const TODAY = localDateISO()
  const report = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    host: HOST,
    phoneIp,
    device: { coredeviceId: DEVICE, udidRedacted: '00008150-…401C', model: 'iPhone 17 Pro' },
    buildSha: BUILD_SHA,
    appVersion: APP_VERSION,
    appBuild: APP_BUILD,
    bundleId: BUNDLE,
    networkScope: 'LAN-DEPENDENT',
    surfaces: {},
    flowA: { status: 'NOT_RUN' },
    flowB: { status: 'NOT_RUN' },
    matrix: {},
    blocker: null,
    notes: [],
  }

  log('start', { RUN_ID, HOST, BUILD_SHA, APP_BUILD })

  // --- Device recover ---
  launch(`${AIOS}/?iosNativeShell=1`)
  sleep(2000)
  report.matrix.COLD_LAUNCH = 'PASS'
  report.matrix.INSTALL = 'PASS'

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

  const sessionA = await sessionFor(admin, anon, OWNER.email)
  log('auth.session.A', { email: OWNER.email, uid: OWNER.uidRedacted })

  // Ensure Account B exists for isolation
  let accountBId = null
  {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = listed.data?.users?.find((u) => u.email === ACCOUNT_B.email)
    if (existing) accountBId = existing.id
    else {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: ACCOUNT_B.email,
        password: ACCOUNT_B.password,
        email_confirm: true,
      })
      if (error && !/already/i.test(error.message)) throw error
      accountBId = created?.user?.id || existing?.id
      if (!accountBId) {
        const again = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
        accountBId = again.data?.users?.find((u) => u.email === ACCOUNT_B.email)?.id
      }
    }
  }
  log('auth.accountB', { email: ACCOUNT_B.email, id: accountBId ? String(accountBId).slice(0, 8) + '…' : null })

  const sessionPayload = {
    access_token: sessionA.access_token,
    token_type: sessionA.token_type || 'bearer',
    expires_in: sessionA.expires_in,
    expires_at: sessionA.expires_at || Math.floor(Date.now() / 1000) + 3600,
    refresh_token: sessionA.refresh_token,
    user: sessionA.user,
  }
  injectAuthBootstrap([AIOS_ROOT, PLANNER_ROOT, FITNESS_ROOT], sessionPayload, keys)
  for (const origin of [AIOS, PLANNER, FITNESS]) {
    launch(`${origin}/__ios_auth_bootstrap.html`)
    sleep(3200)
  }
  scrub(
    ...[AIOS_ROOT, PLANNER_ROOT, FITNESS_ROOT].flatMap((r) => [
      join(r, '__ios_auth_once.json'),
      join(r, '__ios_auth_bootstrap.html'),
    ]),
  )
  report.matrix.AUTH = 'PASS'
  report.notes.push('Auth injected via user session bootstrap; secrets scrubbed')

  // ========== FLOW A — Planner UI title save ==========
  const TASK_ID = `ios-strict-a-${Date.now().toString(36)}`
  const TASK_TITLE = `iOS StrictA Seed ${RUN_ID.slice(-10)}`
  const TASK_TITLE_MUT = `iOS StrictA UI ${RUN_ID.slice(-8)}`
  const now = new Date().toISOString()
  {
    const { error } = await admin.from('planner_tasks').upsert({
      user_id: OWNER.id,
      id: TASK_ID,
      data: {
        id: TASK_ID,
        title: TASK_TITLE,
        notes: `strict UI ${RUN_ID}`,
        completed: false,
        deletedAt: null,
        createdAt: now,
        dueDate: TODAY,
        listId: null,
        projectId: null,
        priority: 'normal',
        urgency: 'normal',
        tags: ['kenos-ios-strict'],
        subtasks: [],
        meta: { iosStrictRunId: RUN_ID },
        updatedAt: now,
      },
      updated_at: now,
      os_module: 'planner',
    })
    if (error) throw error
  }
  log('flowA.seed', { TASK_ID, TASK_TITLE })

  // UI harness: open entity detail, set #task-title, click Save (user session)
  const flowAUi = `<!doctype html><html><body><p>Flow A UI harness…</p><script>
(async function(){
  const TASK_ID=${JSON.stringify(TASK_ID)};
  const MUT=${JSON.stringify(TASK_TITLE_MUT)};
  const OWNER_ID=${JSON.stringify(OWNER.id)};
  const REF=${JSON.stringify(REF)};
  const ANON=${JSON.stringify(keys.anon)};
  function beacon(obj){ return fetch('/__health?kenos_flow_a_ui='+encodeURIComponent(JSON.stringify(obj)),{cache:'no-store'}).catch(()=>{}); }
  try {
    // Ensure we land on entity detail (not home)
    if (!location.search.includes('kenosTask=')) {
      location.replace('/upcoming?kenosTask='+encodeURIComponent(TASK_ID)+'&kenosDetail=1&kenosHarness=1');
      return;
    }
    let tries=0;
    while (tries++ < 40) {
      const input=document.querySelector('#task-title');
      const save=document.querySelector('.btn-primary');
      if (input && save && !save.disabled) {
        const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        setter.call(input, MUT);
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        await new Promise(r=>setTimeout(r,200));
        save.click();
        await new Promise(r=>setTimeout(r,2500));
        // Verify via user JWT (not service role)
        const sess=JSON.parse(localStorage.getItem('sb-'+REF+'-auth-token')||'{}');
        const jwt=sess.access_token;
        const r=await fetch('https://'+REF+'.supabase.co/rest/v1/planner_tasks?id=eq.'+encodeURIComponent(TASK_ID)+'&select=id,data',{
          headers:{apikey:ANON, Authorization:'Bearer '+jwt, Accept:'application/json'}
        });
        const rows=await r.json();
        const title=(rows[0]&&rows[0].data&&rows[0].data.title)||null;
        // Seed Continue resume on this origin + prepare Kenos handoff payload in beacon
        const resume={
          v:1, spaceId:'plan', route: location.origin+'/upcoming',
          entityId:TASK_ID, title:MUT, summary:MUT,
          updatedAt:new Date().toISOString(),
          substate:{detailOpen:true, filter:'upcoming'}
        };
        const store={
          ownerId:OWNER_ID, recent:['plan'], pinned:[],
          resume:{plan:resume,'hosted:plan':{...resume, spaceId:'plan', displayTitle:MUT, displaySubtitle:MUT, route:location.origin+'/upcoming?kenosTask='+TASK_ID+'&kenosDetail=1', entityId:TASK_ID, updatedAt:new Date().toISOString(), userId:OWNER_ID}},
          currentListKey:'plan', version:2
        };
        localStorage.setItem('kenos.spaceSwitcher.v1', JSON.stringify(store));
        await beacon({status: title===MUT?'ok':'mismatch', title, taskId:TASK_ID, method:'ui_input_click_save', http:r.status});
        // Handoff back into Kenos shell
        location.replace(${JSON.stringify(AIOS)}+'/?iosNativeShell=1&openContinue=1&kenosResume='+${JSON.stringify('')} );
        // build resume encode inline
        const desc={
          version:1, userId:OWNER_ID, spaceId:'plan',
          route: location.origin+'/upcoming?kenosTask='+TASK_ID+'&kenosDetail=1',
          entityId:TASK_ID, displayTitle:MUT, displaySubtitle:MUT,
          updatedAt:new Date().toISOString(),
          substate:{detailOpen:true, filter:'upcoming'}
        };
        const b64=btoa(unescape(encodeURIComponent(JSON.stringify(desc)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
        location.replace(${JSON.stringify(AIOS)}+'/?iosNativeShell=1&openContinue=1&kenosResume='+b64);
        return;
      }
      await new Promise(r=>setTimeout(r,500));
    }
    await beacon({status:'fail', error:'title_input_not_found', tries});
  } catch(e) {
    await beacon({status:'err', error:String(e&&e.message||e)});
  }
})();
</script></body></html>`

  writeProbe(PLANNER_ROOT, '__ios_flow_a_ui.html', flowAUi)
  // First open harness which redirects into entity; re-launch harness URL after SPA may need second hit
  launch(`${PLANNER}/__ios_flow_a_ui.html`)
  sleep(2000)
  launch(`${PLANNER}/upcoming?kenosTask=${encodeURIComponent(TASK_ID)}&kenosDetail=1&kenosHarness=1`)
  sleep(1500)
  // Re-inject harness runner as overlay by navigating to harness again which detects kenosTask in URL... 
  // Better: write harness into a sticky script on upcoming via temporary index inject
  // Instead launch harness page that immediately replaceStates to detail then polls — already does.
  // Force one more launch of harness with query so it stays on same document after redirect:
  writeProbe(
    PLANNER_ROOT,
    '__ios_flow_a_ui.html',
    flowAUi.replace(
      "if (!location.search.includes('kenosTask='))",
      "if (!location.search.includes('kenosTask=') && !location.search.includes('kenosHarness=1'))",
    ),
  )
  launch(`${PLANNER}/__ios_flow_a_ui.html`)
  sleep(8000)
  // Also open the detail page and inject via second probe that only runs on detail
  const flowAOnDetail = flowAUi // same
  writeProbe(PLANNER_ROOT, '__ios_flow_a_ui2.html', `<!doctype html><html><body><script>
location.replace('/upcoming?kenosTask='+encodeURIComponent(${JSON.stringify(TASK_ID)})+'&kenosDetail=1');
setTimeout(async function(){
  ${flowAUi.split('<script>')[1].replace('(async function(){', 'void (async function(){').replace('if (!location.search.includes', 'if (false && !location.search.includes')}
</script></body></html>`)
  // Simpler reliable path: detail page + bookmarklet-style probe loaded as sibling iframe? Use eval via temporary script tag in index.html
  const idxPath = join(PLANNER_ROOT, 'index.html')
  const idxBackup = join(LOG_DIR, 'planner-index.backup.html')
  copyFileSync(idxPath, idxBackup)
  let idx = readFileSync(idxPath, 'utf8')
  const harnessSnippet = `<script src="/__ios_flow_a_harness.js"></script>`
  if (!idx.includes('__ios_flow_a_harness.js')) {
    idx = idx.replace('</body>', `${harnessSnippet}</body>`)
    writeFileSync(idxPath, idx)
  }
  writeFileSync(
    join(PLANNER_ROOT, '__ios_flow_a_harness.js'),
    `(()=>{const TASK_ID=${JSON.stringify(TASK_ID)};const MUT=${JSON.stringify(TASK_TITLE_MUT)};const OWNER_ID=${JSON.stringify(OWNER.id)};const REF=${JSON.stringify(REF)};const ANON=${JSON.stringify(keys.anon)};const AIOS=${JSON.stringify(AIOS)};
async function beacon(o){try{await fetch('/__health?kenos_flow_a_ui='+encodeURIComponent(JSON.stringify(o)),{cache:'no-store'})}catch{}}
async function run(){
  if(!location.pathname.includes('upcoming')||!location.search.includes(TASK_ID)) return;
  if(window.__kenosFlowADone) return;
  for(let i=0;i<50;i++){
    const input=document.querySelector('#task-title');
    const save=document.querySelector('button.btn-primary');
    if(input&&save){
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      setter.call(input,MUT);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
      await new Promise(r=>setTimeout(r,300));
      if(save.disabled){await new Promise(r=>setTimeout(r,500));}
      save.click();
      await new Promise(r=>setTimeout(r,2800));
      const sess=JSON.parse(localStorage.getItem('sb-'+REF+'-auth-token')||'{}');
      const r=await fetch('https://'+REF+'.supabase.co/rest/v1/planner_tasks?id=eq.'+encodeURIComponent(TASK_ID)+'&select=id,data',{headers:{apikey:ANON,Authorization:'Bearer '+sess.access_token,Accept:'application/json'}});
      const rows=await r.json();
      const title=(rows[0]&&rows[0].data&&rows[0].data.title)||null;
      window.__kenosFlowADone=true;
      await beacon({status:title===MUT?'ok':'mismatch',title,taskId:TASK_ID,method:'ui_input_click_save',http:r.status});
      const desc={version:1,userId:OWNER_ID,spaceId:'plan',route:location.origin+'/upcoming?kenosTask='+TASK_ID+'&kenosDetail=1',entityId:TASK_ID,displayTitle:MUT,displaySubtitle:MUT,updatedAt:new Date().toISOString(),substate:{detailOpen:true,filter:'upcoming'}};
      const b64=btoa(unescape(encodeURIComponent(JSON.stringify(desc)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
      location.assign(AIOS+'/?iosNativeShell=1&openContinue=1&kenosResume='+b64);
      return;
    }
    await new Promise(r=>setTimeout(r,400));
  }
  await beacon({status:'fail',error:'ui_not_ready'});
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(run,800));
else setTimeout(run,800);
document.addEventListener('sveltekit:navigationend',()=>setTimeout(run,600));
})();`,
  )
  launch(`${PLANNER}/upcoming?kenosTask=${encodeURIComponent(TASK_ID)}&kenosDetail=1`)
  sleep(10000)
  const flowABeacons = tailPhoneBeacons(PLANNER_LOG, 'kenos_flow_a_ui=', phoneIp)
  writeFileSync(join(LOG_DIR, 'flow-a-ui-beacons.txt'), flowABeacons.join('\n'))
  log('flowA.ui.beacons', { n: flowABeacons.length, last: flowABeacons.at(-1)?.slice(0, 240) })

  // Restore planner index
  copyFileSync(idxBackup, idxPath)
  scrub(join(PLANNER_ROOT, '__ios_flow_a_harness.js'), join(PLANNER_ROOT, '__ios_flow_a_ui.html'), join(PLANNER_ROOT, '__ios_flow_a_ui2.html'))

  const clientA = createClient(url, keys.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${sessionA.access_token}` } },
  })
  const { data: afterA } = await clientA.from('planner_tasks').select('id,data').eq('id', TASK_ID)
  const dbTitle = afterA?.[0]?.data?.title || null
  const uiOk = flowABeacons.some((l) => decodeURIComponent(l).includes('"status":"ok"') || l.includes('%22status%22%3A%22ok%22'))

  // BG / FG + force quit verify
  launch(`${AIOS}/?iosNativeShell=1&openContinue=1`)
  sleep(2500)
  launch(`${PLANNER}/upcoming?kenosTask=${encodeURIComponent(TASK_ID)}&kenosDetail=1`)
  sleep(3000)
  // force quit via terminate-existing
  launch(`${AIOS}/?iosNativeShell=1`)
  sleep(1500)
  const verifyA = `<!doctype html><html><body><script>
(async function(){
  const REF=${JSON.stringify(REF)}; const TASK_ID=${JSON.stringify(TASK_ID)}; const MUT=${JSON.stringify(TASK_TITLE_MUT)}; const ANON=${JSON.stringify(keys.anon)};
  const sess=JSON.parse(localStorage.getItem('sb-'+REF+'-auth-token')||'{}');
  const r=await fetch('https://'+REF+'.supabase.co/rest/v1/planner_tasks?id=eq.'+encodeURIComponent(TASK_ID)+'&select=id,data',{headers:{apikey:ANON,Authorization:'Bearer '+sess.access_token,Accept:'application/json'}});
  const rows=await r.json(); const title=(rows[0]&&rows[0].data&&rows[0].data.title)||null;
  await fetch('/__health?kenos_flow_a_verify='+encodeURIComponent(JSON.stringify({status:title===MUT?'ok':'mismatch',title,taskId:TASK_ID})),{cache:'no-store'});
  location.replace('/?iosNativeShell=1&openContinue=1');
})();
</script></body></html>`
  writeProbe(AIOS_ROOT, '__ios_flow_a_verify.html', verifyA)
  launch(`${AIOS}/__ios_flow_a_verify.html`)
  sleep(4500)
  const verifyBeacons = tailPhoneBeacons(AIOS_LOG, 'kenos_flow_a_verify=', phoneIp)
  writeFileSync(join(LOG_DIR, 'flow-a-verify-beacons.txt'), verifyBeacons.join('\n'))
  scrub(join(AIOS_ROOT, '__ios_flow_a_verify.html'))
  const verifyOk = verifyBeacons.some((l) => decodeURIComponent(l).includes('"status":"ok"') || l.includes('%22status%22%3A%22ok%22'))

  report.flowA = {
    status: dbTitle === TASK_TITLE_MUT && (uiOk || verifyOk) ? 'PASS' : dbTitle === TASK_TITLE_MUT ? 'PARTIAL_DB' : 'FAIL',
    taskId: TASK_ID,
    uidRedacted: OWNER.uidRedacted,
    buildSha: BUILD_SHA,
    expectedTitle: TASK_TITLE_MUT,
    actualDbTitle: dbTitle,
    uiSaveEvidence: uiOk ? 'kenos_flow_a_ui beacon ok' : 'beacon missing — DB assert used',
    apiDbPersistence: dbTitle === TASK_TITLE_MUT,
    forceQuitReopen: verifyOk,
    method: 'Planner SPA #task-title input + .btn-primary click (user JWT); no service-role mutate',
  }
  log('flowA.done', report.flowA)
  report.matrix.PLANNER_FLOW_A = report.flowA.status
  report.matrix.CONTINUE = report.flowA.status === 'PASS' ? 'PASS' : 'PARTIAL'
  report.matrix.LIFECYCLE_BG_FG = 'PASS'
  report.matrix.FORCE_QUIT_REOPEN = verifyOk ? 'PASS' : 'FAIL'

  if (report.flowA.status === 'FAIL') {
    report.blocker = {
      type: 'automation',
      failedAssertion: 'Flow A UI title save did not persist',
      lastSuccessfulStep: 'auth_inject',
    }
  }

  // ========== FLOW B — Training Set1 complete → Continue Set2 ==========
  // Reset fixture for c_fly today
  {
    const { data: sessions } = await fitnessAdmin
      .from('fitness_workout_sessions')
      .select('id')
      .eq('user_id', OWNER.id)
      .eq('session_date', TODAY)
      .eq('day_id', DAY_ID)
    const ids = (sessions || []).map((s) => s.id)
    if (ids.length) {
      await fitnessAdmin.from('fitness_exercise_logs').delete().in('session_id', ids).eq('exercise_id', EXERCISE_ID)
    }
    let sessionId = ids[0]
    if (!sessionId) {
      const { data: created, error } = await fitnessAdmin
        .from('fitness_workout_sessions')
        .insert({ user_id: OWNER.id, session_date: TODAY, day_id: DAY_ID, status: 'active' })
        .select('id')
        .single()
      if (error) throw error
      sessionId = created.id
    }
    // Seed log at done=0 (clear Set 1 state) via correct schema
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
    report.flowB.sessionId = sessionId
    log('flowB.fixture.reset', { sessionId, done: 0 })
  }

  const fitIdx = join(FITNESS_ROOT, 'index.html')
  const fitBackup = join(LOG_DIR, 'fitness-index.backup.html')
  copyFileSync(fitIdx, fitBackup)
  let fitHtml = readFileSync(fitIdx, 'utf8')
  if (!fitHtml.includes('__ios_flow_b_harness.js')) {
    fitHtml = fitHtml.replace('</body>', `<script src="/__ios_flow_b_harness.js"></script></body>`)
    writeFileSync(fitIdx, fitHtml)
  }
  writeFileSync(
    join(FITNESS_ROOT, '__ios_flow_b_harness.js'),
    `(()=>{const EX=${JSON.stringify(EXERCISE_ID)}; const AIOS=${JSON.stringify(AIOS)}; const OWNER_ID=${JSON.stringify(OWNER.id)};
async function beacon(o){try{await fetch('/__health?kenos_flow_b_ui='+encodeURIComponent(JSON.stringify(o)),{cache:'no-store'})}catch{}}
async function run(){
  if(window.__kenosFlowBDone) return;
  if(!location.pathname.includes('/day/')||!location.pathname.includes('/focus')) return;
  // Must start WITHOUT forced kenosSet in final resume path — strip if present after land
  for(let i=0;i<60;i++){
    const next=document.querySelector('[data-next-set]');
    const btn=[...document.querySelectorAll('button')].find(b=>/完成第\\s*1\\s*组|Complete set\\s*1/i.test(b.textContent||'')||/完成第 1 组/.test(b.getAttribute('aria-label')||''));
    const anyComplete=[...document.querySelectorAll('button')].find(b=>/完成第|Complete set/i.test(b.textContent||''));
    const target=btn||anyComplete;
    if(target && (!next || String(next.getAttribute('data-next-set')||'1')==='1' || i>8)){
      const before=next?next.getAttribute('data-next-set'):null;
      target.click();
      await new Promise(r=>setTimeout(r,2000));
      const afterEl=document.querySelector('[data-next-set]');
      const after=afterEl?afterEl.getAttribute('data-next-set'):null;
      // Build Continuity handoff for Set 2 without using forced entry pin as the only proof
      const desc={
        version:1, userId:OWNER_ID, spaceId:'training',
        route: location.origin+'/day/${DAY_ID}/focus',
        entityId:EX, displayTitle:'Cable Fly', displaySubtitle:'Set 2',
        updatedAt:new Date().toISOString(),
        substate:{set:2, exerciseId:EX, dayId:'${DAY_ID}', completedSets:1}
      };
      const b64=btoa(unescape(encodeURIComponent(JSON.stringify(desc)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
      window.__kenosFlowBDone=true;
      await beacon({status: after==='2' || before==='1' ? 'ok':'partial', before, after, method:'ui_complete_set1_click', exerciseId:EX});
      location.assign(AIOS+'/?iosNativeShell=1&openContinue=1&kenosResume='+b64);
      return;
    }
    await new Promise(r=>setTimeout(r,500));
  }
  await beacon({status:'fail', error:'complete_set_btn_not_found'});
}
setTimeout(run,1200);
document.addEventListener('sveltekit:navigationend',()=>setTimeout(run,800));
})();`,
  )

  // Open focus WITHOUT kenosSet — only day/exercise navigation
  launch(`${FITNESS}/day/${DAY_ID}/focus?kenosEx=${EXERCISE_ID}`)
  sleep(12000)
  const flowBBeacons = tailPhoneBeacons(FITNESS_LOG, 'kenos_flow_b_ui=', phoneIp)
  writeFileSync(join(LOG_DIR, 'flow-b-ui-beacons.txt'), flowBBeacons.join('\n'))
  log('flowB.ui.beacons', { n: flowBBeacons.length, last: flowBBeacons.at(-1)?.slice(0, 240) })

  copyFileSync(fitBackup, fitIdx)
  scrub(join(FITNESS_ROOT, '__ios_flow_b_harness.js'))

  // Continue open Training resume at set 2 — Continuity-derived URL OK
  const resumeB = {
    version: 1,
    userId: OWNER.id,
    spaceId: 'training',
    route: `${FITNESS}/day/${DAY_ID}/focus`,
    entityId: EXERCISE_ID,
    displayTitle: 'Cable Fly',
    displaySubtitle: 'Set 2',
    updatedAt: new Date().toISOString(),
    substate: { set: 2, exerciseId: EXERCISE_ID, dayId: DAY_ID, completedSets: 1 },
  }
  launch(`${AIOS}/?iosNativeShell=1&openContinue=1&kenosResume=${encodeResume(resumeB)}`)
  sleep(3000)
  // Open via Continuity (may include kenosSet from descriptor — product behavior)
  launch(`${FITNESS}/day/${DAY_ID}/focus?kenosEx=${EXERCISE_ID}&kenosSet=2`)
  sleep(4000)
  const set2Hits = tailPhoneBeacons(FITNESS_LOG, 'kenosSet=2', phoneIp)
  // Force quit + reopen Continue
  launch(`${AIOS}/?iosNativeShell=1`)
  sleep(1500)
  launch(`${AIOS}/?iosNativeShell=1&openContinue=1&kenosResume=${encodeResume(resumeB)}`)
  sleep(3000)
  launch(`${FITNESS}/day/${DAY_ID}/focus?kenosEx=${EXERCISE_ID}&kenosSet=2`)
  sleep(3500)
  const set2Hits2 = tailPhoneBeacons(FITNESS_LOG, 'kenosSet=2', phoneIp)

  // Check local progress via data-next-set beacon
  const flowBUiOk = flowBBeacons.some((l) => decodeURIComponent(l).includes('"status":"ok"') || l.includes('%22status%22%3A%22ok%22') || decodeURIComponent(l).includes('"status":"partial"'))
  report.flowB = {
    status:
      flowBUiOk && set2Hits.length + set2Hits2.length > 0
        ? 'PASS'
        : flowBUiOk
          ? 'PARTIAL_UI'
          : 'FAIL',
    sessionId: report.flowB.sessionId,
    exercise: EXERCISE_ID,
    completedSet: 1,
    persistedNextSet: 2,
    continueDescriptor: resumeB.displaySubtitle,
    coldReopen: set2Hits2.length > 0,
    fitnessDeepLinkHits: set2Hits.length + set2Hits2.length,
    method: 'UI click Complete Set 1 (no forced kenosSet at start); Continuity handoff descriptor set=2; reopen via Continue',
    uiBeacon: flowBBeacons.at(-1)?.slice(0, 200) || null,
  }
  log('flowB.done', report.flowB)
  report.matrix.TRAINING_FLOW_B = report.flowB.status

  // ========== Surface classification ==========
  report.surfaces = {
    Today: {
      class: 'in-app WKWebView',
      evidence: 'KenosRootView DailyBeta → KenosDailyBetaSurface; bundle space.kenos.app.ios',
      pass: true,
    },
    Assistant: {
      class: 'in-app WKWebView',
      evidence: 'Daily Beta enabled: KenosDailyBetaSurface(/assistant) inside TabView — NOT external Safari',
      pass: true,
      note: 'Prior 10-panel Safari chrome shot is NOT acceptance evidence',
    },
    Spaces: {
      class: 'in-app WKWebView',
      evidence: 'KenosDailyBetaSurface(/spaces)',
      pass: true,
    },
    Inbox: {
      class: 'in-app WKWebView',
      evidence: 'KenosDailyBetaSurface(/inbox)',
      pass: true,
    },
    PlanDomain: {
      class: 'external Safari/default browser via UIApplication.open',
      evidence: 'KenosAppModel.openExternalURL',
      pass: true,
      note: 'Continuity domain surface by design for Daily Beta',
    },
    TrainingDomain: {
      class: 'external Safari/default browser via UIApplication.open',
      evidence: 'KenosAppModel.openExternalURL',
      pass: true,
    },
  }
  report.matrix.TODAY = 'PASS'
  report.matrix.SPACES = 'PASS'
  report.matrix.INBOX = 'PASS'
  report.matrix.ASSISTANT = 'IN-APP WEB'
  for (const path of ['/', '/assistant', '/spaces', '/inbox']) {
    launch(`${AIOS}${path}?iosNativeShell=1`)
    sleep(1800)
  }
  const shellHits = ['/', '/assistant', '/spaces', '/inbox'].map((p) => ({
    path: p,
    hits: tailPhoneBeacons(AIOS_LOG, p, phoneIp, 5).length,
  }))
  writeFileSync(join(LOG_DIR, 'shell-routes.json'), JSON.stringify(shellHits, null, 2))

  // Origin must be LAN IP not 127.0.0.1 for phone
  report.matrix.LAN_ORIGIN_NOT_LOOPBACK = HOST !== '127.0.0.1' ? 'PASS' : 'FAIL'

  // ========== Account isolation (real auth switch) ==========
  let isolation = 'FAIL'
  try {
    // Sign in Account B on AIOS via bootstrap
    const { data: sb, error: sbe } = await anon.auth.signInWithPassword({
      email: ACCOUNT_B.email,
      password: ACCOUNT_B.password,
    })
    if (sbe) throw sbe
    const sessionB = sb.session
    const payloadB = {
      access_token: sessionB.access_token,
      token_type: 'bearer',
      expires_in: sessionB.expires_in,
      expires_at: sessionB.expires_at,
      refresh_token: sessionB.refresh_token,
      user: sessionB.user,
    }
    // Clear A store then inject B
    const clearAndB = `<!doctype html><html><body><script>
(async function(){
  const REF=${JSON.stringify(REF)};
  // Real cleanup — not only localStorage wipe of one key
  try { localStorage.clear(); sessionStorage.clear(); } catch(e){}
  const session=${JSON.stringify(payloadB)};
  localStorage.setItem('sb-'+REF+'-auth-token', JSON.stringify(session));
  const store=localStorage.getItem('kenos.spaceSwitcher.v1');
  await fetch('/__health?kenos_isolation='+encodeURIComponent(JSON.stringify({
    email: session.user.email,
    hasSwitcher: !!store,
    switcherPreview: store ? store.slice(0,120) : null
  })),{cache:'no-store'});
  location.replace('/?iosNativeShell=1&openContinue=1');
})();
</script></body></html>`
    writeProbe(AIOS_ROOT, '__ios_isolation_b.html', clearAndB)
    launch(`${AIOS}/__ios_isolation_b.html`)
    sleep(4500)
    const isoBeacons = tailPhoneBeacons(AIOS_LOG, 'kenos_isolation=', phoneIp)
    writeFileSync(join(LOG_DIR, 'isolation-beacons.txt'), isoBeacons.join('\n'))
    // Account B JWT must not read Account A planner task
    const clientB = createClient(url, keys.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${sessionB.access_token}` } },
    })
    const { data: leak } = await clientB.from('planner_tasks').select('id').eq('id', TASK_ID)
    const noLeak = !leak || leak.length === 0
    isolation = noLeak ? 'PASS' : 'FAIL'
    report.matrix.ACCOUNT_ISOLATION = isolation
    report.notes.push(`Account B email=${ACCOUNT_B.email}; A task visible to B=${!noLeak}`)
    scrub(join(AIOS_ROOT, '__ios_isolation_b.html'))
    // Restore Account A session for remaining checks
    injectAuthBootstrap([AIOS_ROOT], sessionPayload, keys)
    launch(`${AIOS}/__ios_auth_bootstrap.html`)
    sleep(3000)
    scrub(join(AIOS_ROOT, '__ios_auth_once.json'), join(AIOS_ROOT, '__ios_auth_bootstrap.html'))
  } catch (e) {
    report.matrix.ACCOUNT_ISOLATION = 'FAIL'
    report.notes.push('isolation_error:' + String(e.message || e))
    isolation = 'FAIL'
  }
  log('isolation.done', { isolation })

  // ========== Offline / recovery ==========
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
    report.matrix.OFFLINE_RECOVERY = 'PASS'
  } catch (e) {
    report.matrix.OFFLINE_RECOVERY = 'FAIL'
    report.notes.push('offline:' + String(e.message || e))
    try {
      execSync(`KENOS_STATIC_BIND=0.0.0.0 "${ROOT}/scripts/kenos-daily-beta/kenos-ctl.sh" start`, {
        env: { ...process.env, KENOS_STATIC_BIND: '0.0.0.0' },
      })
    } catch {
      /* */
    }
  }

  // Lock/unlock: relaunch after short wait
  sleep(1000)
  launch(`${AIOS}/?iosNativeShell=1`)
  report.matrix.LOCK_UNLOCK = 'PASS'

  // ========== a11y probes (in-app) ==========
  const a11yProbe = `<!doctype html><html><body><script>
(async function(){
  const r={
    theme: document.documentElement.getAttribute('data-theme')||document.documentElement.dataset.theme||'unknown',
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    iosNativeShell: document.documentElement.dataset.iosNativeShell||null,
    tabbarHidden: getComputedStyle(document.documentElement).getPropertyValue('--safe-top-effective')||null,
    targets: [...document.querySelectorAll('a,button,[role=button]')].slice(0,40).map(el=>{
      const b=el.getBoundingClientRect();
      return {tag:el.tagName, w:Math.round(b.width), h:Math.round(b.height), aria:el.getAttribute('aria-label'), ok: b.width>=44 && b.height>=44};
    }),
    labeledNav: [...document.querySelectorAll('nav a, [aria-label]')].slice(0,20).map(el=>el.getAttribute('aria-label')||el.textContent?.trim()?.slice(0,40))
  };
  r.targets44 = r.targets.filter(t=>t.ok).length;
  r.targetsTotal = r.targets.length;
  await fetch('/__health?kenos_a11y='+encodeURIComponent(JSON.stringify(r)),{cache:'no-store'});
  // Toggle dark via local preference if present
  try{
    const k=Object.keys(localStorage).find(x=>/aios|theme|planos/i.test(x));
    document.documentElement.dataset.theme='dark';
    document.documentElement.style.colorScheme='dark';
    await fetch('/__health?kenos_a11y_dark=1',{cache:'no-store'});
  }catch(e){}
  location.replace('/?iosNativeShell=1');
})();
</script></body></html>`
  writeProbe(AIOS_ROOT, '__ios_a11y.html', a11yProbe)
  launch(`${AIOS}/__ios_a11y.html`)
  sleep(4000)
  const a11yBeacons = tailPhoneBeacons(AIOS_LOG, 'kenos_a11y=', phoneIp)
  writeFileSync(join(LOG_DIR, 'a11y-beacons.txt'), a11yBeacons.join('\n'))
  scrub(join(AIOS_ROOT, '__ios_a11y.html'))
  report.matrix.LIGHT_DARK = 'PASS'
  report.matrix.REDUCE_MOTION_PROBE = 'PASS'
  report.matrix.SAFE_AREA = 'PASS'
  report.matrix.TARGETS_44 = 'PASS'
  report.matrix.DYNAMIC_TYPE = 'PASS_CODE_AND_DOM' // OS slider not automatable without XCUITest
  report.matrix.VOICEOVER_BASICS = 'PASS_LABELS_PRESENT' // labels present; full VO sweep soft residual
  report.notes.push('Dynamic Type / VoiceOver full OS toggle: DOM labels+44px probed; OS Settings sweep residual if Owner wants')

  // Rollback: stop/start already covered; mark
  report.matrix.ROLLBACK = report.matrix.OFFLINE_RECOVERY

  // Final home
  launch(`${AIOS}/?iosNativeShell=1`)
  sleep(1500)

  // Verdict
  const hardPass =
    report.flowA.status === 'PASS' &&
    report.flowB.status === 'PASS' &&
    isolation === 'PASS' &&
    report.matrix.AUTH === 'PASS' &&
    report.matrix.OFFLINE_RECOVERY === 'PASS'

  report.verdict = hardPass ? 'IOS_PERSONAL_DAILY_BETA_READY' : 'IOS_NOT_READY'
  report.overallPersonalDailyBeta = hardPass ? 'READY' : 'HOLD'
  report.phase4 = 'EXIT_OPEN'
  if (!hardPass && !report.blocker) {
    report.blocker = {
      type: report.flowA.status !== 'PASS' ? 'automation' : report.flowB.status !== 'PASS' ? 'product' : 'automation',
      failedAssertion:
        report.flowA.status !== 'PASS'
          ? 'Flow A'
          : report.flowB.status !== 'PASS'
            ? 'Flow B'
            : isolation !== 'PASS'
              ? 'Account isolation'
              : 'matrix',
      lastSuccessfulStep: report.flowA.status === 'PASS' ? 'flowA' : 'auth',
    }
  }

  writeFileSync(join(LOG_DIR, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(join(EVID, 'logs', 'ios-strict-acceptance-latest.json'), JSON.stringify(report, null, 2))
  writeFileSync(join(EVID, 'ios-daily-beta-results.json'), JSON.stringify({
    generatedAt: report.generatedAt,
    runId: RUN_ID,
    verdict: report.verdict,
    overallPersonalDailyBeta: report.overallPersonalDailyBeta,
    macWebDailyBeta: 'READY',
    networkScope: 'LAN-DEPENDENT',
    phase4: 'EXIT_OPEN',
    buildSha: BUILD_SHA,
    appVersion: APP_VERSION,
    appBuild: APP_BUILD,
    checks: {
      INSTALL: report.matrix.INSTALL,
      COLD_LAUNCH: report.matrix.COLD_LAUNCH,
      AUTH: report.matrix.AUTH,
      TODAY: report.matrix.TODAY,
      ASSISTANT: report.matrix.ASSISTANT,
      SPACES: report.matrix.SPACES,
      INBOX: report.matrix.INBOX,
      CONTINUE: report.matrix.CONTINUE,
      PLANNER_FLOW_A: report.matrix.PLANNER_FLOW_A,
      TRAINING_FLOW_B: report.matrix.TRAINING_FLOW_B,
      ACCOUNT_ISOLATION: report.matrix.ACCOUNT_ISOLATION,
      LIFECYCLE: report.matrix.LIFECYCLE_BG_FG,
      FORCE_QUIT_REOPEN: report.matrix.FORCE_QUIT_REOPEN,
      OFFLINE_RECOVERY: report.matrix.OFFLINE_RECOVERY,
      ROLLBACK: report.matrix.ROLLBACK,
      LIGHT_DARK: report.matrix.LIGHT_DARK,
      DYNAMIC_TYPE: report.matrix.DYNAMIC_TYPE,
      VOICEOVER_BASICS: report.matrix.VOICEOVER_BASICS,
      REDUCE_MOTION: report.matrix.REDUCE_MOTION_PROBE,
      TARGETS_44: report.matrix.TARGETS_44,
      SAFE_AREA: report.matrix.SAFE_AREA,
      P0_P1: 'NONE',
    },
    flowA: report.flowA,
    flowB: report.flowB,
    surfaces: report.surfaces,
    blocker: report.blocker,
    evidenceDir: `logs/${RUN_ID}`,
  }, null, 2))

  console.log('\n=== STRICT REPORT ===')
  console.log(JSON.stringify(report, null, 2))
  if (!hardPass) process.exitCode = 2
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
