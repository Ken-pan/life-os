/**
 * Local Ask prompt/tool budget — cut prefill cost on phone→Mac 35B.
 *
 * Best-practice drivers (TTFT / long-context prefill):
 * - Keep a short always-on contract; inject long handbooks only on intent.
 * - Ship a core tool schema first; expand notes/browser/image/native when needed.
 */

/** @typedef {{
 *   notes: boolean,
 *   daily: boolean,
 *   browser: boolean,
 *   image: boolean,
 *   lifeOs: boolean,
 *   lifeOsWrite: boolean,
 *   nativeHeavy: boolean,
 * }} LocalAssistNeeds */

export const CORE_TOOL_NAMES = Object.freeze([
  'get_time',
  'calculate',
  'run_javascript',
  'search_memory',
  'save_memory',
  // Notes stay in core schema (small); long Obsidian handbooks stay intent-gated.
  'search_notes',
  'read_note',
  'ask_notes',
  'life_os_today',
  'planner_tasks',
  'finance_summary',
  'focus_status',
  'open_space',
])

export const NOTE_TOOL_NAMES = Object.freeze([
  'search_notes',
  'read_note',
  'ask_notes',
])

export const BROWSER_TOOL_NAMES = Object.freeze([
  'browser_status',
  'read_browser_page',
  'open_browser_page',
  'browser_search',
  'browser_interact',
  'look_at_browser_page',
  'web_search',
  'fetch_url',
])

export const IMAGE_TOOL_NAMES = Object.freeze([
  'generate_image',
  'list_characters',
  'list_styles',
])

export const LIFE_OS_WRITE_TOOL_NAMES = Object.freeze([
  'planner_add_task',
  'start_focus',
  'end_focus',
  'compose_library_note',
])

/**
 * @param {string} [text]
 * @param {{ priorToolNames?: string[] }} [opts]
 * @returns {LocalAssistNeeds}
 */
export function detectLocalAssistNeeds(text = '', opts = {}) {
  const t = String(text || '')
  const prior = new Set(
    (opts.priorToolNames || []).map((n) => String(n || '').trim()).filter(Boolean),
  )
  const hasPrior = (...names) => names.some((n) => prior.has(n))

  const notes =
    hasPrior(...NOTE_TOOL_NAMES) ||
    /笔记|obsidian|vault|记过|记下|我写过|上次定|主题线|未决|work\s*log|评审|决策框架|ask_notes|search_notes|read_note/i.test(
      t,
    )

  const daily =
    hasPrior('read_note', 'search_notes', 'ask_notes') ||
    /今天怎么样|今日动态|今天有什么|日报|会议|邮件|teams|outlook|jira|rss|忙什么|在做哪些项目|开发进展|git.?pulse|提交记录|近几天.*项目/i.test(
      t,
    )

  const browser =
    hasPrior(...BROWSER_TOOL_NAMES) ||
    /联网|上网|搜索|查一下|查下|网页|浏览器|打开.*链接|新闻|天气|赛况|股价|最新|现在.*价|browser_|web_search|fetch_url/i.test(
      t,
    )

  const image =
    hasPrior(...IMAGE_TOOL_NAMES) ||
    /画图|画画|生图|生成图片|插画|海报|壁纸|头像|照片风格|generate_image|角色一致性|list_characters/i.test(
      t,
    )

  const lifeOs =
    hasPrior(
      'life_os_today',
      'planner_tasks',
      'finance_summary',
      'focus_status',
      'open_space',
      ...LIFE_OS_WRITE_TOOL_NAMES,
    ) ||
    /待办|花销|财务|结余|健身|近况|life\s*os|planner|finance|focus|打开\s*(plan|money|health|library)|今天要做什么|有没有逾期/i.test(
      t,
    )

  const lifeOsWrite =
    hasPrior(...LIFE_OS_WRITE_TOOL_NAMES) ||
    /加待办|记一件事|提醒自己|开始\s*focus|结束\s*focus|写.*笔记|compose_library|planner_add/i.test(
      t,
    )

  const nativeHeavy =
    hasPrior(
      'delegate_task',
      'check_task',
      'look_at_screen',
      'open_mac_app',
      'type_into_app',
      'ai_app_send',
      'ai_app_read',
      'github_cli',
      'run_applescript',
    ) ||
    /修\s*bug|跑测试|多文件|claude\s*code|cursor\s*agent|截屏|桌面上|mac\s*应用|applescript|github\s*(pr|issue)|派给本机/i.test(
      t,
    )

  return { notes, daily, browser, image, lifeOs, lifeOsWrite, nativeHeavy }
}

