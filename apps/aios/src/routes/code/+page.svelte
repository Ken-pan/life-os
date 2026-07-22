<script>
  import { onMount } from 'svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import {
    isNative,
    executeNativeTool,
    readCursorSessionsDirect,
    readCursorThreadDeltaDirect,
    searchCursorDirect,
  } from '$lib/native.js'
  import { isIosNativeShell } from '$lib/kenos/iosNativeShell.js'
  import { renderMarkdown, renderMarkdownStreaming } from '$lib/markdown.js'
  import {
    bridgeHealth,
    clearBridgeConfig,
    discoverBridge,
    getBridgeConfig,
    publishBridgeEndpoint,
    remoteSearch,
    remoteSend,
    remoteSessions,
    remoteThreadDelta,
    remoteWaitChange,
    setBridgeConfig,
  } from '$lib/kenos/cursorRemote.js'

  const nativeShell = isNative
  // Code 只在壳内(Mac Tauri / iOS WKWebView);普通浏览器一律不可用(demo 仅 localhost 开发用)。
  const iosShell = isIosNativeShell()

  /* 模式:native(Mac 直读)> remote(iOS 壳经局域网桥)> connect(iOS 壳未配对)>
   *      demo(localhost 开发预览)> blocked(普通浏览器,不可用)。 */
  const urlParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const isLocalhostHost =
    typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const demoForced = urlParams.get('demo') === '1'
  const demoAllowed = !nativeShell && isLocalhostHost && urlParams.get('demo') !== '0'
  let bridgeCfg = $state(/** @type {{ host: string, token: string } | null} */ (null))
  const mode = $derived(
    nativeShell
      ? 'native'
      : iosShell && bridgeCfg && !demoForced
        ? 'remote'
        : iosShell && !demoForced
          ? 'connect'
          : demoAllowed
            ? 'demo'
            : 'blocked',
  )
  // blocked 是「普通浏览器不可用」提示态;其余都是可交互态。
  const enabled = $derived(mode !== 'blocked')

  // —— 连接 Mac(remote 配对) ——
  let bridgeHost = $state('')
  let bridgeToken = $state('')
  let connecting = $state(false)
  let connectError = $state('')
  /** 云端自动发现进行中(登录态拉端点 + 探活)。 */
  let discovering = $state(false)
  async function autoDiscover() {
    if (discovering) return
    discovering = true
    try {
      const found = await discoverBridge()
      if (found.ok) {
        bridgeCfg = getBridgeConfig()
        void loadSessions()
      }
    } finally {
      discovering = false
    }
  }
  async function connectBridge() {
    const host = bridgeHost.trim()
    const token = bridgeToken.trim()
    if (!host || !token || connecting) return
    connecting = true
    connectError = ''
    try {
      const health = await bridgeHealth(host)
      if (!health.ok) {
        connectError = `连不上 ${host}:${health.error}。确认 Mac 在同一网络并已运行 cursor-bridge。`
        return
      }
      setBridgeConfig({ host, token })
      const probe = await remoteSessions({ limit: 1 })
      if (probe.state.status === 'unavailable') {
        clearBridgeConfig()
        connectError = `已连上 Mac,但配对码不对:${probe.state.message}`
        return
      }
      bridgeCfg = getBridgeConfig()
      void loadSessions()
    } finally {
      connecting = false
    }
  }
  function disconnectBridge() {
    clearBridgeConfig()
    bridgeCfg = null
    sessions = []
    activeId = null
    thread = null
  }

  // —— 左栏:会话列表 ——
  let sessions = $state(/** @type {Array<any>} */ ([]))
  let sessionsState = $state(/** @type {any} */ (null))
  let loadingSessions = $state(false)
  let query = $state('')

  // —— 右栏:选中会话消息流(增量同步) ——
  let activeId = $state(/** @type {string | null} */ (null))
  let thread = $state(/** @type {any} */ (null))
  let threadError = $state('')
  let loadingThread = $state(false)
  /** 当前会话已见过的全部 bubbleId(含空气泡),增量拉取的基线。 */
  let seenIds = /** @type {string[]} */ ([])
  /** 会话缓存:切换秒开,再静默增量刷新。 */
  const threadCache = new Map()
  /** 最近 4s 内有新内容 → 视为「直播中」,轮询提速 + UI 显示同步点。 */
  let live = $state(false)
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let liveTimer
  function markLive() {
    live = true
    clearTimeout(liveTimer)
    liveTimer = setTimeout(() => (live = false), 4000)
  }
  let threadBusy = false
  /** 加载在飞时到来的最新加载意图(快速切会话竞态);飞行完成后补跑。 */
  let pendingThreadLoad = /** @type {{ id: string, silent: boolean } | null} */ (null)
  /** 连续失败计数:≥3 时轮询退避到 15s(Mac 睡眠/离开局域网时省电),恢复即回正常节奏。 */
  let failStreak = 0

  // —— composer:一个输入框,Enter 发送,没有模式 ——
  let draft = $state('')
  let sending = $state(false)
  let sendError = $state('')
  /** 新对话状态:发送时在 Cursor 里开新会话。 */
  let composingNew = $state(false)
  /** 乐观回显:刚发出、还没在同步流里看到的消息。 */
  let pending = $state(/** @type {{ text: string, at: number } | null} */ (null))
  let draftEl = $state(/** @type {HTMLTextAreaElement | null} */ (null))

  const activeTitle = $derived(
    composingNew ? '新对话' : thread?.title || sessions.find((s) => s.id === activeId)?.title || '',
  )

  /* —— agent 工作步骤(工具调用)聚合:连续 tool 消息折叠成一条过程行 —— */
  const TOOL_LABELS = {
    read_file_v2: '读文件',
    edit_file_v2: '改文件',
    run_terminal_command_v2: '跑命令',
    ripgrep_raw_search: '搜索代码',
    glob_file_search: '找文件',
    todo_write: '更新任务清单',
    task_v2: '子任务',
    web_search: '搜网页',
    create_plan: '制定计划',
    switch_mode: '切换模式',
    await: '等待',
    get_mcp_tools: '加载 MCP 工具',
  }
  function toolLabel(name) {
    if (TOOL_LABELS[name]) return TOOL_LABELS[name]
    if (typeof name === 'string' && name.startsWith('mcp-')) return 'MCP 调用'
    return name || '步骤'
  }
  function stepsSummary(steps) {
    const counts = new Map()
    for (const s of steps) {
      const l = toolLabel(s.tool)
      counts.set(l, (counts.get(l) || 0) + 1)
    }
    return [...counts].map(([l, n]) => (n > 1 ? `${l} ×${n}` : l)).join(' · ')
  }
  /** 展开的步骤组(bubbleId 列表;重赋值驱动响应)。 */
  let expandedSteps = $state(/** @type {string[]} */ ([]))
  function toggleSteps(id) {
    expandedSteps = expandedSteps.includes(id)
      ? expandedSteps.filter((x) => x !== id)
      : [...expandedSteps, id]
  }
  /** 渲染列表:文本消息原样,连续工具步骤聚合成 {kind:'steps'}。 */
  const displayMessages = $derived.by(() => {
    const out = []
    for (const m of thread?.messages ?? []) {
      if (m.tool && !m.text) {
        const step = { tool: m.tool, arg: m.arg, failed: m.failed }
        const last = out.at(-1)
        if (last?.kind === 'steps') {
          last.steps.push(step)
          if (step.failed) last.hasFailure = true
          continue
        }
        out.push({
          kind: 'steps',
          bubbleId: `steps-${m.bubbleId}`,
          steps: [step],
          hasFailure: Boolean(step.failed),
        })
      } else {
        out.push({ kind: 'msg', m })
      }
    }
    return out
  })

  /* —— markdown 代码块复制(renderMarkdown 产出 [data-md-copy] 按钮,委托处理) —— */
  async function onMessagesClick(event) {
    const copyBtn = event.target?.closest?.('[data-md-copy]')
    if (!copyBtn) return
    const code = copyBtn.closest('.md-code')?.querySelector('code')?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(code)
      copyBtn.textContent = '✓'
      setTimeout(() => (copyBtn.textContent = '⧉'), 1500)
    } catch {
      /* 剪贴板不可用就算了 */
    }
  }

  /* —— 演示数据(仅 localhost 网页预览;结构与真投影同形) —— */
  const DEMO_NOW = Date.now()
  let demoSessions = [
    { id: 'demo-1', title: 'Fix flaky sync test in planner', updatedAt: DEMO_NOW - 40_000, archived: false, source: 'local' },
    { id: 'demo-2', title: 'Refactor chart palette generator', updatedAt: DEMO_NOW - 32 * 60_000, archived: false, source: 'local' },
    { id: 'demo-3', title: 'HomeOS rescan contract review', updatedAt: DEMO_NOW - 5 * 3_600_000, archived: false, source: 'local' },
    { id: 'demo-4', title: 'Add dark-mode tokens to portal', updatedAt: DEMO_NOW - 2 * 86_400_000, archived: true, source: 'local' },
  ]
  const demoThreads = {
    'demo-1': {
      id: 'demo-1',
      title: 'Fix flaky sync test in planner',
      status: 'completed',
      createdAt: DEMO_NOW - 3_600_000,
      meta: { model: 'grok-4.5', effort: 'high', fast: true, mode: 'agent', contextPct: 71, subagents: 2, workspace: 'life-os' },
      messages: [
        { bubbleId: 'd1', role: 'user', text: 'planner 的 sync.spec 又开始随机红了,帮我查一下是不是竞态。', ts: DEMO_NOW - 3_500_000 },
        {
          bubbleId: 'd2',
          role: 'assistant',
          text: '看了失败日志,是 **落盘防抖** 与断言的竞态:\n\n- 测试写入后立即读 `localStorage`,但持久化有 400ms 防抖\n- CI 慢机器上防抖窗口内断言就跑完了\n\n修法是把断言改成轮询:\n\n```js\nawait expect.poll(() => readStore().tasks.length, { timeout: 2000 }).toBe(3)\n```\n\n我已经更新了 `sync.spec.js` 的三处断言。',
          ts: DEMO_NOW - 3_400_000,
        },
        { bubbleId: 'd3', role: 'user', text: '好,顺便把其他 spec 里同样写法的也一起扫掉。', ts: DEMO_NOW - 120_000 },
        { bubbleId: 'dt1', role: 'assistant', tool: 'ripgrep_raw_search', arg: 'expect\\(.*\\)\\.toBe', text: '', ts: DEMO_NOW - 110_000 },
        { bubbleId: 'dt2', role: 'assistant', tool: 'read_file_v2', arg: 'tests/sync.spec.js', text: '', ts: DEMO_NOW - 100_000 },
        { bubbleId: 'dt3', role: 'assistant', tool: 'read_file_v2', arg: 'tests/shelf.spec.js', text: '', ts: DEMO_NOW - 95_000 },
        { bubbleId: 'dt4', role: 'assistant', tool: 'edit_file_v2', arg: 'tests/sync.spec.js', text: '', ts: DEMO_NOW - 90_000 },
        { bubbleId: 'dt5', role: 'assistant', tool: 'edit_file_v2', arg: 'tests/plan-edit.spec.js', text: '', ts: DEMO_NOW - 80_000 },
        { bubbleId: 'dt6', role: 'assistant', tool: 'run_terminal_command_v2', arg: 'npx playwright test tests/', failed: true, text: '', ts: DEMO_NOW - 70_000 },
        { bubbleId: 'dt7', role: 'assistant', tool: 'run_terminal_command_v2', arg: 'npx playwright test tests/ --retries=1', text: '', ts: DEMO_NOW - 60_000 },
        {
          bubbleId: 'd4',
          role: 'assistant',
          text: '扫描完成,共 5 处同型写法:\n\n| 文件 | 处数 | 状态 |\n| --- | --- | --- |\n| sync.spec.js | 3 | 已修 |\n| plan-edit.spec.js | 1 | 已修 |\n| shelf.spec.js | 1 | 已修 |\n\n全量跑了一遍,**31/31 绿**。',
          ts: DEMO_NOW - 40_000,
        },
      ],
    },
    'demo-2': {
      id: 'demo-2',
      title: 'Refactor chart palette generator',
      status: 'aborted',
      createdAt: DEMO_NOW - 2 * 86_400_000,
      messages: [
        { bubbleId: 'd5', role: 'user', text: '把 OKLCH 色板生成器抽成纯函数,顺便加 CVD 校验。', ts: DEMO_NOW - 40 * 60_000 },
        { bubbleId: 'd6', role: 'assistant', text: '抽出了 `generatePalette(brandHue, n)`:\n\n1. 锚定品牌色相,等距旋转\n2. 每档跑 CVD ΔE 校验(protanopia / deuteranopia)\n3. 不达标自动微调亮度\n\n还差 tritanopia 一档,你上次中断了任务。', ts: DEMO_NOW - 32 * 60_000 },
      ],
    },
    'demo-3': {
      id: 'demo-3',
      title: 'HomeOS rescan contract review',
      status: 'completed',
      createdAt: DEMO_NOW - 6 * 3_600_000,
      messages: [
        { bubbleId: 'd7', role: 'user', text: '过一遍重扫「变/不变」契约,userEdited 的字段有没有被覆盖风险?', ts: DEMO_NOW - 5.2 * 3_600_000 },
        { bubbleId: 'd8', role: 'assistant', text: '`attrs.userEdited` 的保全链路完整:`carryCanonicalScan` 在户型级白名单里跳过了用户改过的 `kind` / 颜色 / 锁。唯一薄弱点是 **家规字段** 走的旧路径,建议补一条契约测试。', ts: DEMO_NOW - 5 * 3_600_000 },
      ],
    },
    'demo-4': {
      id: 'demo-4',
      title: 'Add dark-mode tokens to portal',
      status: 'completed',
      createdAt: DEMO_NOW - 3 * 86_400_000,
      messages: [
        { bubbleId: 'd9', role: 'user', text: 'portal 缺暗色令牌,补一套。', ts: DEMO_NOW - 2 * 86_400_000 },
        { bubbleId: 'd10', role: 'assistant', text: '已按 Linear 式亮度堆叠补齐 `--surface-*` 暗色档,并在 `data-theme` 两个方向都验证过。', ts: DEMO_NOW - 2 * 86_400_000 },
      ],
    },
  }
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let demoTypeTimer
  /** 演示:把一段回复打字机式流出来,走真实的 live/caret/自动滚底管线。 */
  function demoStream(fullText) {
    clearInterval(demoTypeTimer)
    const tail = thread?.messages?.at(-1)
    if (!tail) return
    const target = fullText ?? tail.text
    tail.text = ''
    let i = 0
    demoTypeTimer = setInterval(() => {
      i = Math.min(target.length, i + 3 + Math.floor(Math.random() * 4))
      tail.text = target.slice(0, i)
      markLive()
      if (i >= target.length) {
        clearInterval(demoTypeTimer)
        thread && (thread.status = 'completed')
      }
    }, 45)
  }

  async function loadSessions({ silent = false } = {}) {
    if (!enabled) return
    if (!silent) loadingSessions = true
    try {
      const q = query.trim()
      if (mode === 'demo') {
        sessions = q
          ? demoSessions.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()))
          : [...demoSessions]
        sessionsState = { status: sessions.length ? 'ready' : 'empty' }
        if (!activeId && !composingNew && sessions.length) selectSession(sessions[0].id)
        return
      }
      if (q) {
        sessions =
          mode === 'native'
            ? await searchCursorDirect({ query: q, limit: 60 })
            : await remoteSearch({ query: q, limit: 60 })
        sessionsState = { status: sessions.length ? 'ready' : 'empty' }
      } else {
        const res =
          mode === 'native'
            ? await readCursorSessionsDirect({ limit: 60 })
            : await remoteSessions({ limit: 60 })
        // 远程变更戳短路:库没动,列表原样。
        if (res.unchanged) return
        // 没变就不重赋值,避免 5s 一次的整列表重渲染。
        const sig = (arr) => arr.map((s) => `${s.id}:${s.updatedAt}:${s.title}`).join('|')
        if (sig(res.items) !== sig(sessions)) sessions = res.items
        sessionsState = res.state
        // 首次载入自动选中最近的会话,直接进入监控态。
        if (!activeId && !composingNew && res.items.length) selectSession(res.items[0].id)
      }
    } finally {
      loadingSessions = false
    }
  }

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let searchTimer
  function onQueryInput() {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => void loadSessions(), 300)
  }

  async function loadThread(id, { silent = false } = {}) {
    if (!enabled || !id) return
    // 已有加载在飞:不丢弃请求(否则快速切会话时新会话永远没人加载,卡骨架屏)。
    // 记下最新意图,飞行中的那次在 finally 里补跑。
    if (threadBusy) {
      pendingThreadLoad = { id, silent }
      return
    }
    if (mode === 'demo') {
      thread = structuredClone(demoThreads[id]) ?? null
      threadError = ''
      demoStream()
      return
    }
    threadBusy = true
    if (!silent) loadingThread = true
    try {
      const deltaOpts = {
        composerId: id,
        prevThread: id === activeId ? thread : null,
        seenBubbleIds: id === activeId ? seenIds : [],
      }
      const res =
        mode === 'native'
          ? await readCursorThreadDeltaDirect(deltaOpts)
          : await remoteThreadDelta(deltaOpts)
      // 回来时用户可能已切走,别把别的会话数据写进当前视图。
      if (id !== activeId) return
      if (res?.error) {
        threadError = res.error
        failStreak++
        // 远程连败(Mac 换 IP / hostname 变了):自动重新云端发现,通了自愈。
        if (mode === 'remote' && failStreak === 6) void autoDiscover()
        return
      }
      failStreak = 0
      // 远程变更戳短路:库没动,消息流原样。
      if (res.unchanged) {
        threadError = ''
        return
      }
      threadError = ''
      const prevTail = thread?.messages?.at(-1)
      const nextTail = res.thread.messages.at(-1)
      const changed =
        !thread ||
        thread.messages.length !== res.thread.messages.length ||
        prevTail?.text !== nextTail?.text ||
        thread.status !== res.thread.status
      if (changed) {
        thread = res.thread
        if (silent) markLive()
      }
      seenIds = res.bubbleIds
      threadCache.set(id, { thread: res.thread, seenIds: res.bubbleIds })
      // 乐观回显的消息已在真实流里出现 → 收回占位。
      if (pending && res.thread.messages.some((m) => m.role === 'user' && m.text === pending.text)) {
        pending = null
      }
    } finally {
      threadBusy = false
      if (id === activeId) loadingThread = false
      // 加载期间用户切了会话:补跑最新意图(或当前 activeId 尚未加载时兜底)。
      const next = pendingThreadLoad
      pendingThreadLoad = null
      if (next && next.id === activeId && next.id !== id) {
        void loadThread(next.id, { silent: next.silent })
      } else if (activeId && activeId !== id && !thread) {
        void loadThread(activeId, { silent: false })
      }
    }
  }

  /** 窄屏两级导航:列表页 ↔ 会话页(桌面双栏并存,此状态被 CSS 忽略)。 */
  let mobileView = $state(/** @type {'list' | 'thread'} */ ('list'))

  function selectSession(id) {
    activeId = id
    composingNew = false
    mobileView = 'thread'
    const cached = threadCache.get(id)
    thread = cached?.thread ?? null
    seenIds = cached?.seenIds ?? []
    threadError = ''
    pinned = true
    void loadThread(id, { silent: !!cached })
  }

  function startNewChat() {
    composingNew = true
    mobileView = 'thread'
    activeId = null
    thread = null
    seenIds = []
    threadError = ''
    pending = null
    clearInterval(demoTypeTimer)
    draftEl?.focus()
  }

  // —— 页面高度:填满滚动容器的剩余高度(上方还有内容驱动高度的 KenosSystemBar) ——
  let pageEl = $state(/** @type {HTMLElement | null} */ (null))
  $effect(() => {
    if (!pageEl || !enabled) return
    const parent = pageEl.parentElement
    if (!parent) return
    const apply = () => {
      const offset =
        pageEl.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop
      pageEl.style.height = `${Math.max(320, parent.clientHeight - offset)}px`
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(parent)
    return () => ro.disconnect()
  })

  // —— 消息流自动滚底(监控场景新消息在底部;用户上翻后不打扰) ——
  let messagesEl = $state(/** @type {HTMLElement | null} */ (null))
  let pinned = true
  function onMessagesScroll() {
    if (!messagesEl) return
    pinned = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 48
  }
  $effect(() => {
    // 依赖条数 + 尾消息长度 + 乐观占位:流式增长(条数不变)也要跟滚。
    const tail = thread?.messages?.at(-1)
    const scrollKey = `${thread?.messages?.length ?? 0}:${tail?.text?.length ?? 0}:${pending ? 1 : 0}`
    if (scrollKey === '0:0:0' || !messagesEl) return
    if (pinned) {
      requestAnimationFrame(() => {
        messagesEl?.scrollTo({ top: messagesEl.scrollHeight })
      })
    }
  })

  // —— markdown 渲染缓存:按 bubbleId+文本缓存 HTML,静止消息零重渲染 ——
  const mdCache = new Map()
  function mdFor(m, streaming) {
    // 直播中的尾消息用流式轻渲染(半截 markdown 不闪烁)+ 光标。
    if (streaming) return renderMarkdownStreaming(m.text, { caret: true })
    const hit = mdCache.get(m.bubbleId)
    if (hit && hit.text === m.text) return hit.html
    if (mdCache.size > 2000) mdCache.clear()
    const html = renderMarkdown(m.text)
    mdCache.set(m.bubbleId, { text: m.text, html })
    return html
  }

  /* —— 送达跟踪:发出后确认消息出现在眼前;进了 Cursor 打开的别的会话就自动跟过去 —— */
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let deliverTimer
  function watchDelivery(prevTopAt) {
    clearInterval(deliverTimer)
    let ticks = 0
    deliverTimer = setInterval(async () => {
      ticks++
      if (!pending) {
        clearInterval(deliverTimer)
        return
      }
      await loadSessions({ silent: true })
      const top = sessions[0]
      // 有会话在我们发送之后更新了、且不是当前在看的 → 消息落在了那边,跟过去。
      if (top && top.updatedAt > prevTopAt && top.id !== activeId) {
        selectSession(top.id)
      }
      if (ticks >= 15) {
        // 超时:消息已注入 Cursor,但没对上回执 —— 明说,别静默吞掉。
        pending = null
        sendError = '已发送,但没有在会话里看到回执 —— 请确认 Mac 未锁屏、Cursor 在运行。'
        clearInterval(deliverTimer)
      }
    }, 1000)
  }

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    sending = true
    sendError = ''
    const wasNew = composingNew
    const prevTopAt = sessions[0]?.updatedAt ?? 0
    try {
      if (mode === 'demo') {
        if (wasNew) {
          const id = `demo-new-${Date.now()}`
          const title = text.slice(0, 24) || '新对话'
          demoThreads[id] = { id, title, status: 'generating', createdAt: Date.now(), messages: [] }
          demoSessions = [{ id, title, updatedAt: Date.now(), archived: false, source: 'local' }, ...demoSessions]
          sessions = [...demoSessions]
          activeId = id
          composingNew = false
          thread = structuredClone(demoThreads[id])
        }
        thread?.messages?.push({ bubbleId: `demo-u-${Date.now()}`, role: 'user', text, ts: Date.now() })
        thread?.messages?.push({ bubbleId: `demo-a-${Date.now()}`, role: 'assistant', text: '', ts: Date.now() })
        thread && (thread.status = 'generating')
        demoStream('收到(演示模式,未真正发给 Cursor)。真实环境下这条会直接进 Cursor,回复会在这里实时流出来。')
        draft = ''
        return
      }
      pending = { text, at: Date.now() }
      draft = ''
      if (mode === 'native') {
        await executeNativeTool('ai_app_send', { app: 'cursor', message: text, new_chat: wasNew })
      } else {
        const r = await remoteSend({ message: text, newChat: wasNew })
        if (r.error) throw new Error(r.error)
      }
      markLive()
      watchDelivery(prevTopAt)
    } catch (err) {
      sendError = `发送失败:${err?.message ?? err}`
      pending = null
      draft = text // 别丢用户输入
    } finally {
      sending = false
    }
  }

  function onDraftKeydown(e) {
    // Enter 发送(Cursor 原生习惯);Shift+Enter 换行;中文输入法确认不误发。
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  function fmtRel(ts) {
    if (!ts) return ''
    const d = Date.now() - ts
    if (d < 60_000) return '刚刚'
    if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`
    if (d < 7 * 86_400_000) return `${Math.floor(d / 86_400_000)} 天前`
    try {
      return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
    } catch {
      return ''
    }
  }

  const STATUS_LABEL = { completed: '已完成', aborted: '已中止', generating: '生成中', unknown: '' }
  const MODE_LABEL = { agent: 'Agent', chat: 'Chat', ask: 'Ask', edit: 'Edit' }
  const EFFORT_LABEL = { high: '高', medium: '中', low: '低', max: '极高' }

  onMount(() => {
    bridgeCfg = getBridgeConfig()
    if (enabled) void loadSessions()
    // Mac(native):把本机桥的配对信息上报云端,手机零手输;桥没起就静默跳过。
    if (mode === 'native') void publishBridgeEndpoint()
    // 未配置:先用登录态云端自动发现,失败落回手动配对卡。
    if (mode === 'connect') void autoDiscover()
    // 实时监控:
    //  - remote:长轮询变化驱动(挂 /events ≤10s,变了立即拉增量)——延迟 ~0.25s,
    //    空闲期请求数比定时轮询降 ~90%;失败退避 + 连败自愈。
    //  - native:自适应定时轮询(本机点查便宜,直播 1s / 空闲 3s)。
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let pollTimer
    const schedulePoll = (delay) => {
      pollTimer = setTimeout(async () => {
        // 只有 native/remote 才轮询;connect(等配对)/demo(自带 stream)/blocked 惰性空转,
        // 直到 mode 变成可轮询态(如自动发现配对成功)。
        if (mode !== 'native' && mode !== 'remote') return schedulePoll(2000)
        if (mode === 'remote') {
          if (document.hidden) return schedulePoll(3000)
          const evt = await remoteWaitChange({ waitMs: 10000 })
          if (evt.error) {
            failStreak++
            // 断连要让人看见,不能静默退避(thread-head 显示重试提示)。
            threadError = evt.error
            if (failStreak === 6) void autoDiscover()
            return schedulePoll(failStreak >= 3 ? 15000 : 2000)
          }
          failStreak = 0
          threadError = ''
          if (evt.changed) {
            if (activeId) await loadThread(activeId, { silent: true })
            if (!query.trim()) void loadSessions({ silent: true })
          }
          return schedulePoll(50) // 变化驱动:立刻挂下一轮等待
        }
        if (mode === 'native' && activeId && !document.hidden) {
          await loadThread(activeId, { silent: true })
        }
        schedulePoll(failStreak >= 3 ? 15000 : live ? 1000 : 3000)
      }, delay)
    }
    schedulePoll(1000)
    // 会话列表静默刷新(native 本机点查;remote 由 /events 变化驱动,不定时打)。
    const listTimer = setInterval(() => {
      if (mode === 'native' && !document.hidden && !query.trim()) {
        void loadSessions({ silent: true })
      }
    }, 5000)
    return () => {
      clearTimeout(pollTimer)
      clearInterval(listTimer)
      clearTimeout(searchTimer)
      clearTimeout(liveTimer)
      clearInterval(deliverTimer)
      clearInterval(demoTypeTimer)
    }
  })
</script>

<div class="code-page" data-domain="code" bind:this={pageEl}>
  {#if mode === 'blocked'}
    <!-- 普通浏览器:Code 只在 Mac / iOS app 内可用 -->
    <section class="code-connect">
      <div class="code-connect-card">
        <strong class="code-connect-title">Code 仅在 App 内可用</strong>
        <p class="code-muted">
          Code 用于监控并远程操控你 Mac 上的 Cursor,只在 <strong>Kenos 的 Mac app</strong> 或
          <strong>iPhone app</strong> 里提供。在普通浏览器中无法使用。
        </p>
      </div>
    </section>
  {:else if mode === 'connect'}
    <!-- iOS 壳未配对:配对卡(自动发现 + 手动填) -->
    <section class="code-connect">
      <div class="code-connect-card">
        <strong class="code-connect-title">连接 Mac</strong>
        {#if discovering}
          <p class="code-muted">正在查找你的 Mac…(已登录设备自动配对)</p>
        {:else}
          <p class="code-muted">
            Code 会实时同步你 Mac 上的 Cursor 对话。Mac 上跑着 aios 时会自动配对;
            也可以手动填桥地址和配对码(Mac 上运行
            <code>npm run agent:cursor-bridge</code> 时打印)。
          </p>
          <button type="button" class="code-btn" onclick={autoDiscover}>
            <Icon name="refresh" size={14} strokeWidth={1.75} /> 重新自动查找
          </button>
        {/if}
        <input
          class="code-connect-input"
          type="text"
          placeholder="Mac 地址,如 kens-mac.local:5273"
          bind:value={bridgeHost}
        />
        <input
          class="code-connect-input"
          type="password"
          placeholder="配对码"
          bind:value={bridgeToken}
          onkeydown={(e) => e.key === 'Enter' && connectBridge()}
        />
        <button
          type="button"
          class="code-connect-btn"
          disabled={connecting || !bridgeHost.trim() || !bridgeToken.trim()}
          onclick={connectBridge}
        >
          {connecting ? '连接中…' : '连接'}
        </button>
        {#if connectError}
          <p class="code-senderror code-connect-error">{connectError}</p>
        {/if}
      </div>
    </section>
  {:else}
    <div class="code-grid" data-mobile-view={mobileView}>
      <!-- 左:会话列表 -->
      <aside class="code-col code-sessions">
        <div class="code-search-row">
          <div class="code-search">
            <Icon name="search" size={14} strokeWidth={1.75} />
            <input
              type="search"
              placeholder="搜索对话…"
              bind:value={query}
              oninput={onQueryInput}
              onkeydown={(e) => e.key === 'Enter' && loadSessions()}
            />
          </div>
          <button
            type="button"
            class="code-btn code-icon"
            class:code-active-btn={composingNew}
            aria-label="新对话"
            onclick={startNewChat}
          >
            <Icon name="plus" size={15} strokeWidth={2} />
          </button>
        </div>
        {#if mode === 'demo'}
          <p class="code-demo-tag">演示数据 · 仅网页预览</p>
        {:else if mode === 'remote'}
          <p class="code-demo-tag">
            已连接 {bridgeCfg?.host}
            <button type="button" class="code-link" onclick={disconnectBridge}>断开</button>
          </p>
        {/if}
        {#if loadingSessions}
          <p class="code-muted">读取会话中…</p>
        {:else if !sessions.length}
          <p class="code-muted">{sessionsState?.status === 'empty' ? '还没有对话。' : sessionsState?.message || '暂无会话。'}</p>
        {:else}
          <ul class="code-list">
            {#each sessions as s (s.id)}
              <li>
                <button
                  type="button"
                  class="code-session"
                  class:code-active={s.id === activeId}
                  onclick={() => selectSession(s.id)}
                >
                  <span class="code-session-title">
                    {#if Date.now() - s.updatedAt < 120000}<span class="code-active-dot" title="刚刚活跃"></span>{/if}{s.title}
                  </span>
                  <span class="code-session-meta">
                    {fmtRel(s.updatedAt)}{s.archived ? ' · 已归档' : ''}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </aside>

      <!-- 右:消息流 + 输入 -->
      <section class="code-col code-thread">
        {#if composingNew}
          <div class="code-thread-head">
            <button type="button" class="code-btn code-icon code-back" aria-label="返回列表" onclick={() => (mobileView = 'list')}>
              <Icon name="chevron-left" size={16} strokeWidth={2} />
            </button>
            <strong class="code-thread-title">新对话</strong>
          </div>
          <div class="code-messages" bind:this={messagesEl} onscroll={onMessagesScroll}>
            {#if pending}
              <div class="code-msg code-user code-pending">
                <p class="code-bubble">{pending.text}</p>
                <span class="code-ts">发送中…</span>
              </div>
            {:else}
              <p class="code-muted code-center">输入第一条消息,开始一个新的 Cursor 对话。</p>
            {/if}
          </div>
        {:else if !activeId}
          <p class="code-muted code-center">选一个对话,或点「+」开始新对话。</p>
        {:else if loadingThread && !thread}
          <!-- 骨架屏:比文字提示更接近最终布局,减少感知等待 -->
          <div class="code-messages code-skeleton" aria-label="读取消息中">
            <div class="code-sk code-sk-user"></div>
            <div class="code-sk code-sk-line"></div>
            <div class="code-sk code-sk-line code-sk-short"></div>
            <div class="code-sk code-sk-user code-sk-late"></div>
            <div class="code-sk code-sk-line"></div>
          </div>
        {:else if thread}
          <div class="code-thread-head">
            <div class="code-thread-head-row">
              <button type="button" class="code-btn code-icon code-back" aria-label="返回列表" onclick={() => (mobileView = 'list')}>
                <Icon name="chevron-left" size={16} strokeWidth={2} />
              </button>
              <strong class="code-thread-title">{activeTitle}</strong>
              <span class="code-thread-meta">
                {#if live}<span class="code-live">●</span>{/if}
                {STATUS_LABEL[thread.status] ?? thread.status}
              </span>
            </div>
            {#if thread.meta}
              <div class="code-chips">
                {#if thread.meta.model}
                  <span class="code-chip code-chip-model">{thread.meta.model}{thread.meta.maxMode ? ' · MAX' : ''}</span>
                {/if}
                {#if thread.meta.mode}<span class="code-chip">{MODE_LABEL[thread.meta.mode] ?? thread.meta.mode}</span>{/if}
                {#if thread.meta.effort}<span class="code-chip">思考 {EFFORT_LABEL[thread.meta.effort] ?? thread.meta.effort}</span>{/if}
                {#if thread.meta.fast}<span class="code-chip">快速</span>{/if}
                {#if thread.meta.subagents}<span class="code-chip">{thread.meta.subagents} 子任务</span>{/if}
                {#if thread.meta.workspace}<span class="code-chip code-chip-ws">{thread.meta.workspace}</span>{/if}
                {#if thread.meta.contextPct != null}
                  <span
                    class="code-chip code-chip-ctx"
                    class:code-chip-ctx-hot={thread.meta.contextPct >= 80}
                    title="上下文窗口用量"
                  >上下文 {thread.meta.contextPct}%</span>
                {/if}
              </div>
            {/if}
          </div>
          <!-- 代码块复制按钮的点击委托;按钮本身可聚焦,容器无键盘语义(同 Message.svelte 范式) -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="code-messages" bind:this={messagesEl} onscroll={onMessagesScroll} onclick={onMessagesClick}>
            {#each displayMessages as item, i (item.bubbleId ?? item.m.bubbleId)}
              {#if item.kind === 'steps'}
                <div class="code-msg">
                  <button
                    type="button"
                    class="code-steps"
                    class:code-steps-failed={item.hasFailure}
                    class:code-steps-running={live && i === displayMessages.length - 1}
                    onclick={() => toggleSteps(item.bubbleId)}
                  >
                    <Icon name="terminal" size={12} strokeWidth={1.75} />
                    {item.steps.length} 步 · {stepsSummary(item.steps)}{item.hasFailure ? ' · 有失败' : ''}
                    <span class="code-steps-chevron" class:code-open={expandedSteps.includes(item.bubbleId)}>
                      <Icon name="chevron-down" size={12} strokeWidth={2} />
                    </span>
                  </button>
                  {#if expandedSteps.includes(item.bubbleId)}
                    <ol class="code-steps-list">
                      {#each item.steps as s, j (j)}
                        <li class:code-step-failed={s.failed}>
                          {toolLabel(s.tool)}
                          <span class="code-steps-raw">{s.arg || s.tool}</span>
                          {#if s.failed}<span class="code-step-fail-tag">失败</span>{/if}
                        </li>
                      {/each}
                    </ol>
                  {/if}
                </div>
              {:else if item.m.role === 'user'}
                <div class="code-msg code-user">
                  <p class="code-bubble">{item.m.text}</p>
                  {#if item.m.ts}<span class="code-ts">{fmtRel(item.m.ts)}</span>{/if}
                </div>
              {:else}
                <div class="code-msg">
                  <!-- eslint-disable-next-line svelte/no-at-html-tags — renderMarkdown 全量转义,只输出白名单标签 -->
                  <div class="code-md">{@html mdFor(item.m, live && i === displayMessages.length - 1)}</div>
                </div>
              {/if}
            {/each}
            {#if pending}
              <div class="code-msg code-user code-pending">
                <p class="code-bubble">{pending.text}</p>
                <span class="code-ts">发送中…</span>
              </div>
            {/if}
          </div>
        {:else if threadError}
          <p class="code-muted code-center">读取失败:{threadError}</p>
        {/if}

        <!-- composer:一个输入框,Enter 发送 -->
        <div class="code-composer">
          <textarea
            class="code-draft"
            rows="1"
            placeholder={composingNew ? '开始新对话…' : '给 Cursor 发消息…'}
            enterkeyhint="send"
            bind:value={draft}
            bind:this={draftEl}
            onkeydown={onDraftKeydown}
          ></textarea>
          <button
            type="button"
            class="code-send"
            disabled={sending || !draft.trim()}
            aria-label="发送"
            onclick={send}
          >
            <Icon name="arrow-up" size={16} strokeWidth={2.25} />
          </button>
        </div>
        {#if sendError}
          <p class="code-senderror">{sendError}</p>
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .code-page {
    display: grid;
    /* 两栏吃满高度,列内各自滚动(minmax(0,…) 防内容撑破);标题由系统 chrome 提供。 */
    grid-template-rows: minmax(0, 1fr);
    padding: 0.35rem 1.25rem 1.25rem;
    height: 100%;
    box-sizing: border-box;
  }
  .code-muted {
    color: var(--t3);
    margin: 0.25rem 0;
    font-size: var(--kenos-type-secondary, 14px);
  }
  /* —— 连接 Mac 配对卡 —— */
  .code-connect {
    display: grid;
    place-items: center;
  }
  .code-connect-card {
    display: grid;
    gap: 0.6rem;
    width: min(22rem, 100%);
    background: var(--kenos-surface-group, var(--card));
    border: 1px solid var(--kenos-chrome-border, var(--border));
    border-radius: var(--kenos-radius-group, 16px);
    padding: 1.25rem;
  }
  .code-connect-title {
    font-size: var(--kenos-type-section, 18px);
    font-weight: var(--kenos-weight-section, 600);
  }
  .code-connect-card code {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.85em;
    background: color-mix(in srgb, var(--t1) 7%, transparent);
    border-radius: 0.3rem;
    padding: 0.05rem 0.3rem;
  }
  .code-connect-input {
    border: 1px solid var(--kenos-chrome-border, var(--border));
    border-radius: 0.6rem;
    padding: 0.5rem 0.6rem;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--kenos-type-secondary, 14px);
  }
  .code-connect-input:focus {
    outline: 1.5px solid color-mix(in srgb, var(--kenos-domain-code) 55%, transparent);
  }
  .code-connect-btn {
    border: none;
    border-radius: 0.6rem;
    padding: 0.55rem;
    background: var(--kenos-domain-code);
    color: var(--on-accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .code-connect-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .code-connect-error {
    margin: 0;
  }
  .code-link {
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
    padding: 0 0 0 0.3rem;
  }
  .code-demo-tag {
    margin: 0;
    font-size: var(--kenos-type-meta, 12px);
    color: var(--t3);
    letter-spacing: 0.03em;
  }
  .code-live {
    color: var(--kenos-domain-code);
    animation: code-pulse 1.2s ease-in-out infinite;
  }
  @keyframes code-pulse {
    50% {
      opacity: 0.3;
    }
  }

  /* —— 两栏:Kenos raised group 材质 —— */
  .code-grid {
    display: grid;
    grid-template-columns: 16rem minmax(0, 1fr);
    gap: 0.9rem;
    min-height: 0;
  }
  .code-col {
    background: var(--kenos-surface-group, var(--card));
    border: 1px solid var(--kenos-chrome-border, var(--border));
    border-radius: var(--kenos-radius-group, 16px);
    padding: 0.75rem;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    overflow: hidden;
  }

  /* —— 左栏 —— */
  .code-search-row {
    display: flex;
    align-items: stretch;
    gap: 0.35rem;
  }
  .code-search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: color-mix(in srgb, var(--t1) 5%, transparent);
    border-radius: 0.6rem;
    padding: 0.4rem 0.55rem;
    color: var(--t3);
  }
  .code-search:focus-within {
    outline: 1.5px solid color-mix(in srgb, var(--kenos-domain-code) 55%, transparent);
  }
  .code-search input {
    border: none;
    background: transparent;
    color: var(--t1);
    width: 100%;
    outline: none;
    font: inherit;
    font-size: var(--kenos-type-secondary, 14px);
  }
  .code-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
    overflow-y: auto;
  }
  .code-session {
    display: grid;
    gap: 0.12rem;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    border-radius: 0.6rem;
    padding: 0.45rem 0.55rem;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .code-session:hover {
    background: var(--kenos-surface-interactive, color-mix(in srgb, var(--t1) 6%, transparent));
  }
  .code-session.code-active {
    background: color-mix(in srgb, var(--kenos-domain-code) 14%, transparent);
  }
  .code-session.code-active .code-session-title {
    color: color-mix(in srgb, var(--kenos-domain-code) 70%, var(--t1));
    font-weight: 600;
  }
  .code-session-title {
    font-size: var(--kenos-type-secondary, 14px);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .code-session-meta {
    font-size: var(--kenos-type-meta, 12px);
    color: var(--t3);
  }

  /* —— 右栏:消息流 —— */
  .code-thread {
    flex: 1;
    min-width: 0;
    padding: 0;
  }
  .code-center {
    margin: auto;
    text-align: center;
  }
  .code-thread-head {
    display: grid;
    gap: 0.4rem;
    border-bottom: 1px solid var(--kenos-chrome-border, var(--border));
    padding: 0.7rem 0.9rem 0.55rem;
  }
  .code-thread-head-row {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: baseline;
  }
  /* 会话元信息芯片行(模型/模式/思考/上下文…)—— 对标 Cursor 原生信息密度 */
  .code-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .code-chip {
    font-size: var(--kenos-type-meta, 12px);
    line-height: 1.4;
    color: var(--t2);
    background: color-mix(in srgb, var(--t1) 6%, transparent);
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
    white-space: nowrap;
  }
  .code-chip-model {
    color: color-mix(in srgb, var(--kenos-domain-code) 82%, var(--t1));
    background: color-mix(in srgb, var(--kenos-domain-code) 12%, transparent);
    font-weight: 600;
  }
  .code-chip-ws {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.7rem;
  }
  .code-chip-ctx-hot {
    color: var(--critical, var(--t1));
    background: color-mix(in srgb, var(--critical, var(--t1)) 12%, transparent);
  }
  .code-thread-title {
    font-size: var(--kenos-type-list, 16px);
    font-weight: var(--kenos-weight-list, 600);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .code-thread-meta {
    font-size: var(--kenos-type-meta, 12px);
    color: var(--t3);
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .code-messages {
    display: grid;
    gap: 0.9rem;
    overflow-y: auto;
    flex: 1;
    padding: 0.9rem;
    align-content: start;
  }
  .code-msg {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
    /* 新消息进入:轻淡入上移(与 Kenos 页面动效同族);keyed each + 引用复用
     * 保证轮询重投影时旧消息不重放动画。 */
    animation: code-msg-enter var(--dur-fast) var(--ease-standard) both;
  }
  @keyframes code-msg-enter {
    from {
      opacity: 0.5;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  /* 用户消息:右对齐中性气泡 —— 与 aios Assistant 聊天(Message.svelte .bubble)同语言 */
  .code-msg.code-user {
    justify-items: end;
    gap: 0.15rem;
  }
  .code-msg.code-pending {
    opacity: 0.65;
  }
  .code-bubble {
    margin: 0;
    max-width: min(72%, 520px);
    background: color-mix(in srgb, var(--card) 88%, var(--bg));
    color: var(--t1);
    padding: 9px 14px;
    border-radius: 18px;
    font-size: var(--kenos-type-body);
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  /* —— agent 工作步骤条(Codex/Claude Code 式过程可见性) —— */
  .code-steps {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border: none;
    background: color-mix(in srgb, var(--t1) 4%, transparent);
    border-radius: 999px;
    padding: 0.25rem 0.65rem;
    font-size: var(--kenos-type-meta, 12px);
    color: var(--t3);
    cursor: pointer;
    font-family: inherit;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    justify-self: start;
  }
  .code-steps:hover {
    color: var(--t2);
    background: color-mix(in srgb, var(--t1) 7%, transparent);
  }
  .code-steps-list {
    margin: 0.3rem 0 0;
    padding-left: 1.4rem;
    font-size: var(--kenos-type-meta, 12px);
    color: var(--t3);
    display: grid;
    gap: 0.15rem;
  }
  .code-steps-raw {
    margin-left: 0.5rem;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.66rem;
    opacity: 0.55;
    word-break: break-all;
  }
  .code-steps-chevron {
    display: inline-flex;
    transition: transform var(--dur-fast) var(--ease-standard);
  }
  .code-steps-chevron.code-open {
    transform: rotate(180deg);
  }
  /* 运行中(直播尾部)的步骤组:与 Assistant 工具卡 running 态同款脉冲 */
  .code-steps-running {
    animation: code-pulse 1s ease-in-out infinite;
  }
  .code-steps-failed {
    color: var(--critical, var(--t2));
  }
  .code-step-failed {
    color: var(--critical, var(--t2));
  }
  .code-step-fail-tag {
    margin-left: 0.4rem;
    font-size: 0.62rem;
    color: var(--critical, var(--t2));
    border: 1px solid color-mix(in srgb, var(--critical, var(--t2)) 40%, transparent);
    border-radius: 0.3rem;
    padding: 0 0.25rem;
  }
  /* renderMarkdown 代码块头(语言标签 + 复制钮) */
  .code-md :global(.md-code-actions) {
    display: inline-flex;
    gap: 0.3rem;
  }
  .code-md :global(.md-copy) {
    border: none;
    background: transparent;
    color: var(--t3);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0 0.2rem;
  }
  .code-md :global(.md-copy:hover) {
    color: var(--t1);
  }
  /* 列表活跃点:2 分钟内有更新 = agent 可能正在干活 */
  .code-active-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--kenos-domain-code);
    margin-right: 0.4rem;
    vertical-align: 1px;
    animation: code-pulse 1.4s ease-in-out infinite;
  }
  /* —— 骨架屏 —— */
  .code-sk {
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--t1) 6%, transparent);
    animation: code-pulse 1.4s ease-in-out infinite;
    height: 2.4rem;
  }
  .code-sk-user {
    width: 55%;
  }
  .code-sk-line {
    width: 85%;
    height: 4.2rem;
  }
  .code-sk-short {
    width: 60%;
    height: 2rem;
  }
  .code-sk-late {
    animation-delay: 0.3s;
  }
  .code-ts {
    font-size: 0.68rem;
    color: var(--t3);
  }

  /* —— agent 消息 markdown 正文(renderMarkdown 白名单产物) —— */
  .code-md {
    font-size: var(--kenos-type-body, 15px);
    line-height: var(--kenos-leading-body, 1.55);
    min-width: 0;
    max-width: 46rem;
    overflow-wrap: break-word;
  }
  .code-md :global(p) {
    margin: 0.35rem 0;
  }
  .code-md :global(pre) {
    background: color-mix(in srgb, var(--t1) 5%, transparent);
    border: 1px solid var(--kenos-chrome-border, var(--border));
    border-radius: 0.6rem;
    padding: 0.6rem 0.7rem;
    overflow-x: auto;
    margin: 0.45rem 0;
  }
  .code-md :global(code) {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.82em;
  }
  .code-md :global(:not(pre) > code) {
    background: color-mix(in srgb, var(--t1) 7%, transparent);
    border-radius: 0.3rem;
    padding: 0.08rem 0.3rem;
  }
  .code-md :global(ul),
  .code-md :global(ol) {
    margin: 0.35rem 0;
    padding-left: 1.25rem;
  }
  .code-md :global(h1),
  .code-md :global(h2),
  .code-md :global(h3),
  .code-md :global(h4) {
    font-size: 0.95rem;
    margin: 0.6rem 0 0.25rem;
  }
  .code-md :global(blockquote) {
    border-left: 3px solid var(--border);
    margin: 0.35rem 0;
    padding-left: 0.6rem;
    color: var(--t2);
  }
  .code-md :global(table) {
    border-collapse: collapse;
    font-size: 0.82rem;
    margin: 0.4rem 0;
    display: block;
    overflow-x: auto;
  }
  .code-md :global(th),
  .code-md :global(td) {
    border: 1px solid var(--border);
    padding: 0.25rem 0.5rem;
  }
  /* 流式打字光标 —— 与 Assistant 聊天(Message.svelte)同款:中性色、steps 闪烁 */
  .code-md :global(.md-caret) {
    display: inline-block;
    width: 0.52em;
    height: 1.02em;
    margin-inline-start: 1px;
    transform: translateY(0.14em);
    border-radius: 1px;
    background: var(--t2);
    animation: code-caret-blink 1.05s steps(1, end) infinite;
  }
  @keyframes code-caret-blink {
    0%,
    50% {
      opacity: 1;
    }
    50.01%,
    100% {
      opacity: 0;
    }
  }

  /* —— composer:输入框 + 发送,没别的 —— */
  .code-composer {
    margin: 0 0.9rem 0.9rem;
    background: var(--kenos-surface-raised, var(--card));
    border: 1px solid var(--kenos-chrome-border, var(--border));
    /* 与用户气泡同族圆角(Assistant .bubble = 18px) */
    border-radius: 18px;
    padding: 0.4rem 0.45rem 0.4rem 0.7rem;
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
  }
  .code-composer:focus-within {
    border-color: color-mix(in srgb, var(--kenos-domain-code) 55%, transparent);
  }
  .code-draft {
    border: none;
    background: transparent;
    color: inherit;
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    font: inherit;
    font-size: var(--kenos-type-body, 15px);
    line-height: 1.5;
    resize: none;
    outline: none;
    padding: 0.35rem 0;
    min-height: 2.1em;
    max-height: 10em;
  }
  .code-send {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 999px;
    background: var(--kenos-domain-code);
    color: var(--on-accent);
    cursor: pointer;
    flex-shrink: 0;
  }
  .code-send:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .code-senderror {
    margin: 0 0.9rem 0.7rem;
    font-size: var(--kenos-type-meta, 12px);
    color: var(--critical, var(--t2));
  }

  /* —— 通用按钮 —— */
  .code-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid var(--kenos-chrome-border, var(--border));
    background: transparent;
    border-radius: 0.55rem;
    padding: 0.35rem 0.65rem;
    cursor: pointer;
    color: var(--t2);
    font: inherit;
    font-size: var(--kenos-type-button, 14px);
  }
  .code-btn:hover {
    background: var(--kenos-surface-interactive, color-mix(in srgb, var(--t1) 5%, transparent));
    color: var(--t1);
  }
  .code-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .code-icon {
    padding: 0.35rem 0.45rem;
  }
  .code-active-btn {
    border-color: color-mix(in srgb, var(--kenos-domain-code) 55%, transparent);
    color: var(--kenos-domain-code);
  }

  /* 动效尊重系统偏好:reduced-motion 时静止(与 Assistant/Kenos 全局一致) */
  @media (prefers-reduced-motion: reduce) {
    .code-msg {
      animation: none;
    }
    .code-md :global(.md-caret) {
      animation: none;
      opacity: 0.55;
    }
    .code-live,
    .code-active-dot,
    .code-steps-running,
    .code-sk {
      animation: none;
    }
    .code-steps-chevron {
      transition: none;
    }
  }

  /* 返回钮只在窄屏两级导航里出现 */
  .code-back {
    display: none;
  }

  @media (max-width: 900px) {
    /* 窄屏两级导航:列表页 ↔ 会话页,单视图占满(现代 IM 手机形态) */
    .code-grid {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr);
    }
    .code-grid[data-mobile-view='thread'] .code-sessions {
      display: none;
    }
    .code-grid[data-mobile-view='list'] .code-thread {
      display: none;
    }
    .code-back {
      display: inline-flex;
      flex-shrink: 0;
      align-self: center;
    }
    .code-thread-head-row {
      align-items: center;
      gap: 0.4rem;
    }
    .code-thread-title {
      flex: 1;
      min-width: 0;
    }
  }
</style>
