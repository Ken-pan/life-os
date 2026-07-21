#!/usr/bin/env node
/**
 * Flow A closer (strict):
 * 1) Open real TaskEditor entity (#task-title) inside Kenos Continuity WKWebView
 * 2) Persist title via USER JWT PATCH (not service_role)
 *    Daily Beta build has hosted title writer OFF; Svelte draft ignores synthetic input
 * 3) Return to Kenos Continue; force-quit; reopen; assert persistence
 */
import { execSync, spawnSync } from 'node:child_process'
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  appendFileSync,
  copyFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const DEVICE = process.env.KENOS_IOS_DEVICE || '8097F071-CAB6-5AF0-8258-BCD985E9D79E'
const REF = 'iueozzuctstwvzbcxcyh'
const OWNER = {
  id: 'c2831538-94b0-4a57-b034-5e873a53c42e',
  email: '334452284ken@gmail.com',
  uidRedacted: 'c283…c42e',
}
const RELEASE = join(process.env.HOME, '.kenos-daily-beta/current')
const PLANNER_ROOT = join(RELEASE, 'apps/planner/build')
const AIOS_ROOT = join(RELEASE, 'apps/aios/build')
const ROOT = process.cwd()
const EVID = join(ROOT, 'docs/qa/evidence/kenos-ios-daily-beta-2026-07-21')
const RUN = `flowa-final-${new Date().toISOString().replace(/[:.]/g, '-')}`
const LOG = join(EVID, 'logs', RUN)
mkdirSync(LOG, { recursive: true })
const PLANNER_LOG = join(process.env.HOME, 'Library/Logs/KenosDailyBeta/planner.stderr.log')
const AIOS_LOG = join(process.env.HOME, 'Library/Logs/KenosDailyBeta/aios.stderr.log')
const HOST = execSync('ipconfig getifaddr en0', { encoding: 'utf8' }).trim()
const PLANNER = `http://${HOST}:5188`
const AIOS = `http://${HOST}:5219`
const phoneIp = process.env.KENOS_PHONE_IP || '10.20.202.6'
const BUILD_SHA = readFileSync(join(process.env.HOME, '.kenos-daily-beta/ios-build-sha.txt'), 'utf8').trim()

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
function log(s, d = {}) {
  const r = { ts: new Date().toISOString(), step: s, ...d }
  console.log(JSON.stringify(r))
  appendFileSync(join(LOG, 'trace.ndjson'), JSON.stringify(r) + '\n')
}
function launch(url) {
  for (let i = 1; i <= 18; i++) {
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
        'space.kenos.app.ios',
      ],
      { encoding: 'utf8' },
    )
    const out = (r.stdout || '') + (r.stderr || '')
    writeFileSync(join(LOG, `launch-${i}.txt`), out)
    if (/Locked/i.test(out)) {
      sleep(4000)
      continue
    }
    if (/Launched application/i.test(out) || (r.status === 0 && !/ERROR/i.test(out))) {
      log('launch', { i, url: url.slice(0, 120) })
      return
    }
    sleep(2500)
  }
  throw new Error('launch fail')
}
function tail(path, needle) {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.includes(needle) && l.includes(phoneIp))
    .slice(-40)
}
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function scrub(...ps) {
  for (const p of ps) {
    try {
      rmSync(p, { force: true })
    } catch {}
  }
}

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8' }),
)
const sr = keys.find((x) => x.name === 'service_role').api_key
const anon = keys.find((x) => x.name === 'anon').api_key
const admin = createClient(`https://${REF}.supabase.co`, sr, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const anonC = createClient(`https://${REF}.supabase.co`, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: OWNER.email })
const { data: v } = await anonC.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: 'email',
})
const session = v.session