/**
 * @param {LocalAssistNeeds} needs
 * @param {{ webAccess?: boolean, includeNativeNames?: string[] }} [opts]
 * @returns {Set<string>}
 */
export function toolNamesForNeeds(needs, opts = {}) {
  const webAccess = opts.webAccess !== false
  const names = new Set(CORE_TOOL_NAMES)
  if (needs.notes || needs.daily) {
    for (const n of NOTE_TOOL_NAMES) names.add(n)
  }
  if (needs.browser) {
    for (const n of BROWSER_TOOL_NAMES) {
      if (!webAccess && (n === 'web_search' || n === 'fetch_url')) continue
      names.add(n)
    }
  }
  if (needs.image) {
    for (const n of IMAGE_TOOL_NAMES) names.add(n)
  }
  if (needs.lifeOsWrite) {
    for (const n of LIFE_OS_WRITE_TOOL_NAMES) names.add(n)
  }
  if (needs.nativeHeavy && opts.includeNativeNames?.length) {
    for (const n of opts.includeNativeNames) names.add(n)
  }
  return names
}

/**
 * @param {Array<{ type?: string, function?: { name?: string } }>|undefined} tools
 * @param {Set<string>} allowed
 */
export function filterToolsByNeeds(tools, allowed) {
  if (!tools?.length || !allowed) return tools
  return tools.filter((t) => {
    const name = t?.function?.name || ''
    if (!name) return false
    // MCP / unknown external tools stay available (usually few).
    if (name.includes('__') || name.startsWith('mcp_')) return true
    return allowed.has(name)
  })
}

/**
 * Compact handbook fragments for the local system prompt.
 * Long Obsidian/browser/image manuals are gated by {@link detectLocalAssistNeeds}.
 */
export const LOCAL_HANDBOOK = Object.freeze({
  toolsQuick:
    '工具选择速查(需要事实时先用工具,不要凭记忆编造):\n' +
    '- 算数 calculate;跑代码 run_javascript;日期时间 get_time\n' +
    '- Life OS 近况 life_os_today / 待办 planner_tasks / 花销 finance_summary\n' +
    '- 笔记检索 search_notes → read_note;综合问答 ask_notes(仅当问题涉及用户自己记过的内容)\n' +
    '- 联网查证 browser_search → open_browser_page(仅当问题需要此刻外部信息)\n' +
    '不要编造网页内容、链接或用户笔记原文。',

  browser:
    '联网查资料:browser_search(结果自带摘要,先筛选)→ 挑 1-3 篇 open_browser_page(直接返回正文)→ 长文按结果尾部提示用 read_browser_page(part=text, offset=N) 续读 → 汇总并附来源链接。\n' +
    '用户说"当前页面/我打开的这个网页":read_browser_page(不要 open)。\n' +
    '页面上点击/填表/触发"加载更多":browser_interact;看页面里的图片/图表/布局:look_at_browser_page。\n' +
    'browser 工具偶发报错:先直接重试一次;仍失败再 browser_status 诊断并把提示转告用户。\n' +
    '不要:在同一页面反复滚动重读(用 offset 续读);编造网页内容或链接。',

  browserWebFallback:
    '浏览器工具不可用时才退回 web_search / fetch_url(公共代理,较不稳定)。',

  notesBundle:
    '用户有 Obsidian 笔记库(已全文索引):涉及过往判断/框架/决策/项目细节时先 search_notes,需要展开再 read_note;就事实/决策直接发问时用 ask_notes,回答给出笔记路径。\n' +
    '策展优先:Work/Digests/daily-summary-*.md、Work/Topics/、Work/People/、Work/Rollups/。\n' +
    '今日动态:memory 库根目录 YYYY-MM-DD.md(结合当前日期);更细看 Work/Work Log/ 下 digest。\n' +
    '近期项目:memory/project-git-pulse.md(近几天各仓库 git 提交)。',

  lifeOsShort:
    'Life OS:综合近况用 life_os_today;待办 planner_tasks;花销 finance_summary。不要猜用户数据。',

  lifeOsFull: (writeHint) =>
    'Life OS 数据(用户自己的真实数据,涉及时必须用工具读、不要猜也不要说"看不到"):\n' +
    '- 花销/收入/结余/某分类或商家花多少 → finance_summary(可传 period 或 from/to、category、merchant)\n' +
    '- 待办/今天要做什么/有没有逾期/今天完成了什么 → planner_tasks(scope: today/overdue/open/completed_today)\n' +
    '- "今天怎么样/我的近况" 这类综合近况 → life_os_today\n' +
    writeHint +
    '\n- 开始/结束 Focus → start_focus / end_focus;状态 → focus_status\n' +
    '- 打开 Space → open_space;写 Library 笔记 → compose_library_note(用户明确要求时)',

  image:
    '生图:用户要画图/生成图片时用 generate_image,prompt 写具体(主体+细节+场景+光线+风格)。人物、写实、图中含文字用 quality="quality"。创建可复用角色加 save_character="名字";之后 character="名字" 让同一角色进入新场景;已有角色用 list_characters 查。生成结果自动展示,不要编造图片链接。',

  native:
    '本机原生能力(只有这台 Mac 上可用,按需伸手,别为简单问答滥用):\n' +
    '- 改代码/修 bug/写脚本/跑测试/多文件工程:delegate_task 派给本机 Claude Code(默认)或 cursor,异步执行——派发后回复用户并用 check_task 跟进,别原地干等\n' +
    '- 看桌面上有什么、某个原生 Mac 应用界面长什么样:look_at_screen(网页内容/网页里的图仍走 look_at_browser_page,别混用)\n' +
    '- 打开/前置某个 Mac 应用 open_mac_app;往它输入文字 type_into_app\n' +
    '- 把任务转交本机其它 AI 桌面应用(Claude/ChatGPT/Cursor/Codex)并取回复:ai_app_send 发出、隔十几秒到一分钟再 ai_app_read 读\n' +
    '- GitHub 操作(PR/issue/仓库)github_cli;更底层的 macOS 自动化 run_applescript',

  memory:
    '记忆:用户说出值得长期记住的新事实(偏好、背景变化、纠正)时,直接调一次 save_memory;状态/时间纠正、以及今天联网确认到的重要时效事实,都保存为“截至当前日期,…”的带日期事实,没给完成日期就不要猜。问到用户历史而上下文里没有答案时,先 search_memory。记忆操作不要反复斟酌,一次调用、顺带确认即可。',
})

