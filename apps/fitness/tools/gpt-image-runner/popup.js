import { JOBS } from './queue.js'

const ST_LABEL = { pending: '待跑', running: '生成中…', done: '完成', failed: '失败', ratelimited: '限流' }

async function render() {
  const s = await chrome.storage.local.get({
    intervalMin: 10, paused: true, backoffUntil: 0, todayCount: 0, dailyCap: 20, jobState: {}, logs: [], running: null,
  })
  document.getElementById('interval').value = s.intervalMin
  const pending = JOBS.filter((j) => (s.jobState[j.id]?.status || 'pending') === 'pending').length
  const backoff = Date.now() < s.backoffUntil ? ` · 退避至 ${new Date(s.backoffUntil).toLocaleTimeString()}` : ''
  const runningTxt = s.running ? ` · 正在跑 ${s.running.id}` : ''
  document.getElementById('meta').textContent =
    `${s.paused ? 'II 已暂停' : '> 运行中'} · 待跑 ${pending}/${JOBS.length} · 今日 ${s.todayCount}/${s.dailyCap}${runningTxt}${backoff}\n产出在 下载/kenos-train/<日期>/<id>.png`
  const ul = document.getElementById('jobs')
  ul.innerHTML = ''
  for (const j of JOBS) {
    const st = s.jobState[j.id]?.status || 'pending'
    const li = document.createElement('li')
    const name = document.createElement('span')
    name.textContent = `${j.id} ${j.name}`
    const right = document.createElement('span')
    right.className = 'st ' + st
    right.textContent = ST_LABEL[st] || st
    li.append(name, right)
    if (st === 'failed' || st === 'done') {
      const retry = document.createElement('button')
      retry.textContent = '重跑'
      retry.onclick = () => ctl('resetJob', { id: j.id })
      li.append(retry)
      if (s.jobState[j.id]?.error) li.title = s.jobState[j.id].error
    }
    ul.append(li)
  }
  document.getElementById('logs').textContent = (s.logs || []).slice(-8).join('\n')
}

function ctl(cmd, extra = {}) {
  chrome.runtime.sendMessage({ type: 'CONTROL', cmd, ...extra }).catch(() => {})
  setTimeout(render, 400)
}
document.getElementById('start').onclick = () => ctl('start')
document.getElementById('pause').onclick = () => ctl('pause')
document.getElementById('runNow').onclick = () => ctl('runNow')
document.getElementById('clearStuck').onclick = () => ctl('clearStuck')
document.getElementById('interval').onchange = (e) => ctl('setInterval', { value: e.target.value })

render()
setInterval(render, 2000)