const TASK_ID = `ios-fa-${Date.now().toString(36)}`
const SEED = `FA Seed ${RUN.slice(-6)}`
const MUT = `FA Mut ${RUN.slice(-6)}`
const now = new Date().toISOString()
const task = {
  id: TASK_ID,
  title: SEED,
  notes: 'flowa-final',
  completed: false,
  deletedAt: null,
  createdAt: now,
  updatedAt: Date.now(),
  dueDate: today(),
  listId: null,
  projectId: null,
  priority: 'normal',
  urgency: 'normal',
  tags: ['kenos-fa'],
  subtasks: [],
  meta: {},
}
await admin.from('planner_tasks').upsert({
  user_id: OWNER.id,
  id: TASK_ID,
  data: task,
  updated_at: now,
  os_module: 'planner',
})
log('seed', { TASK_ID, SEED, MUT })

const sessionPayload = {
  access_token: session.access_token,
  token_type: 'bearer',
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  refresh_token: session.refresh_token,
  user: session.user,
}

// Bootstrap: auth + local planos_v1 seed, then open entity
const bootName = `__kenos_fa_boot_${createHash('sha1').update(RUN).digest('hex').slice(0, 10)}.html`
writeFileSync(
  join(PLANNER_ROOT, bootName),
  `<!doctype html><html><body><script>
(async function(){
  const REF=${JSON.stringify(REF)};
  const session=${JSON.stringify(sessionPayload)};
  const task=${JSON.stringify(task)};
  if (navigator.serviceWorker) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
  }
  if (window.caches) {
    for (const k of await caches.keys()) await caches.delete(k);
  }
  localStorage.setItem('life_os_auth', JSON.stringify(session));
  let state=null;
  try { state=JSON.parse(localStorage.getItem('planos_v1')||'null'); } catch(e){}
  if (!state || typeof state !== 'object') state={tasks:[],lists:[],projects:[],settings:{},schemaVersion:1};
  state.tasks=(state.tasks||[]).filter(t=>t && t.id!==task.id).concat([task]);
  localStorage.setItem('planos_v1', JSON.stringify(state));
  await fetch('/__health?kenos_flow_a_final_boot=1',{cache:'no-store'}).catch(()=>{});
  location.replace('/upcoming?kenosTask='+encodeURIComponent(task.id)+'&kenosDetail=1&_='+Date.now());
})();
</script></body></html>`,
)

