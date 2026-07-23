// 调度中枢（MV3 韧性版）：chrome.alarms 定时 → 找/开 ChatGPT 标签 → 派发 job → 收结果 → 下载
//
// 关键设计：service worker 随时可能被杀死并重启，所以【所有运行态都落 chrome.storage】，
// 内存不持有权威状态；超时用 alarm 看门狗而非 setTimeout（后者活不过 SW 重启）。
//
// 频率策略（保守，避开限流而非对抗）：
//   - 同一时刻最多 1 个 job；默认 10 分钟/张 ± 25% 抖动
//   - 疑似限流 → 该张退回队列，自动退避 60 分钟
//   - 每日上限（默认 20 张），到量停到次日
import { JOBS, buildPrompt } from './queue.js'

const DEFAULTS = {
  intervalMin: 10,
  dailyCap: 20,
  paused: true,
  backoffUntil: 0,
  todayCount: 0,
  todayKey: '',
  running: null, // { id, startedAt, tabId } — 权威运行态,落 storage
  jobState: {}, // id -> { status, error?, file?, at? }
}

const JOB_TIMEOUT_MS = 12 * 60 * 1000 // 单张最长 12 分钟(含上传+生成)
const WATCHDOG_MIN = 1 // 看门狗每分钟巡一次

async function getState() {
  const s = await chrome.storage.local.get(DEFAULTS)
  let dirty = false
  for (const j of JOBS) if (!s.jobState[j.id]) { s.jobState[j.id] = { status: 'pending' }; dirty = true }
  if (dirty) await chrome.storage.local.set({ jobState: s.jobState })
  return s
}
const setState = (patch) => chrome.storage.local.set(patch)

function todayKeyNow() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
const jitteredDelayMin = (base) => base * (0.75 + Math.random() * 0.5)

async function scheduleTick(minutes) {
  // Chrome 对 alarm 最小周期约 30s;低于 0.5min 会被上调,这里保底 0.5
  chrome.alarms.create('tick', { delayInMinutes: Math.max(0.5, minutes) })
}

async function updateBadge() {
  const s = await getState()
  const pending = JOBS.filter((j) => s.jobState[j.id].status === 'pending').length
  await chrome.action.setBadgeText({ text: s.paused ? 'II' : String(pending || 'OK') })
  await chrome.action.setBadgeBackgroundColor({ color: s.paused ? '#999' : '#1a7f37' })
}

async function ensureChatTab() {
  const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' })
  let tab = tabs.find((t) => !t.discarded) || tabs[0]
  if (!tab) tab = await chrome.tabs.create({ url: 'https://chatgpt.com/', active: false })
  // 每个 job 用全新会话:非首页则回首页(参考图随消息重新附带,job 自包含)
  if (!tab.url || !/^https:\/\/chatgpt\.com\/?(\?.*)?$/.test(tab.url)) {
    await chrome.tabs.update(tab.id, { url: 'https://chatgpt.com/' })
    await waitTabComplete(tab.id, 20000)
  }
  return tab
}

function waitTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const poll = async () => {
      try {
        const t = await chrome.tabs.get(tabId)
        if (t.status === 'complete') return setTimeout(resolve, 1500) // 让前端 hydrate
      } catch { return resolve() }
      if (Date.now() - t0 > timeoutMs) return resolve()
      setTimeout(poll, 500)
    }
    poll()
  })
}

async function runNextJob(manual = false) {
  const s = await getState()
  if (s.running) return log(`已有 job 在跑(${s.running.id})，跳过`)
  if (!manual && s.paused) return
  if (Date.now() < s.backoffUntil) {
    const mins = Math.ceil((s.backoffUntil - Date.now()) / 60000)
    log(`限流退避中，还剩 ${mins} 分钟`)
    if (!manual) await scheduleTick(mins + 1)
    return
  }
  // 日配额滚动
  const tk = todayKeyNow()
  if (s.todayKey !== tk) { await setState({ todayKey: tk, todayCount: 0 }); s.todayCount = 0 }
  if (s.todayCount >= s.dailyCap) return log('已达今日上限，明天继续')

  const job = JOBS.find((j) => s.jobState[j.id].status === 'pending')
  if (!job) {
    log('队列全部完成 ✓')
    await setState({ paused: true })
    await updateBadge()
    return
  }

  s.jobState[job.id] = { status: 'running', at: Date.now() }
  const tab = await ensureChatTab()
  await setState({ running: { id: job.id, startedAt: Date.now(), tabId: tab.id }, jobState: s.jobState })
  await updateBadge()
  log(`开始 ${job.id} ${job.name}`)

  const payload = {
    type: 'RUN_JOB',
    job: {
      id: job.id,
      prompt: buildPrompt(job),
      refs: [chrome.runtime.getURL('refs/turnaround.png'), chrome.runtime.getURL('refs/' + job.anchor)],
    },
  }
  const dispatched = await dispatchWithRetry(tab.id, payload)
  if (!dispatched) return finishJob(job.id, { ok: false, error: 'content script 派发失败(标签未就绪?)' })
  // 看门狗接管超时
  chrome.alarms.create('watchdog', { periodInMinutes: WATCHDOG_MIN, delayInMinutes: WATCHDOG_MIN })
}

