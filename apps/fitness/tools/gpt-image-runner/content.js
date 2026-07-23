// ChatGPT 页面驱动器：附参考图 → 填 prompt → 发送 → 等生成完成 → 回传图片
//
// 选择器基线（2026-07 实测，改版时只需改这里）：
//   composer   #prompt-textarea（ProseMirror contenteditable）
//   发送键     #composer-submit-button / [data-testid="send-button"]（aria「发送提示」）
//   停止键     [data-testid="stop-button"] / aria 含「停止」（生成中出现）
//   助手消息   [data-message-author-role="assistant"]
//   登录判定   [data-testid="login-button"] 存在 = 未登录
//   附件缩略   form 内 img[src*="backend-api"]，隐藏 input[type=file] 作兜底
;(() => {
  if (window.__kenosRunnerLoaded) return
  window.__kenosRunnerLoaded = true

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  async function waitFor(fn, timeoutMs, everyMs = 800) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      try { const v = fn(); if (v) return v } catch {}
      await sleep(everyMs)
    }
    return null
  }

  const $composer = () => document.querySelector('#prompt-textarea')
  const $send = () => document.querySelector('#composer-submit-button, [data-testid="send-button"]')
  const $stop = () =>
    document.querySelector('[data-testid="stop-button"], button[aria-label*="停止"], button[aria-label*="Stop"]')
  const isLoggedOut = () =>
    !!document.querySelector('[data-testid="login-button"]') || /\/auth\/login/.test(location.pathname)

  function attachmentCount() {
    const form = document.querySelector('form')
    if (!form) return 0
    return [...form.querySelectorAll('img')].filter((i) => (i.src || '').includes('backend-api')).length
  }

  // 首选合成 paste；若没出缩略图,兜底走隐藏 file input
  async function attachImage(url, name, expectAtLeast) {
    const blob = await fetch(url).then((r) => r.blob())
    const file = new File([blob], name, { type: blob.type || 'image/png' })

    const composer = $composer()
    composer?.focus()
    const dt = new DataTransfer()
    dt.items.add(file)
    const evt = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(evt, 'clipboardData', { value: dt })
    composer.dispatchEvent(evt)

    const ok = await waitFor(() => attachmentCount() >= expectAtLeast, 15000)
    if (ok) return true

    // 兜底：直接塞进 file input 并触发 change
    const input = document.querySelector('input[type="file"]')
    if (input) {
      const dt2 = new DataTransfer()
      dt2.items.add(file)
      input.files = dt2.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return await waitFor(() => attachmentCount() >= expectAtLeast, 20000)
    }
    return false
  }

  function lastAssistantEl() {
    const els = document.querySelectorAll('[data-message-author-role="assistant"]')
    return els.length ? els[els.length - 1] : null
  }

  function extractResultImage(el) {
    if (!el) return null
    const container = el.closest('article') || el
    const imgs = [...container.querySelectorAll('img')]
      .filter((i) => i.naturalWidth > 256 && /^(https?:|blob:)/.test(i.src))
      // 排除头像/图标类小图
      .filter((i) => !/avatar|icon|profile/i.test(i.src))
    imgs.sort((a, b) => b.naturalWidth - a.naturalWidth)
    return imgs[0] ? imgs[0].src : null
  }

  const LIMIT_RE =
    /(达到|已达上限|限额|次数已用|额度|稍后再试|请稍后|明天再|too many|rate limit|reached your|limit for|usage limit|come back|try again later|please wait)/i

  async function runJob(job) {
    if (isLoggedOut()) return { ok: false, error: 'ChatGPT 未登录' }

    const composer = await waitFor($composer, 25000)
    if (!composer) return { ok: false, error: '找不到输入框（页面未就绪或已改版）' }

    const baseAssistants = document.querySelectorAll('[data-message-author-role="assistant"]').length

    // 1. 依次附参考图（顺序：三视图 → 构图锚）
    for (let i = 0; i < job.refs.length; i++) {
      const ok = await attachImage(job.refs[i], i === 0 ? 'turnaround.png' : 'anchor.jpg', i + 1)
      if (!ok) return { ok: false, error: `第 ${i + 1} 张参考图上传失败` }
      await sleep(1000)
    }
    await sleep(2000) // 让上传态稳定

    // 2. 填 prompt（人手节奏）
    composer.focus()
    document.execCommand('selectAll')
    document.execCommand('delete')
    document.execCommand('insertText', false, job.prompt)
    await sleep(700 + Math.random() * 1200)

    // 3. 发送
    const send = await waitFor(() => { const b = $send(); return b && !b.disabled ? b : null }, 15000)
    if (!send) return { ok: false, error: '发送按钮不可用（prompt 或附件未就绪）' }
    send.click()

    // 4. 等生成：停止键消失 + 新助手消息里出现大图
    await sleep(4000)
    const done = await waitFor(() => {
      if ($stop()) return null // 仍在生成
      const el = lastAssistantEl()
      if (!el) return null
      const count = document.querySelectorAll('[data-message-author-role="assistant"]').length
      if (count <= baseAssistants) return null
      const text = el.textContent || ''
      if (LIMIT_RE.test(text)) return { limited: true }
      const img = extractResultImage(el)
      if (img) return { img }
      // 有实质文字但没图 → 判为拒绝/纯文字回复
      if (text.trim().length > 40) return { textOnly: text.slice(0, 200) }
      return null
    }, 10 * 60 * 1000, 3000)

    if (!done) return { ok: false, error: '等待生成超时' }
    if (done.limited) return { ok: false, rateLimited: true, error: '疑似触发频率限制' }
    if (done.textOnly) return { ok: false, error: '只回文字没出图: ' + done.textOnly }

    // 5. 取图：https 直链交后台带 cookie 下载(轻);blob 或取直链失败则转 dataURL
    if (/^https:/.test(done.img)) {
      try {
        const blob = await fetch(done.img).then((r) => r.blob())
        if (blob.size > 0 && blob.size < 40 * 1024 * 1024) {
          return { ok: true, imageUrl: done.img, dataUrl: await blobToDataUrl(blob) }
        }
      } catch {}
      return { ok: true, imageUrl: done.img }
    }
    // blob: URL 只能在页面上下文取
    try {
      const blob = await fetch(done.img).then((r) => r.blob())
      return { ok: true, dataUrl: await blobToDataUrl(blob) }
    } catch (e) {
      return { ok: false, error: '取图失败: ' + e.message }
    }
  }

  const blobToDataUrl = (blob) =>
    new Promise((res, rej) => {
      const fr = new FileReader()
      fr.onload = () => res(fr.result)
      fr.onerror = rej
      fr.readAsDataURL(blob)
    })

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== 'RUN_JOB') return
    sendResponse?.({ ack: true }) // 立刻确认收到,避免后台派发误判失败
    runJob(msg.job)
      .then((r) => chrome.runtime.sendMessage({ type: 'JOB_RESULT', id: msg.job.id, ...r }))
      .catch((e) => chrome.runtime.sendMessage({ type: 'JOB_RESULT', id: msg.job.id, ok: false, error: String(e) }))
    return true
  })
})()
