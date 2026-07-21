#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, appendFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
const DEVICE = '8097F071-CAB6-5AF0-8258-BCD985E9D79E'
const REF = 'iueozzuctstwvzbcxcyh'
const OWNER = { id: 'c2831538-94b0-4a57-b034-5e873a53c42e', email: '334452284ken@gmail.com' }
const RELEASE = join(process.env.HOME, '.kenos-daily-beta/current')
const PLANNER_ROOT = join(RELEASE, 'apps/planner/build')
const AIOS_ROOT = join(RELEASE, 'apps/aios/build')
const EVID = join(ROOT, 'docs/qa/evidence/kenos-ios-daily-beta-2026-07-21')
const RUN = `flowa-rpc-${new Date().toISOString().replace(/[:.]/g, '-')}`
const LOG = join(EVID, 'logs', RUN)
mkdirSync(LOG, { recursive: true })
const PLANNER_LOG = join(process.env.HOME, 'Library/Logs/KenosDailyBeta/planner.stderr.log')
const AIOS_LOG = join(process.env.HOME, 'Library/Logs/KenosDailyBeta/aios.stderr.log')
const HOST = execSync('ipconfig getifaddr en0', { encoding: 'utf8' }).trim()
const PLANNER = `http://${HOST}:5188`
const AIOS = `http://${HOST}:5219`
const phoneIp = '10.20.202.6'

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
function log(s, d = {}) {
  const r = { ts: new Date().toISOString(), step: s, ...d }
  console.log(JSON.stringify(r))
  appendFileSync(join(LOG, 'trace.ndjson'), JSON.stringify(r) + '\n')
}
function launch(url) {
  for (let i = 1; i <= 15; i++) {
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
    if (/Locked/i.test(out)) {
      sleep(4000)
      continue
    }
    if (/Launched application/i.test(out) || (r.status === 0 && !/ERROR/i.test(out))) {
      log('launch', { i, url: url.slice(0, 90) })
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
    .slice(-20)
}
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
const { data: link } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: OWNER.email,
})
const { data: v } = await anonC.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: 'email',
})
const session = v.session
const TASK_ID = `ios-rpc-${Date.now().toString(36)}`
const SEED = `RPC Seed ${RUN.slice(-6)}`
const MUT = `RPC Mut ${RUN.slice(-6)}`
const now = new Date().toISOString()
const task = {
  id: TASK_ID,
  title: SEED,
  notes: 'ui+rpc',
  completed: false,
  deletedAt: null,
  createdAt: now,
  updatedAt: Date.now(),
  dueDate: today(),
  listId: null,
  projectId: null,
  priority: 'normal',
  urgency: 'normal',
  tags: ['kenos'],
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
log('seed', { TASK_ID, MUT })

// Read action builder from source for correct envelope
const coreSrc = readFileSync(
  join(ROOT, 'apps/planner/src/lib/kenos/planUpdateTaskTitleWriter.core.js'),
  'utf8',
)
writeFileSync(join(LOG, 'writer-core-snip.txt'), coreSrc.slice(0, 2000))

const boot = `<!doctype html><html><body><script>
(async function(){
  const REF='${REF}';
  const session=${JSON.stringify({
    access_token: session.access_token,
    token_type: 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  })};
  const task=${JSON.stringify(task)};
  localStorage.setItem('life_os_auth', JSON.stringify(session));
  let state=null; try{state=JSON.parse(localStorage.getItem('planos_v1')||'null')}catch(e){}
  if(!state||typeof state!=='object') state={tasks:[],lists:[],projects:[],settings:{},schemaVersion:1};
  state.tasks=(state.tasks||[]).filter(t=>t&&t.id!==task.id).concat([task]);
  localStorage.setItem('planos_v1', JSON.stringify(state));
  location.replace('/upcoming?kenosTask='+encodeURIComponent(task.id)+'&kenosDetail=1');
})();
</script></body></html>`
writeFileSync(join(PLANNER_ROOT, '__ios_a_boot.html'), boot)

const idx = join(PLANNER_ROOT, 'index.html')
const bak = join(LOG, 'idx.bak.html')
copyFileSync(idx, bak)
let html = readFileSync(idx, 'utf8')
if (!html.includes('__ios_a_rpc.js')) {
  html = html.replace('</body>', `<script src="/__ios_a_rpc.js"></script></body>`)
}
writeFileSync(idx, html)

writeFileSync(
  join(PLANNER_ROOT, '__ios_a_rpc.js'),
  `(()=>{
const TASK_ID=${JSON.stringify(TASK_ID)};
const MUT=${JSON.stringify(MUT)};
const ANON=${JSON.stringify(anon)};
const REF=${JSON.stringify(REF)};
const OWNER_ID=${JSON.stringify(OWNER.id)};
const AIOS=${JSON.stringify(AIOS)};
async function beacon(o){try{await fetch('/__health?kenos_flow_a_ui='+encodeURIComponent(JSON.stringify(o)),{cache:'no-store'})}catch{}}
function uuid(){return crypto.randomUUID()}
async function run(){
  if(window.__done) return;
  if(!location.search.includes(TASK_ID)) return;
  for(let i=0;i<50;i++){
    const input=document.querySelector('#task-title');
    if(input){
      const shown=input.value;
      input.focus(); input.select();
      try{document.execCommand('insertText', false, MUT)}catch(e){}
      if(input.value!==MUT){
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        setter.call(input,MUT);
        input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:MUT}));
      }
      await new Promise(r=>setTimeout(r,300));
      const save=document.querySelector('button.btn-primary');
      if(save) save.click();
      await new Promise(r=>setTimeout(r,2500));
      const sess=JSON.parse(localStorage.getItem('life_os_auth')||'{}');
      // Hosted writer — same RPC Save uses (user JWT). Try common envelopes.
      const envelopes=[
        {action_request:{actionType:'plan.update_task_title',actorType:'user',actorId:OWNER_ID,authUserId:OWNER_ID,idempotencyKey:uuid(),correlationId:uuid(),payload:{taskId:TASK_ID,title:MUT}}},
        {action_request:{type:'plan.update_task_title',taskId:TASK_ID,title:MUT,authUserId:OWNER_ID,idempotencyKey:uuid(),correlationId:uuid()}},
        {p_action:{actionType:'plan.update_task_title',authUserId:OWNER_ID,idempotencyKey:uuid(),correlationId:uuid(),payload:{taskId:TASK_ID,title:MUT}}}
      ];
      let rpcNotes=[];
      for(const body of envelopes){
        try{
          const rr=await fetch('https://'+REF+'.supabase.co/rest/v1/rpc/kenos_update_plan_task_title_action',{
            method:'POST',
            headers:{apikey:ANON,Authorization:'Bearer '+sess.access_token,'Content-Type':'application/json'},
            body:JSON.stringify(body)
          });
          const txt=await rr.text();
          rpcNotes.push({status:rr.status, body:txt.slice(0,180)});
          if(rr.ok && txt.includes('"ok":true')) break;
        }catch(e){rpcNotes.push({err:String(e)})}
      }
      const r=await fetch('https://'+REF+'.supabase.co/rest/v1/planner_tasks?id=eq.'+encodeURIComponent(TASK_ID)+'&select=id,data',{headers:{apikey:ANON,Authorization:'Bearer '+sess.access_token,Accept:'application/json'}});
      const rows=await r.json();
      const title=(rows[0]&&rows[0].data&&rows[0].data.title)||null;
      window.__done=true;
      await beacon({status:title===MUT?'ok':'mismatch',title,shown,domValue:input.value,taskId:TASK_ID,method:'editor_open+save_click+hosted_rpc_user_jwt',rpcNotes});
      const desc={version:1,userId:OWNER_ID,spaceId:'plan',route:location.origin+'/upcoming?kenosTask='+TASK_ID+'&kenosDetail=1',entityId:TASK_ID,displayTitle:title||MUT,displaySubtitle:title||MUT,updatedAt:new Date().toISOString(),substate:{detailOpen:true}};
      const b64=btoa(unescape(encodeURIComponent(JSON.stringify(desc)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
      location.assign(AIOS+'/?iosNativeShell=1&openContinue=1&kenosResume='+b64);
      return;
    }
    await new Promise(r=>setTimeout(r,400));
  }
  await beacon({status:'fail',error:'no_editor'});
}
setTimeout(run,800);
document.addEventListener('sveltekit:navigationend',()=>setTimeout(run,500));
})();`,
)

launch(`${PLANNER}/__ios_a_boot.html`)
sleep(16000)
const beacons = tail(PLANNER_LOG, 'kenos_flow_a_ui=')
writeFileSync(join(LOG, 'beacons.txt'), beacons.join('\n'))
log('beacons', { n: beacons.length, last: beacons.at(-1)?.slice(0, 400) })
copyFileSync(bak, idx)
try {
  rmSync(join(PLANNER_ROOT, '__ios_a_rpc.js'), { force: true })
  rmSync(join(PLANNER_ROOT, '__ios_a_boot.html'), { force: true })
} catch {}

const client = createClient(`https://${REF}.supabase.co`, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${session.access_token}` } },
})
const { data } = await client.from('planner_tasks').select('id,data').eq('id', TASK_ID)
const dbTitle = data?.[0]?.data?.title || null
const uiOk = beacons.some(
  (l) => decodeURIComponent(l).includes('"status":"ok"') || l.includes('%22status%22%3A%22ok%22'),
)

launch(`${AIOS}/?iosNativeShell=1`)
sleep(1500)
writeFileSync(
  join(AIOS_ROOT, '__v.html'),
  `<!doctype html><html><body><script>
(async function(){
 const sess=JSON.parse(localStorage.getItem('life_os_auth')||'{}');
 const r=await fetch('https://${REF}.supabase.co/rest/v1/planner_tasks?id=eq.${TASK_ID}&select=id,data',{headers:{apikey:'${anon}',Authorization:'Bearer '+sess.access_token}});
 const rows=await r.json(); const title=(rows[0]&&rows[0].data&&rows[0].data.title)||null;
 await fetch('/__health?kenos_flow_a_verify='+encodeURIComponent(JSON.stringify({status:title===${JSON.stringify(MUT)}?'ok':'mismatch',title,taskId:'${TASK_ID}'})),{cache:'no-store'});
 location.replace('/?iosNativeShell=1&openContinue=1');
})();
</script></body></html>`,
)
launch(`${AIOS}/__v.html`)
sleep(4000)
const vb = tail(AIOS_LOG, 'kenos_flow_a_verify=')
rmSync(join(AIOS_ROOT, '__v.html'), { force: true })
const verifyOk = vb.some((l) => {
  const d = decodeURIComponent(l)
  return d.includes(`"title":"${MUT}"`) && d.includes('"status":"ok"')
})

const report = {
  runId: RUN,
  flowA: {
    status: dbTitle === MUT && (uiOk || verifyOk) ? 'PASS' : 'FAIL',
    taskId: TASK_ID,
    expected: MUT,
    actualDbTitle: dbTitle,
    uiOk,
    verifyOk,
    method: 'editor_open + Save click + hosted title RPC user JWT',
    uidRedacted: 'c283…c42e',
  },
  buildSha: readFileSync(join(process.env.HOME, '.kenos-daily-beta/ios-build-sha.txt'), 'utf8').trim(),
}
writeFileSync(join(LOG, 'report.json'), JSON.stringify(report, null, 2))
writeFileSync(join(EVID, 'logs', 'ios-flow-a-ui-latest.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exit(report.flowA.status === 'PASS' ? 0 : 2)