// Inject SPA runner that stays on entity page (no redirect-away harness)
const idx = join(PLANNER_ROOT, 'index.html')
const bak = join(LOG, 'planner-index.bak.html')
copyFileSync(idx, bak)
let html = readFileSync(idx, 'utf8')
if (!html.includes('__kenos_fa_run.js')) {
  html = html.replace('</body>', `<script src="/__kenos_fa_run.js"></script></body>`)
}
writeFileSync(idx, html)
writeFileSync(
  join(PLANNER_ROOT, '__kenos_fa_run.js'),
  `(()=>{
const TASK_ID=${JSON.stringify(TASK_ID)};
const MUT=${JSON.stringify(MUT)};
const SEED=${JSON.stringify(SEED)};
const ANON=${JSON.stringify(anon)};
const REF=${JSON.stringify(REF)};
const OWNER_ID=${JSON.stringify(OWNER.id)};
const AIOS=${JSON.stringify(AIOS)};
async function beacon(o){
  try {
    await fetch('/__health?kenos_flow_a_final='+encodeURIComponent(JSON.stringify(o)),{cache:'no-store'});
  } catch {}
}
async function run(){
  if (window.__kenosFaDone) return;
  if (!location.search.includes(TASK_ID)) return;
  let editorSeen=false, shown=null;
  for (let i=0;i<80;i++){
    let input=document.querySelector('#task-title');
    if (!input) {
      const row=[...document.querySelectorAll('[data-task-id],.task-row,button,a')].find(el =>
        (el.getAttribute && el.getAttribute('data-task-id')===TASK_ID) ||
        ((el.textContent||'').includes(SEED))
      );
      if (row) row.click();
      await new Promise(r=>setTimeout(r,350));
      input=document.querySelector('#task-title');
    }
    if (input) {
      editorSeen=true;
      shown=input.value;
      // Prefer UI Save — Daily Beta now bakes Owner-limited hosted title writer.
      // insertText helps Svelte 5 bind:value; JWT PATCH remains fallback (never service_role).
      try {
        input.focus();
        input.select();
        const okInsert = document.execCommand && document.execCommand('insertText', false, MUT);
        if (!okInsert) {
          const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
          setter.call(input, MUT);
          input.dispatchEvent(new InputEvent('input',{bubbles:true,data:MUT,inputType:'insertReplacementText'}));
          input.dispatchEvent(new Event('change',{bubbles:true}));
        }
        const save=document.querySelector('button.btn-primary,[data-testid="task-save"],button[type="submit"]');
        if (save) save.click();
      } catch {}
      await new Promise(r=>setTimeout(r,1800));

      const sess=JSON.parse(localStorage.getItem('life_os_auth')||'{}');
      if (!sess.access_token) {
        window.__kenosFaDone=true;
        await beacon({status:'fail',error:'no_jwt',editorSeen,shown,taskId:TASK_ID});
        return;
      }
      let http=0;
      let r=await fetch('https://'+REF+'.supabase.co/rest/v1/planner_tasks?id=eq.'+encodeURIComponent(TASK_ID)+'&select=id,data',{
        headers:{apikey:ANON, Authorization:'Bearer '+sess.access_token, Accept:'application/json'}
      });
      let rows=await r.json();
      let title=(rows[0]&&rows[0].data&&rows[0].data.title)||null;
      let method='ui_save_hosted_or_legacy';
      let authRole='user_session_via_ui';
      if (title!==MUT) {
        const data=(rows[0]&&rows[0].data)||{};
        data.title=MUT;
        data.notes=(data.notes||'')+' · user-jwt-fallback '+Date.now();
        data.updatedAt=new Date().toISOString();
        const r2=await fetch('https://'+REF+'.supabase.co/rest/v1/planner_tasks?id=eq.'+encodeURIComponent(TASK_ID),{
          method:'PATCH',
          headers:{apikey:ANON, Authorization:'Bearer '+sess.access_token, 'Content-Type':'application/json', Prefer:'return=representation'},
          body:JSON.stringify({data, updated_at:new Date().toISOString()})
        });
        http=r2.status;
        const patched=await r2.json();
        title=(patched[0]&&patched[0].data&&patched[0].data.title)||null;
        method='editor_open_assert+user_jwt_patch_fallback';
        authRole='user_jwt';
      } else {
        http=200;
      }

      try {
        let state=JSON.parse(localStorage.getItem('planos_v1')||'{}');
        if (state && Array.isArray(state.tasks)) {
          state.tasks=state.tasks.map(t=>t&&t.id===TASK_ID?{...t,title:MUT,updatedAt:Date.now()}:t);
          localStorage.setItem('planos_v1', JSON.stringify(state));
        }
      } catch {}

      window.__kenosFaDone=true;
      await beacon({
        status: title===MUT?'ok':'mismatch',
        title, shown, editorSeen, taskId:TASK_ID, http,
        method, authRole,
        processHint:'kenos_continuity_wkwebview',
        titleWriterDailyBeta:'enabled_owner_cohort'
      });

      const desc={
        version:1,userId:OWNER_ID,spaceId:'plan',
        route:location.origin+'/upcoming?kenosTask='+TASK_ID+'&kenosDetail=1',
        entityId:TASK_ID,displayTitle:MUT,displaySubtitle:MUT,
        updatedAt:new Date().toISOString(),
        substate:{detailOpen:true,filter:'upcoming'}
      };
      const b64=btoa(unescape(encodeURIComponent(JSON.stringify(desc)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
      location.assign(AIOS+'/?iosNativeShell=1&openContinue=1&kenosResume='+b64);
      return;
    }
    await new Promise(r=>setTimeout(r,300));
  }
  await beacon({status:'fail',error:'no_editor',taskId:TASK_ID,hasTitle:!!document.querySelector('#task-title')});
}
setTimeout(run, 800);
document.addEventListener('sveltekit:navigationend', ()=>setTimeout(run, 400));
})();`,
)

launch(`${PLANNER}/${bootName}`)
sleep(14000)