/**
 * @param {LocalAssistNeeds} needs
 * @param {{
 *   toolsEnabled?: boolean,
 *   memoryEnabled?: boolean,
 *   cloudAuthorized?: boolean,
 *   writesBlocked?: boolean,
 *   isNative?: boolean,
 *   webAccess?: boolean,
 * }} [ctx]
 * @returns {string[]}
 */
export function buildLocalToolHandbookLines(needs, ctx = {}) {
  if (!ctx.toolsEnabled) return []
  /** @type {string[]} */
  const lines = [LOCAL_HANDBOOK.toolsQuick]

  if (needs.browser) {
    lines.push(
      LOCAL_HANDBOOK.browser +
        (ctx.webAccess ? `\n- ${LOCAL_HANDBOOK.browserWebFallback}` : ''),
    )
  }
  if (ctx.isNative && needs.nativeHeavy) {
    lines.push(LOCAL_HANDBOOK.native)
  }
  if (ctx.cloudAuthorized) {
    if (needs.lifeOs || needs.lifeOsWrite) {
      const writeHint = ctx.writesBlocked
        ? '- 当前生产写关闭:不要调用 planner_add_task,也不要假装已写入。用户要加待办/记事时,引导打开 Plan Space 手动添加,并说明助手此刻只读'
        : '- 用户明确要记一件事/加待办/提醒自己 → planner_add_task(投递到 Planner 收件箱);仅意图明确时调,调用后复述加了什么'
      lines.push(LOCAL_HANDBOOK.lifeOsFull(writeHint))
    } else {
      lines.push(LOCAL_HANDBOOK.lifeOsShort)
    }
  }
  if (ctx.memoryEnabled) lines.push(LOCAL_HANDBOOK.memory)
  if (needs.notes || needs.daily) lines.push(LOCAL_HANDBOOK.notesBundle)
  if (needs.image) lines.push(LOCAL_HANDBOOK.image)
  return lines
}

/**
 * Collect tool names already used in this conversation (for tier expansion).
 * @param {{ messages?: Array<{ toolCalls?: Array<{ name?: string }> }> }} conversation
 * @returns {string[]}
 */
export function priorToolNamesFromConversation(conversation) {
  /** @type {string[]} */
  const out = []
  for (const m of conversation?.messages || []) {
    for (const tc of m?.toolCalls || []) {
      if (tc?.name) out.push(String(tc.name))
    }
  }
  return out
}
