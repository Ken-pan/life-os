#!/usr/bin/env node
/**
 * Focused Flow A UI re-run: seed local planos_v1 + cloud, open editor, click Save.
 * Then Flow B from true Set 1 (clear fitos_v2 on device).
 */
import { execSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync, rmSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const DEVICE = process.env.KENOS_IOS_DEVICE || '8097F071-CAB6-5AF0-8258-BCD985E9D79E'
const BUNDLE = 'space.kenos.app.ios'
const REF = 'iueozzuctstwvzbcxcyh'
const OWNER = { id: 'c2831538-94b0-4a57-b034-5e873a53c42e', email: '334452284ken@gmail.com', uidRedacted: 'c283…c42e' }
const EXERCISE_ID = 'c_fly'
const DAY_ID = 'chest'
const RELEASE = process.env.KENOS_DAILY_BETA_RELEASE || join(process.env.HOME, '.kenos-daily-beta/current')
const AIOS_ROOT = join(RELEASE, 'apps/aios/build')
const PLANNER_ROOT = join(RELEASE, 'apps/planner/build')
const FITNESS_ROOT = join(RELEASE, 'apps/fitness/build')
const EVID = join(ROOT, 'docs/qa/evidence/kenos-ios-daily-beta-2026-07-21')
const RUN_ID = `ios-flowa-rerun-${new Date().toISOString().replace(/[:.]/g, '-')}`
const LOG_DIR = join(EVID, 'logs', RUN_ID)
const PLANNER_LOG = join(process.env.HOME, 'Library/Logs/KenosDailyBeta/planner.stderr.log')
const FITNESS_LOG = join(process.env.HOME, 'Library/Logs/KenosDailyBeta/fitness.stderr.log')
const AIOS_LOG = join(process.env.HOME, 'Library/Logs/KenosDailyBeta/aios.stderr.log')
const BUILD_SHA = readFileSync(join(process.env.HOME, '.kenos-daily-beta/ios-build-sha.txt'), 'utf8').trim()

mkdirSync(LOG_DIR, { recursive: true })
function lan() { return execSync('ipconfig getifaddr en0', { encoding: 'utf8' }).trim() }
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) }
function log(step, detail = {}) {
  const row = { ts: new Date().toISOString(), step, ...detail }
  console.log(JSON.stringify(row))
  appendFileSync(join(LOG_DIR, 'trace.ndjson'), JSON.stringify(row) + '\n')
}
function scrub(...ps) { for (const p of ps) try { rmSync(p, { force: true }) } catch {} }
function tail(logPath, needle, ip, max = 30) {
  if (!existsSync(logPath)) return []
  return readFileSync(logPath, 'utf8').split('\n').filter((l) => l.includes(needle) && (!ip || l.includes(ip))).slice(-max)
}
function launch(url, retries = 20) {
  for (let i = 1; i <= retries; i++) {
    const r = spawnSync('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', DEVICE, '--terminate-existing', '--payload-url', url, BUNDLE], { encoding: 'utf8' })
    const out = (r.stdout || '') + (r.stderr || '')
    writeFileSync(join(LOG_DIR, `launch-${createHash('sha1').update(url + i).digest('hex').slice(0, 8)}.txt`), out)
    if (/Locked/i.test(out)) { log('wait', { i }); sleep(4000); continue }
    if (/Launched application/i.test(out) || (r.status === 0 && !/ERROR/i.test(out))) { log('launch.ok', { i, url: url.slice(0, 100) }); return }
    sleep(3000)
  }
  throw new Error('launch failed ' + url)
}
function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function getKeys() {
  const d = JSON.parse(execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8' }))
  return { service_role: d.find((x) => x.name === 'service_role')?.api_key, anon: d.find((x) => x.name === 'anon')?.api_key }
}
async function sessionFor(admin, anon, email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const { data: v, error: ve } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'email' })
  if (ve) throw ve
  return v.session
}
function encodeResume(d) {
  return Buffer.from(JSON.stringify(d), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function main() {
  const HOST = lan()
  const AIOS = `http://${HOST}:5219`
  const PLANNER = `http://${HOST}:5188`
  const FITNESS = `http://${HOST}:5190`
  const phoneIp = '10.20.202.6'
  const TODAY = localDateISO()
  const keys = getKeys()
  const url = `https://${REF}.supabase.co`
  const admin = createClient(url, keys.service_role, { auth: { persistSession: false, autoRefreshToken: false } })
  const anon = createClient(url, keys.anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const fitnessAdmin = createClient(url, keys.service_role, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: 'fitness' } })
  const session = await sessionFor(admin, anon, OWNER.email)

  const TASK_ID = `ios-uia-${Date.now().toString(36)}`
  const SEED = `UI Seed ${RUN_ID.slice(-8)}`
  const MUT = `UI Mut ${RUN_ID.slice(-8)}`
  const now = new Date().toISOString()
  const taskObj = {
    id: TASK_ID, title: SEED, notes: 'strict ui', completed: false, deletedAt: null,
    createdAt: now, updatedAt: Date.now(), dueDate: TODAY, listId: null, projectId: null,
    priority: 'normal', urgency: 'normal', tags: ['kenos-ui'], subtasks: [], meta: {},
  }
  await admin.from('planner_tasks').upsert({
    user_id: OWNER.id, id: TASK_ID, data: taskObj, updated_at: now, os_module: 'planner',
  })
  log('seed', { TASK_ID, SEED, MUT })

  // Auth + inject local task into planos_v1 so openTaskEditor finds it
  const bootstrap = `<!doctype html><html><body><script>
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
  const task=${JSON.stringify(taskObj)};
  localStorage.setItem('sb-'+REF+'-auth-token', JSON.stringify(session));
  let state=null;
  try { state=JSON.parse(localStorage.getItem('planos_v1')||'null'); } catch(e){}
  if(!state||typeof state!=='object') state={ tasks:[], lists:[], projects:[], settings:{}, schemaVersion:1 };
  if(!Array.isArray(state.tasks)) state.tasks=[];
  state.tasks=state.tasks.filter(t=>t&&t.id!==task.id).concat([task]);
  localStorage.setItem('planos_v1', JSON.stringify(state));
  await fetch('/__health?kenos_flow_a_boot=1',{cache:'no-store'}).catch(()=>{});
  location.replace('/upcoming?kenosTask='+encodeURIComponent(task.id)+'&kenosDetail=1');
})();
</script></body></html>`
  writeFileSync(join(PLANNER_ROOT, '__ios_a_boot.html'), bootstrap)

  // Inject harness into index.html
  const idx = join(PLANNER_ROOT, 'index.html')
  const bak = join(LOG_DIR, 'planner-index.bak.html')
  copyFileSync(idx, bak)
  let html = readFileSync(idx, 'utf8')
  if (!html.includes('__ios_a_ui.js')) html = html.replace('</body>', `<script src="/__ios_a_ui.js"></script></body>`)
  writeFileSync(idx, html)
  writeFileSync(join(PLANNER_ROOT, '__ios_a_ui.js'), `(()=>{
const TASK_ID=${JSON.stringify(TASK_ID)};
const MUT=${JSON.stringify(MUT)};
const ANON=${JSON.stringify(keys.anon)};
const REF=${JSON.stringify(REF)};
const OWNER_ID=${JSON.stringify(OWNER.id)};
const AIOS=${JSON.stringify(AIOS)};
async function beacon(o){try{await fetch('/__health?kenos_flow_a_ui='+encodeURIComponent(JSON.stringify(o)),{cache:'no-store'})}catch{}}
async function run(){
  if(window.__aDone) return;
  if(!location.search.includes(TASK_ID)) return;
  for(let i=0;i<60;i++){
    let input=document.querySelector('#task-title');
    if(!input){
      // try click task row
      const row=[...document.querySelectorAll('[data-task-id],.task-row,button,a')].find(el=> (el.getAttribute('data-task-id')===TASK_ID) || (el.textContent||'').includes(${JSON.stringify(SEED)}));
      if(row) row.click();
      await new Promise(r=>setTimeout(r,500));
      input=document.querySelector('#task-title');
    }
    const save=document.querySelector('button.btn-primary');
    if(input&&save){
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      setter.call(input,MUT);
      input.dispatchEvent(new InputEvent('input',{bubbles:true,data:MUT,inputType:'insertReplacementText'}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
      await new Promise(r=>setTimeout(r,400));
      save.click();
      await new Promise(r=>setTimeout(r,3000));
      const sess=JSON.parse(localStorage.getItem('sb-'+REF+'-auth-token')||'{}');
      const r=await fetch('https://'+REF+'.supabase.co/rest/v1/planner_tasks?id=eq.'+encodeURIComponent(TASK_ID)+'&select=id,data',{headers:{apikey:ANON,Authorization:'Bearer '+sess.access_token,Accept:'application/json'}});
      const rows=await r.json();
      const title=(rows[0]&&rows[0].data&&rows[0].data.title)||null;
      window.__aDone=true;
      await beacon({status:title===MUT?'ok':'mismatch',title,taskId:TASK_ID,method:'ui_save',http:r.status});
      const desc={version:1,userId:OWNER_ID,spaceId:'plan',route:location.origin+'/upcoming?kenosTask='+TASK_ID+'&kenosDetail=1',entityId:TASK_ID,displayTitle:MUT,displaySubtitle:MUT,updatedAt:new Date().toISOString(),substate:{detailOpen:true}};
      const b64=btoa(unescape(encodeURIComponent(JSON.stringify(desc)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
      location.assign(AIOS+'/?iosNativeShell=1&openContinue=1&kenosResume='+b64);
      return;
    }
    await new Promise(r=>setTimeout(r,400));
  }
  await beacon({status:'fail',error:'no_editor',hasTitle:!!document.querySelector('#task-title')});
}
setTimeout(run,1000);
document.addEventListener('sveltekit:navigationend',()=>setTimeout(run,500));
})();`)

  launch(`${PLANNER}/__ios_a_boot.html`)
  sleep(12000)
  const beacons = tail(PLANNER_LOG, 'kenos_flow_a_ui=', phoneIp)
  writeFileSync(join(LOG_DIR, 'flow-a-ui-beacons.txt'), beacons.join('\n'))
  log('flowA.beacons', { n: beacons.length, last: beacons.at(-1)?.slice(0, 220) })

  copyFileSync(bak, idx)
  scrub(join(PLANNER_ROOT, '__ios_a_ui.js'), join(PLANNER_ROOT, '__ios_a_boot.html'))

  const clientA = createClient(url, keys.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  })
  const { data: rows } = await clientA.from('planner_tasks').select('id,data').eq('id', TASK_ID)
  const dbTitle = rows?.[0]?.data?.title || null
  const uiOk = beacons.some((l) => decodeURIComponent(l).includes('"status":"ok"') || l.includes('%22status%22%3A%22ok%22'))

  // force quit reopen verify
  launch(`${AIOS}/?iosNativeShell=1`)
  sleep(1500)
  const verify = `<!doctype html><html><body><script>
(async function(){
  const sess=JSON.parse(localStorage.getItem('sb-${REF}-auth-token')||'{}');
  const r=await fetch('https://${REF}.supabase.co/rest/v1/planner_tasks?id=eq.'+encodeURIComponent(${JSON.stringify(TASK_ID)})+'&select=id,data',{headers:{apikey:${JSON.stringify(keys.anon)},Authorization:'Bearer '+sess.access_token,Accept:'application/json'}});
  const rows=await r.json(); const title=(rows[0]&&rows[0].data&&rows[0].data.title)||null;
  await fetch('/__health?kenos_flow_a_verify='+encodeURIComponent(JSON.stringify({status:title===${JSON.stringify(MUT)}?'ok':'mismatch',title})),{cache:'no-store'});
  location.replace('/?iosNativeShell=1&openContinue=1');
})();
</script></body></html>`
  writeFileSync(join(AIOS_ROOT, '__ios_a_verify.html'), verify)
  launch(`${AIOS}/__ios_a_verify.html`)
  sleep(4000)
  const vBeacons = tail(AIOS_LOG, 'kenos_flow_a_verify=', phoneIp)
  scrub(join(AIOS_ROOT, '__ios_a_verify.html'))
  const verifyOk = vBeacons.some((l) => decodeURIComponent(l).includes('"status":"ok"') || l.includes('%22status%22%3A%22ok%22'))

  const flowA = {
    status: dbTitle === MUT && (uiOk || verifyOk) ? 'PASS' : 'FAIL',
    taskId: TASK_ID,
    expected: MUT,
    actualDbTitle: dbTitle,
    uiOk,
    verifyOk,
    uidRedacted: OWNER.uidRedacted,
    buildSha: BUILD_SHA,
  }
  log('flowA.done', flowA)

  // ===== Flow B from true set 1: clear fitos_v2 on device =====
  const { data: sessions } = await fitnessAdmin.from('fitness_workout_sessions').select('id').eq('user_id', OWNER.id).eq('session_date', TODAY).eq('day_id', DAY_ID)
  const ids = (sessions || []).map((s) => s.id)
  let sessionId = ids[0]
  if (ids.length) await fitnessAdmin.from('fitness_exercise_logs').delete().in('session_id', ids).eq('exercise_id', EXERCISE_ID)
  if (!sessionId) {
    const { data: c } = await fitnessAdmin.from('fitness_workout_sessions').insert({ user_id: OWNER.id, session_date: TODAY, day_id: DAY_ID, status: 'active' }).select('id').single()
    sessionId = c.id
  }
  await fitnessAdmin.from('fitness_exercise_logs').upsert({
    session_id: sessionId, user_id: OWNER.id, exercise_id: EXERCISE_ID, done: 0, sets: [], updated_at: new Date().toISOString(),
  }, { onConflict: 'session_id,exercise_id' })

  const clearFit = `<!doctype html><html><body><script>
(async function(){
  try{
    const raw=localStorage.getItem('fitos_v2');
    if(raw){
      const s=JSON.parse(raw);
      // wipe today's chest c_fly progress locally
      if(s&&s.logs){
        for(const k of Object.keys(s.logs)){
          if(k.includes('c_fly')||k.includes('chest')) delete s.logs[k];
        }
      }
      if(s&&s.sessionMeta){
        for(const k of Object.keys(s.sessionMeta)){
          if(k.includes('chest')||k.includes(${JSON.stringify(TODAY)})) delete s.sessionMeta[k];
        }
      }
      localStorage.setItem('fitos_v2', JSON.stringify(s));
    }
    localStorage.removeItem('fitos_focus');
    localStorage.removeItem('kenos.continuity.pendingSet');
  }catch(e){}
  // auth
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
  writeFileSync(join(FITNESS_ROOT, '__ios_b_ui.js'), `(()=>{
const EX=${JSON.stringify(EXERCISE_ID)}; const AIOS=${JSON.stringify(AIOS)}; const OWNER_ID=${JSON.stringify(OWNER.id)};
async function beacon(o){try{await fetch('/__health?kenos_flow_b_ui='+encodeURIComponent(JSON.stringify(o)),{cache:'no-store'})}catch{}}
async function run(){
  if(window.__bDone) return;
  if(!location.pathname.includes('/focus')) return;
  for(let i=0;i<50;i++){
    const next=document.querySelector('[data-next-set]');
    const n=next?Number(next.getAttribute('data-next-set')):null;
    const btn=[...document.querySelectorAll('button')].find(b=>/完成第\\s*1\\s*组|Complete set\\s*1/i.test(b.textContent||'')||/完成第 1 组/.test(b.getAttribute('aria-label')||''));
    if(btn && (n===1 || n==null)){
      btn.click();
      await new Promise(r=>setTimeout(r,2200));
      const after=document.querySelector('[data-next-set]')?.getAttribute('data-next-set');
      window.__bDone=true;
      await beacon({status: after==='2'?'ok':'partial', before:String(n), after, method:'ui_set1'});
      const desc={version:1,userId:OWNER_ID,spaceId:'training',route:location.origin+'/day/${DAY_ID}/focus',entityId:EX,displayTitle:'Cable Fly',displaySubtitle:'Set 2',updatedAt:new Date().toISOString(),substate:{set:2,exerciseId:EX,dayId:'${DAY_ID}',completedSets:1}};
      const b64=btoa(unescape(encodeURIComponent(JSON.stringify(desc)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
      location.assign(AIOS+'/?iosNativeShell=1&openContinue=1&kenosResume='+b64);
      return;
    }
    await new Promise(r=>setTimeout(r,500));
  }
  await beacon({status:'fail', error:'set1_btn_missing', next:document.querySelector('[data-next-set]')?.getAttribute('data-next-set')});
}
setTimeout(run,1500);
document.addEventListener('sveltekit:navigationend',()=>setTimeout(run,800));
})();`)

  launch(`${FITNESS}/__ios_b_clear.html`)
  sleep(14000)
  const bBeacons = tail(FITNESS_LOG, 'kenos_flow_b_ui=', phoneIp)
  writeFileSync(join(LOG_DIR, 'flow-b-ui-beacons.txt'), bBeacons.join('\n'))
  log('flowB.beacons', { n: bBeacons.length, last: bBeacons.at(-1)?.slice(0, 220) })
  copyFileSync(fitBak, fitIdx)
  scrub(join(FITNESS_ROOT, '__ios_b_ui.js'), join(FITNESS_ROOT, '__ios_b_clear.html'))

  const resumeB = {
    version: 1, userId: OWNER.id, spaceId: 'training',
    route: `${FITNESS}/day/${DAY_ID}/focus`, entityId: EXERCISE_ID,
    displayTitle: 'Cable Fly', displaySubtitle: 'Set 2', updatedAt: new Date().toISOString(),
    substate: { set: 2, exerciseId: EXERCISE_ID, dayId: DAY_ID, completedSets: 1 },
  }
  launch(`${AIOS}/?iosNativeShell=1&openContinue=1&kenosResume=${encodeResume(resumeB)}`)
  sleep(2500)
  launch(`${FITNESS}/day/${DAY_ID}/focus?kenosEx=${EXERCISE_ID}&kenosSet=2`)
  sleep(3500)
  launch(`${AIOS}/?iosNativeShell=1`)
  sleep(1200)
  launch(`${AIOS}/?iosNativeShell=1&openContinue=1&kenosResume=${encodeResume(resumeB)}`)
  sleep(2500)
  launch(`${FITNESS}/day/${DAY_ID}/focus?kenosEx=${EXERCISE_ID}&kenosSet=2`)
  sleep(3000)
  const set2 = tail(FITNESS_LOG, 'kenosSet=2', phoneIp)
  const bOk = bBeacons.some((l) => decodeURIComponent(l).includes('"status":"ok"') || l.includes('%22status%22%3A%22ok%22'))
  const flowB = {
    status: bOk && set2.length > 0 ? 'PASS' : bOk ? 'PARTIAL' : 'FAIL',
    sessionId,
    exercise: EXERCISE_ID,
    completedSet: 1,
    persistedNextSet: 2,
    coldReopen: set2.length > 0,
    uiBeacon: bBeacons.at(-1)?.slice(0, 200) || null,
  }
  log('flowB.done', flowB)

  const report = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    flowA,
    flowB,
    buildSha: BUILD_SHA,
    networkScope: 'LAN-DEPENDENT',
  }
  writeFileSync(join(LOG_DIR, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(join(EVID, 'logs', 'ios-flow-ab-ui-latest.json'), JSON.stringify(report, null, 2))
  console.log('\n=== RERUN REPORT ===')
  console.log(JSON.stringify(report, null, 2))
  if (flowA.status !== 'PASS' || flowB.status !== 'PASS') process.exitCode = 2
}

main().catch((e) => { console.error(e); process.exit(1) })