async function dispatchWithRetry(tabId, payload) {
  for (let i = 0; i < 2; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, payload)
      return true
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
        await new Promise((r) => setTimeout(r, 800))
      } catch { return false }
    }
  }
  return false
}

async function finishJob(id, result) {
  const s = await getState()
  if (!s.running || s.running.id !== id) return // 陈旧/重复结果,忽略
  await chrome.alarms.clear('watchdog')

  if (result.ok) {
    const day = todayKeyNow().replace(/-/g, '')
    const filename = `kenos-train/${day}/${id}.png`
    try {
      await chrome.downloads.download({
        url: result.dataUrl || result.imageUrl,
        filename,
        conflictAction: 'uniquify',
      })
      s.jobState[id] = { status: 'done', file: filename, at: Date.now() }
      log(`完成 ${id} → ${filename}`)
    } catch (e) {
      s.jobState[id] = { status: 'done', error: '生成成功但下载失败: ' + e.message, at: Date.now() }
      log(`${id} 下载失败: ${e.message}`)
    }
    await setState({ jobState: s.jobState, running: null, todayCount: s.todayCount + 1 })
    if (!s.paused) await scheduleTick(jitteredDelayMin(s.intervalMin))
  } else if (result.rateLimited) {
    s.jobState[id] = { status: 'pending' } // 退回队列
    const until = Date.now() + 60 * 60 * 1000
    await setState({ jobState: s.jobState, running: null, backoffUntil: until })
    log(`检测到限流，退避 60 分钟（${id} 退回队列）`)
    if (!s.paused) await scheduleTick(61)
  } else {
    s.jobState[id] = { status: 'failed', error: result.error, at: Date.now() }
    await setState({ jobState: s.jobState, running: null })
    log(`失败 ${id}: ${result.error}`)
    if (!s.paused) await scheduleTick(jitteredDelayMin(s.intervalMin))
  }
  await updateBadge()
}

async function watchdogCheck() {
  const s = await getState()
  if (!s.running) { await chrome.alarms.clear('watchdog'); return }
  if (Date.now() - s.running.startedAt > JOB_TIMEOUT_MS) {
    log(`看门狗：${s.running.id} 超时（>12 分钟），标失败`)
    await finishJob(s.running.id, { ok: false, error: '超时（12 分钟无结果，可能页面卡住或未登录）' })
  }
}

function log(msg) {
  console.log('[runner]', msg)
  chrome.storage.local.get({ logs: [] }).then(({ logs }) => {
    logs.push(`${new Date().toLocaleTimeString()} ${msg}`)
    chrome.storage.local.set({ logs: logs.slice(-60) })
  })
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'JOB_RESULT') {
    finishJob(msg.id, msg).then(() => sendResponse?.({ ok: true }))
    return true // 异步响应
  }
  if (msg.type === 'CONTROL') {
    ;(async () => {
      if (msg.cmd === 'start') {
        await setState({ paused: false })
        await runNextJob()
      } else if (msg.cmd === 'pause') {
        await setState({ paused: true })
        await chrome.alarms.clear('tick')
      } else if (msg.cmd === 'runNow') {
        await runNextJob(true)
      } else if (msg.cmd === 'resetJob' && msg.id) {
        const s = await getState()
        // 若正卡在该 job,一并清运行态
        const patch = { jobState: { ...s.jobState, [msg.id]: { status: 'pending' } } }
        if (s.running?.id === msg.id) { patch.running = null; await chrome.alarms.clear('watchdog') }
        await setState(patch)
      } else if (msg.cmd === 'clearStuck') {
        await setState({ running: null, backoffUntil: 0 })
        await chrome.alarms.clear('watchdog')
      } else if (msg.cmd === 'setInterval' && msg.value) {
        await setState({ intervalMin: Math.max(5, Number(msg.value)) })
      }
      await updateBadge()
      sendResponse?.({ ok: true })
    })()
    return true
  }
})

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'tick') runNextJob()
  else if (a.name === 'watchdog') watchdogCheck()
})

// SW 冷启动自检:若有残留 running 但看门狗没了,补挂上
chrome.runtime.onStartup.addListener(reconcile)
chrome.runtime.onInstalled.addListener(reconcile)
async function reconcile() {
  const s = await getState()
  if (s.running) chrome.alarms.create('watchdog', { periodInMinutes: WATCHDOG_MIN, delayInMinutes: WATCHDOG_MIN })
  await updateBadge()
}
reconcile()