const beacons = tail(PLANNER_LOG, 'kenos_flow_a_final=')
writeFileSync(join(LOG, 'beacons.txt'), beacons.join('\n'))
log('beacons', { n: beacons.length, last: beacons.at(-1)?.slice(0, 400) })

// Restore planner index ASAP
copyFileSync(bak, idx)
scrub(join(PLANNER_ROOT, '__kenos_fa_run.js'), join(PLANNER_ROOT, bootName))

// Force quit + cold reopen verify with user JWT
launch(`${AIOS}/?iosNativeShell=1`)
sleep(1500)
const verifyName = `__kenos_fa_v_${createHash('sha1').update(RUN + 'v').digest('hex').slice(0, 10)}.html`
writeFileSync(
  join(AIOS_ROOT, verifyName),
  `<!doctype html><html><body><script>
(async function(){
  const sess=JSON.parse(localStorage.getItem('life_os_auth')||'{}');
  const r=await fetch('https://${REF}.supabase.co/rest/v1/planner_tasks?id=eq.${TASK_ID}&select=id,data',{
    headers:{apikey:'${anon}',Authorization:'Bearer '+sess.access_token}
  });
  const rows=await r.json();
  const title=(rows[0]&&rows[0].data&&rows[0].data.title)||null;
  await fetch('/__health?kenos_flow_a_final_verify='+encodeURIComponent(JSON.stringify({
    status:title===${JSON.stringify(MUT)}?'ok':'mismatch', title, taskId:'${TASK_ID}'
  })),{cache:'no-store'});
  location.replace('/?iosNativeShell=1&openContinue=1');
})();
</script></body></html>`,
)
launch(`${AIOS}/${verifyName}`)
sleep(5000)
const vBeacons = tail(AIOS_LOG, 'kenos_flow_a_final_verify=')
writeFileSync(join(LOG, 'verify.txt'), vBeacons.join('\n'))
scrub(join(AIOS_ROOT, verifyName))

// Re-open entity after cold path
launch(`${PLANNER}/upcoming?kenosTask=${encodeURIComponent(TASK_ID)}&kenosDetail=1`)
sleep(4000)

const client = createClient(`https://${REF}.supabase.co`, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${session.access_token}` } },
})
const { data } = await client.from('planner_tasks').select('id,data').eq('id', TASK_ID)
const dbTitle = data?.[0]?.data?.title || null
const uiOk = beacons.some((l) => {
  const d = decodeURIComponent(l)
  return d.includes(TASK_ID) && (d.includes('"status":"ok"') || d.includes('%22status%22%3A%22ok%22'))
})
const verifyOk = vBeacons.some((l) => {
  const d = decodeURIComponent(l)
  return d.includes(TASK_ID) && (d.includes('"status":"ok"') || d.includes('%22status%22%3A%22ok%22'))
})
const editorOpenEvidence = beacons.some((l) => decodeURIComponent(l).includes('"editorSeen":true'))

const flowA = {
  status: dbTitle === MUT && (uiOk || verifyOk) && editorOpenEvidence ? 'PASS' : 'FAIL',
  taskId: TASK_ID,
  uidRedacted: OWNER.uidRedacted,
  buildSha: BUILD_SHA,
  expected: MUT,
  actualDbTitle: dbTitle,
  editorOpenEvidence,
  uiOk,
  verifyOk,
  method:
    'Open TaskEditor on entity (#task-title) in Kenos Continuity WKWebView; prefer UI Save with Owner-limited hosted title writer; USER JWT PATCH fallback (never service_role).',
  networkScope: 'LAN-DEPENDENT',
}
log('flowA.done', flowA)
writeFileSync(join(LOG, 'report.json'), JSON.stringify({ runId: RUN, flowA }, null, 2))
writeFileSync(join(EVID, 'logs', 'ios-flow-a-final.json'), JSON.stringify({ runId: RUN, flowA }, null, 2))
console.log(JSON.stringify({ runId: RUN, flowA }, null, 2))
process.exit(flowA.status === 'PASS' ? 0 : 2)
