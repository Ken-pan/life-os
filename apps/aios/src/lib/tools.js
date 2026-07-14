import { GATEWAY } from '$lib/localai.js'
import { addMemory, searchMemories } from '$lib/memory.svelte.js'
import { startImageProgress, stopImageProgress } from '$lib/imageProgress.svelte.js'
import { isNative, NATIVE_DEFS, isNativeTool, executeNativeTool } from '$lib/native.js'

/**
 * 内置工具(OpenAI function calling 格式)。
 * 模型经原生 tool_calls 调用,agent loop 在 chat.svelte.js。
 * 除 fetch_url(经 r.jina.ai 代理读网页)外全部本地执行。
 */

const DEFS = [
  {
    key: 'get_time',
    icon: 'clock',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'get_time',
        description: '获取当前的日期、时间和星期。',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    key: 'calculate',
    icon: 'calculator',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'calculate',
        description:
          '精确计算一个数学表达式。支持 + - * / % ** 括号和 Math 函数(如 Math.sqrt、Math.sin、Math.log)。涉及数字计算时优先使用本工具而不是心算。',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'JavaScript 数学表达式,例如 "(1234.5 * 6789) / 42" 或 "Math.sqrt(2) * 100"',
            },
          },
          required: ['expression'],
        },
      },
    },
  },
  {
    key: 'run_javascript',
    icon: 'code',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'run_javascript',
        description:
          '在沙盒中执行一段 JavaScript 代码并返回 console.log 输出与最后一个表达式的值。适合数据处理、算法验证、复杂计算、生成文本。无网络与 DOM 访问,8 秒超时。注意:超过 15 位的整数运算必须用 BigInt(数字加 n 后缀),否则会丢精度。',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: '要执行的 JavaScript 代码' },
          },
          required: ['code'],
        },
      },
    },
  },
  {
    key: 'save_memory',
    icon: 'brain',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'save_memory',
        description:
          '把关于用户的一条稳定事实存入长期记忆(跨对话持久)。当用户告诉你新偏好、背景变化、正在做的新事,或纠正已有认知时使用。一次只存一个事实,第三人称一句话,必要时带绝对日期;用户纠正项目状态但没给完成日期时,写“截至今天,用户确认X已完成”,不要猜完成日期。同一事实的新版本直接存,旧的近似条目会被自动替换。不要存敏感凭据(密码/密钥/证件号)和只在本轮有意义的临时细节。',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '要记住的事实,一句话' },
          },
          required: ['content'],
        },
      },
    },
  },
  {
    key: 'search_memory',
    icon: 'brain',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'search_memory',
        description:
          '在长期记忆中语义检索与主题相关的事实。当用户问"我之前说过/你还记得",或任务依赖用户的历史偏好、项目背景而系统提示里没有相关记忆时,先检索再回答,不要凭空猜测。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '检索主题' },
          },
          required: ['query'],
        },
      },
    },
  },
  {
    key: 'fetch_url',
    icon: 'globe',
    web: true,
    def: {
      type: 'function',
      function: {
        name: 'fetch_url',
        description:
          '(后备通道)经公共代理抓取网页正文,拿不到 JS 渲染内容且常被反爬拦截。读网页优先用 open_browser_page;仅当浏览器工具不可用时才用本工具。',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: '完整 URL,以 http(s):// 开头' },
          },
          required: ['url'],
        },
      },
    },
  },
  {
    key: 'web_search',
    icon: 'search',
    web: true,
    def: {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          '(后备通道)经公共代理刮取搜索结果,不稳定且链接常失效。搜索优先用 browser_search(真实浏览器);仅当浏览器工具不可用时才用本工具。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
          },
          required: ['query'],
        },
      },
    },
  },
  {
    key: 'search_notes',
    icon: 'notebook',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'search_notes',
        description:
          '在用户的 Obsidian 笔记库(判断/框架/决策/工作项目/日常记录)中混合检索(BM25+向量+重排,全本地)。涉及用户过往的想法、项目、评审、决策或"我之前写过/记过"时优先使用。返回相关片段与笔记路径;需要全文用 read_note。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '检索主题或问题' },
          },
          required: ['query'],
        },
      },
    },
  },
  {
    key: 'read_note',
    icon: 'notebook',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'read_note',
        description: '读取一篇笔记的完整内容。path 来自 search_notes 的结果。',
        parameters: {
          type: 'object',
          properties: {
            vault: { type: 'string', description: "vault id,来自搜索结果(默认 'vault')" },
            path: { type: 'string', description: '笔记相对路径,如 030_Frameworks/xxx.md' },
          },
          required: ['path'],
        },
      },
    },
  },
  {
    key: 'generate_image',
    icon: 'image',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'generate_image',
        description:
          '本地 AI 生图(支持中文提示词与图中中文文字)。仅当用户要一张全新的位图图像(画图、生成图片、海报、插画、头像、照片、场景画面)时使用。' +
          '不要用于:讨论/分析用户已有或刚发的图片;画图表/流程图/示意图/数据可视化;' +
          '小游戏/网页/应用/动画/UI 界面,或用户说“写一个/用代码/用 HTML/单个文件”——这些一律输出 ```html 或 ```svg 代码块,绝不生图(如“写一个贪吃蛇小游戏”是要可运行的 HTML 代码,不是要一张贪吃蛇的图);' +
          '或用户只想要文字(文案/描述/创意)时。' +
          'prompt 用具体、丰富的描述(主体+外观细节+动作+场景+光线+风格)。' +
          'quality:fast=秒级出图(草图/插画/快速预览);quality=高质量(人物、写实摄影、图中含文字、用户要求精细时必用,约 1-3 分钟)。' +
          '两步走建议:构思阶段先用 fast + n=4 出多个方案让用户挑,选定后用 quality、传上一张的 seed 定稿。' +
          '角色一致性:save_character="角色名" 会把本次生成注册为可复用角色;之后传 character="角色名" 可让同一角色出现在新的场景/动作/服装中(此时 prompt 描述新场景即可)。' +
          '风格一致性:save_style="风格名" 把本次画面的视觉风格注册为可复用风格;之后传 style="风格名" 可让新内容沿用同一套色调/笔触/质感。角色与风格可同时传。' +
          '生成的图片会自动展示给用户,不要在回答里编造图片链接。',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: '图片内容的详细描述' },
            quality: {
              type: 'string',
              enum: ['fast', 'quality'],
              description: '档位,默认 fast;人物/写实/含文字用 quality',
            },
            aspect: {
              type: 'string',
              enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
              description: '画幅比例,默认 1:1',
            },
            n: {
              type: 'number',
              description:
                '一次生成的张数(1-4),默认 1;用户要「多来几张/多个方案/挑一个」时设 2-4(仅 fast 档批量,quality 逐张较慢)',
            },
            enhance_prompt: {
              type: 'boolean',
              description:
                '是否让本地模型把 prompt 自动扩写成结构化丰富描述(主体/光线/构图/风格/画质)。用户给的描述简短模糊时设 true 提升画质;已经写得很详细、或要严格照原样时设 false。默认对过短的 prompt 自动扩写。',
            },
            negative_prompt: {
              type: 'string',
              description: '不想出现的元素(已内置解剖/手部质量兜底,只需补充场景相关的)',
            },
            character: {
              type: 'string',
              description: '使用已注册角色的名字,让同一角色出现在新场景(prompt 只需描述新场景)',
            },
            save_character: {
              type: 'string',
              description: '把本次生成的形象注册为角色,供之后 character 参数复用',
            },
            style: {
              type: 'string',
              description: '使用已注册风格的名字,让新内容沿用该视觉风格(色调/笔触/质感)',
            },
            save_style: {
              type: 'string',
              description: '把本次画面的视觉风格注册为风格,供之后 style 参数复用',
            },
            seed: { type: 'number', description: '随机种子;复现或微调上一张时传入其 seed' },
          },
          required: ['prompt'],
        },
      },
    },
  },
  {
    key: 'list_characters',
    icon: 'image',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'list_characters',
        description: '列出已注册的生图角色(名字、描述、参考图数量)。用户问"有哪些角色"或 generate_image 报角色不存在时使用。',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    key: 'list_styles',
    icon: 'image',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'list_styles',
        description: '列出已注册的生图风格(名字、描述、参考图数量)。用户问"有哪些风格"或 generate_image 报风格不存在时使用。',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    key: 'browser_status',
    icon: 'monitor',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'browser_status',
        description:
          '检查本机 Chrome 感知桥(Web State Bridge)的状态:服务是否运行、浏览器扩展是否在线、有没有页面快照。browser 系工具出错时先用它诊断。',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    key: 'read_browser_page',
    icon: 'monitor',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'read_browser_page',
        description:
          '读取用户 Chrome 里页面的内容。part 可选:text=页面正文(带 offset 分页,长文继续读时把 offset 设为上次提示的位置);summary=结构化摘要(默认,含标题/链接/表单);links=页面全部链接列表。当用户提到"当前页面/这个网页",或要继续读长文时使用。',
        parameters: {
          type: 'object',
          properties: {
            part: {
              type: 'string',
              enum: ['summary', 'text', 'links'],
              description: '要读取的内容,默认 summary',
            },
            offset: {
              type: 'number',
              description: 'part=text 时的起始字符位置,续读长文用,默认 0',
            },
          },
        },
      },
    },
  },
  {
    key: 'open_browser_page',
    icon: 'monitor',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'open_browser_page',
        description:
          '让用户的 Chrome 打开任意 URL,直接返回页面正文(真实浏览器,支持 JS 渲染和登录态页面)。读网页用这个,一步到位,不需要再调 read_browser_page;只有长文续读(offset)或要看链接/视觉内容时才用其他工具。',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: '完整 URL,以 http(s):// 开头' },
          },
          required: ['url'],
        },
      },
    },
  },
  {
    key: 'browser_search',
    icon: 'search',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'browser_search',
        description:
          '用用户的真实 Chrome 搜索互联网,返回结果列表(标题+链接)和搜索页摘要文本。先根据摘要筛选,只对真正值得深入的 1-3 个链接调 open_browser_page,不要逐个全开。涉及最新信息、新闻、不确定的事实时优先用这个搜索。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
          },
          required: ['query'],
        },
      },
    },
  },
  {
    key: 'browser_interact',
    icon: 'monitor',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'browser_interact',
        description:
          '在 Chrome 当前研究页面上执行一个交互动作,之后自动重新采集页面。action:click=点击元素;fill=填入文本;press=按键(如 Enter);scroll_bottom=滚到页底。selector 支持 CSS 或语义定位(role=button[name="下一页"]、label="搜索")。用于翻页、展开折叠内容、站内搜索、触发"加载更多"。注意:读长文正文不需要滚动,直接用 read_browser_page 的 offset 续读。',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['scroll_bottom', 'click', 'fill', 'press'],
              description: '动作类型',
            },
            selector: { type: 'string', description: '目标元素(click/fill/press 需要)' },
            text: { type: 'string', description: 'fill 要填入的文本' },
            key: { type: 'string', description: 'press 的按键,如 Enter' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    key: 'look_at_browser_page',
    icon: 'monitor',
    web: false,
    def: {
      type: 'function',
      function: {
        name: 'look_at_browser_page',
        description:
          '截图 Chrome 当前研究页面并用本地视觉模型观察,回答关于页面视觉内容的问题:页面上有什么图片/图表、图片里是什么、布局长什么样。文字内容用 read_browser_page 更准;这个工具专门看"图"。',
        parameters: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: '想了解页面视觉内容的什么,例如"页面上的产品图是什么样的"',
            },
            fullPage: {
              type: 'boolean',
              description: '截整页而非可视区域(长页面找图时用),默认 false',
            },
          },
          required: ['question'],
        },
      },
    },
  },
]

/** @param {{ webAccess?: boolean }} opts */
export function toolDefinitions({ webAccess = true } = {}) {
  const defs = DEFS.filter((t) => (t.web ? webAccess : true))
  // 原生壳(Tauri)里追加 Mac 专属工具;浏览器里 isNative=false 自动不注册
  return (isNative ? [...defs, ...NATIVE_DEFS] : defs).map((t) => t.def)
}

export function toolIcon(name) {
  return (DEFS.find((t) => t.key === name) ?? NATIVE_DEFS.find((t) => t.key === name))?.icon ?? 'wrench'
}

/* —— 执行器 —— */

function safeCalculate(expression) {
  const expr = String(expression).trim().slice(0, 500)
  // 白名单:数字、运算符、括号、Math.xxx
  const stripped = expr.replaceAll(/Math\.[a-zA-Z]+/g, '')
  if (!/^[\d\s+\-*/%().,eE]*$/.test(stripped)) {
    throw new Error('表达式包含不允许的字符')
  }
  // 纯整数加减乘 → BigInt 精确计算,避免 float64 大数取整
  if (/^[\d\s+\-*()]+$/.test(expr)) {
    try {
      const bigExpr = expr.replaceAll(/\d+/g, (n) => `${n}n`)
      const value = new Function(`"use strict"; return (${bigExpr})`)()
      if (typeof value === 'bigint') return value
    } catch {
      /* 溢出/语法问题时退回 float */
    }
  }
  const value = new Function('Math', `"use strict"; return (${expr})`)(Math)
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw new Error('结果不是数字')
  }
  return value
}

/** Web Worker 沙盒执行 JS,捕获 console 输出与返回值 */
function runInSandbox(code, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const preamble = `
      self.fetch = undefined; self.XMLHttpRequest = undefined;
      self.WebSocket = undefined; self.importScripts = undefined;
      const __logs = [];
      const __fmt = (v) => { try { return typeof v === 'string' ? v : JSON.stringify(v) } catch { return String(v) } };
      console.log = console.info = console.warn = console.error = (...a) => __logs.push(a.map(__fmt).join(' '));
      self.onmessage = (e) => {
        let result, error;
        try { result = eval(e.data) } catch (err) { error = String(err && err.message || err) }
        let resultText;
        try { resultText = result === undefined ? undefined : __fmt(result) } catch { resultText = String(result) }
        self.postMessage({ logs: __logs.slice(0, 200), result: resultText, error });
      };
    `
    const blob = new Blob([preamble], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    let worker
    try {
      worker = new Worker(url)
    } catch (err) {
      URL.revokeObjectURL(url)
      resolve({ error: String(err) })
      return
    }
    const timer = setTimeout(() => {
      worker.terminate()
      URL.revokeObjectURL(url)
      resolve({ error: `执行超时(${timeoutMs / 1000}s)` })
    }, timeoutMs)
    worker.onmessage = (e) => {
      clearTimeout(timer)
      worker.terminate()
      URL.revokeObjectURL(url)
      resolve(e.data)
    }
    worker.onerror = (e) => {
      clearTimeout(timer)
      worker.terminate()
      URL.revokeObjectURL(url)
      resolve({ error: e.message || 'Worker error' })
    }
    worker.postMessage(String(code))
  })
}

/** HTML → 可读正文(标题 + 去脚本样式导航的文本) */
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const el of doc.querySelectorAll('script, style, noscript, svg, nav, footer, iframe')) {
    el.remove()
  }
  const title = doc.title?.trim()
  const body = (doc.body?.innerText ?? doc.body?.textContent ?? '')
    .replaceAll(/[ \t]+/g, ' ')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim()
  return title ? `# ${title}\n\n${body}` : body
}

export async function fetchUrl(url) {
  const target = String(url).trim()
  if (!/^https?:\/\//i.test(target)) throw new Error('URL 必须以 http(s):// 开头')

  // 直连(站点开放 CORS 时最快)→ 失败按序回退 CORS 代理
  const attempts = [
    target,
    `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
  ]
  let html = null
  let lastError = null
  for (const attemptUrl of attempts) {
    try {
      const res = await fetch(attemptUrl, { signal: AbortSignal.timeout(20000) })
      if (res.ok) {
        html = await res.text()
        break
      }
      lastError = `HTTP ${res.status}`
    } catch (err) {
      lastError = String(err?.message ?? err)
    }
  }
  if (html === null) throw new Error(`读取失败(${lastError})`)

  const text = /<\s*(html|body|div|p|head)[\s>]/i.test(html) ? htmlToText(html) : html.trim()
  if (!text) throw new Error('页面没有可读文本')
  return text.length > 8000 ? `${text.slice(0, 8000)}\n\n[已截断,原文 ${text.length} 字符]` : text
}

/** Bing 跳转链接(/ck/a?…&u=a1<base64url>)→ 真实 URL */
function decodeBingUrl(href) {
  try {
    const u = new URL(href).searchParams.get('u')
    if (u?.startsWith('a1')) {
      const b64 = u.slice(2).replaceAll('-', '+').replaceAll('_', '/')
      const decoded = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
      if (/^https?:\/\//.test(decoded)) return decoded
    }
  } catch {
    /* 解不开就保留原链接 */
  }
  return href
}

async function webSearch(query) {
  // 主源:Bing HTML 经 CORS 代理;后备:Wikipedia opensearch(官方 CORS)
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-hans`
    const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
    const items = [...doc.querySelectorAll('li.b_algo')]
      .slice(0, 6)
      .map((li) => {
        const a = li.querySelector('h2 a')
        const title = a?.textContent.trim()
        const href = a?.getAttribute('href')
        const snippet = (
          li.querySelector('.b_caption p, .b_lineclamp2, .b_paractl')?.textContent ?? ''
        ).trim()
        if (!title || !href) return null
        return `- **${title}**\n  ${decodeBingUrl(href)}\n  ${snippet.slice(0, 200)}`
      })
      .filter(Boolean)
    if (items.length) return `搜索「${query}」的结果:\n\n${items.join('\n')}`
    throw new Error('无结果')
  } catch {
    const res = await fetch(
      `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=5`,
      { signal: AbortSignal.timeout(15000) },
    )
    if (!res.ok) throw new Error(`搜索失败 HTTP ${res.status}`)
    const json = await res.json()
    const hits = (json.query?.search ?? []).map(
      (s) =>
        `- **${s.title}**\n  https://zh.wikipedia.org/wiki/${encodeURIComponent(s.title)}\n  ${s.snippet.replaceAll(/<[^>]+>/g, '').slice(0, 200)}`,
    )
    if (!hits.length) return '没有找到结果。'
    return `搜索「${query}」(维基百科后备源)的结果:\n\n${hits.join('\n')}`
  }
}

/* —— Web State Bridge(Chrome 感知桥,经 LocalAI 网关按需拉起)—— */

const BRIDGE = `${GATEWAY}/upstream/web-state-bridge`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const truncateText = (text, max = 8000) =>
  text.length > max ? `${text.slice(0, max)}\n\n[已截断,原文 ${text.length} 字符]` : text

async function bridgeFetch(path, init = {}, timeoutMs = 30000) {
  let res
  try {
    res = await fetch(`${BRIDGE}${path}`, { signal: AbortSignal.timeout(timeoutMs), ...init })
  } catch (err) {
    throw new Error(`bridge 不可达(LocalAI 网关 ${GATEWAY} 可能没有运行):${err?.message ?? err}`)
  }
  // bridge 刚被网关拉起或刚崩溃重启的瞬间会透传一次 502,等一下重试
  if (res.status === 502) {
    await sleep(1500)
    res = await fetch(`${BRIDGE}${path}`, { signal: AbortSignal.timeout(timeoutMs), ...init })
  }
  return res
}

async function bridgeHealth() {
  const res = await bridgeFetch('/health')
  if (!res.ok) throw new Error(`bridge 健康检查失败 HTTP ${res.status}`)
  return await res.json()
}

/** @returns {Promise<string | null>} 最新页面摘要 Markdown;还没有快照时为 null */
async function readPageSummary() {
  const res = await bridgeFetch('/latest/summary')
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`读取页面摘要失败 HTTP ${res.status}`)
  return await res.text()
}

async function browserStatus() {
  const health = await bridgeHealth()
  const agent = health.agent ?? {}
  const lines = [`bridge 运行中(v${health.version},由 LocalAI 网关按需托管)`]

  if (!agent.extensionConnected) {
    lines.push(
      'Chrome 扩展未连接:需要 Chrome 正在运行且加载了 Web State DevTools 扩展(扩展每 20 秒自动重连,稍等再试)。',
    )
    return lines.join('\n')
  }
  lines.push(`Chrome 扩展在线(v${agent.version ?? '?'})`)

  // 实时操控能力:优先用 ping 返回的 devAgentMode;旧版扩展没有该字段时用轻量动作探测
  let devMode = null
  try {
    const pong = await bridgeAction('ping', {}, 8000)
    devMode = typeof pong.devAgentMode === 'boolean' ? pong.devAgentMode : null
  } catch {
    /* ping 失败不阻断诊断 */
  }
  if (devMode == null) {
    try {
      await bridgeAction('get_text', { selector: 'title' }, 10000)
      devMode = true
    } catch (err) {
      devMode = /实时操控未开启/.test(String(err?.message)) ? false : null
    }
  }
  if (devMode === false) {
    lines.push(
      '实时操控未开启:browser_search / open_browser_page / browser_interact / look_at_browser_page 不可用。请让用户点击 Chrome 工具栏的 Web State DevTools 扩展图标,打开「Dev Agent Mode」开关。',
    )
  } else if (devMode === true) {
    lines.push('实时操控可用(Dev Agent Mode 已开启)。')
  }

  const res = await bridgeFetch('/latest')
  if (res.ok) {
    const snapshot = (await res.json()).snapshot ?? {}
    const capturedAt = snapshot.capturedAt ? new Date(snapshot.capturedAt) : null
    const ageMin = capturedAt ? Math.round((Date.now() - capturedAt.getTime()) / 60000) : null
    lines.push(
      `最新快照:${snapshot.page?.title ?? '(无标题)'} — ${snapshot.page?.url ?? '未知'}${ageMin != null ? `(${ageMin} 分钟前采集)` : ''}`,
    )
  } else {
    lines.push('还没有页面快照。')
  }
  return lines.join('\n')
}

/** bridge 冷启动后扩展最多要 20 秒左右才会重连,先等它在线 */
async function ensureExtension() {
  let health = await bridgeHealth()
  for (let i = 0; i < 8 && !health.agent?.extensionConnected; i++) {
    await sleep(3000)
    health = await bridgeHealth()
  }
  if (!health.agent?.extensionConnected) {
    throw new Error('Chrome 扩展未连接(Chrome 没在运行,或没有加载 Web State DevTools 扩展)')
  }
}

/** 经 /actions/run 同步执行一个扩展动作,返回 result */
async function bridgeAction(action, params = {}, timeoutMs = 60000) {
  const res = await bridgeFetch(
    '/actions/run',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params, timeoutMs }),
    },
    timeoutMs + 10000,
  )
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.ok) {
    const message = json?.error || `动作 ${action} 失败 HTTP ${res.status}`
    // 把扩展的权限闸门报错翻译成可执行的用户指引
    if (/Dev Agent Mode/i.test(message)) {
      throw new Error(
        '浏览器实时操控未开启。请告诉用户:点击 Chrome 工具栏的 Web State DevTools 扩展图标,打开「Dev Agent Mode」开关,然后重试。',
      )
    }
    throw new Error(message)
  }
  return json.result
}

/** 本会话在用户 Chrome 里复用的研究标签页;用户关掉后自动重开 */
let agentTabId = null
/** 同 URL 短路:模型重复打开同一页面时跳过导航,直接读现有页面 */
let lastNavUrl = null
let lastNavAt = 0

async function navigateAndCapture(url) {
  await ensureExtension()
  if (agentTabId != null && url === lastNavUrl && Date.now() - lastNavAt < 60000) {
    return { tabId: agentTabId, url, snapshot: null, reused: true }
  }
  // active:false = 后台标签页加载,不打断用户当前浏览(需扩展 ≥ 本次改动;旧版忽略该参数)
  const params = { url, waitMs: 1200, active: false }
  if (agentTabId != null) params.tabId = agentTabId
  let result
  try {
    result = await bridgeAction('navigate_and_capture', params, 90000)
  } catch (err) {
    // 权限类错误直接上抛;标签页被用户关闭才值得换新标签页重试
    if (agentTabId == null || /实时操控未开启|不可达/.test(String(err?.message))) throw err
    agentTabId = null
    result = await bridgeAction(
      'navigate_and_capture',
      { url, waitMs: 1200, active: false },
      90000,
    )
  }
  agentTabId = result.tabId ?? agentTabId
  lastNavUrl = url
  lastNavAt = Date.now()
  return result
}

/** 读取页面正文(分页;旧版扩展忽略 offset/maxChars 时退化为前 8000 字) */
async function readPageText(offset = 0) {
  const params = { offset, maxChars: 9000 }
  if (agentTabId != null) params.tabId = agentTabId
  const result = await bridgeAction('get_text', params)
  const text = (result.text ?? '').trim()
  if (!text) return offset > 0 ? '(没有更多内容了)' : '页面没有可读文本。'
  const footer =
    result.hasMore === true
      ? `\n\n[正文共 ${result.totalChars} 字符,已读到 ${(result.offset ?? offset) + result.text.length};继续读用 read_browser_page(part=text, offset=${(result.offset ?? offset) + result.text.length})]`
      : ''
  return text + footer
}

async function openBrowserPage(url) {
  const target = String(url ?? '').trim()
  if (!/^https?:\/\//i.test(target)) return '错误:URL 必须以 http(s):// 开头'
  const nav = await navigateAndCapture(target)
  // 一步到位返回正文:省掉「开页→再读全文」的额外工具轮
  const title = nav.snapshot?.title ?? nav.snapshot?.page?.title ?? ''
  let body
  try {
    body = await readPageText(0)
  } catch {
    body = (await readPageSummary()) ?? '(正文读取失败,可用 read_browser_page 重试)'
  }
  return `【${title || target}】${target}\n\n${body}`
}

async function readBrowserPage(part = 'summary', offset = 0) {
  if (part === 'text') {
    await ensureExtension()
    return await readPageText(offset)
  }
  if (part === 'links') {
    const res = await bridgeFetch('/latest')
    if (res.status === 404) return '还没有页面快照,先用 open_browser_page 打开一个页面。'
    if (!res.ok) return `错误:读取快照失败 HTTP ${res.status}`
    const snapshot = (await res.json()).snapshot ?? {}
    const links = (snapshot.links ?? [])
      .filter((l) => l.href && /^https?:\/\//.test(l.href))
      .slice(0, 60)
      .map((l) => `- ${(l.text || '(无文字)').slice(0, 80)} — ${l.href}`)
    if (!links.length) return '页面上没有提取到链接。'
    return truncateText(`页面链接(${links.length} 条):\n${links.join('\n')}`, 8000)
  }
  const summary = await readPageSummary()
  if (!summary) {
    return '还没有任何页面快照。可用 open_browser_page 打开并采集页面,或让用户在 Chrome 扩展 popup 里点「Capture & Send」。'
  }
  return truncateText(summary)
}

/** 搜索结果链接的通用过滤:解码 Bing 跳转、去广告与站内链接 */
function resolveResultUrl(href) {
  if (!href || href.includes('/aclk')) return null // Bing 广告
  const url = href.includes('bing.com/ck/a') ? decodeBingUrl(href) : href
  if (!/^https?:\/\//.test(url)) return null
  try {
    const host = new URL(url).hostname
    if (/(^|\.)(bing|microsoft|msn)\.com$/.test(host)) return null
  } catch {
    return null
  }
  return url
}

async function browserSearch(query) {
  const q = String(query ?? '').trim()
  if (!q) return '错误:缺少搜索关键词'
  await navigateAndCapture(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=zh-hans`)

  const res = await bridgeFetch('/latest')
  if (!res.ok) return `错误:读取搜索结果快照失败 HTTP ${res.status}`
  const snapshot = (await res.json()).snapshot ?? {}
  const links = snapshot.links ?? []
  const seen = new Set()
  const items = []
  const push = (title, url) => {
    if (seen.has(url)) return
    seen.add(url)
    items.push(`- **${title.slice(0, 100)}**\n  ${url}`)
  }

  // 首选:h2 结果标题 → 锚文本包含标题的最短链接(纯标题锚),标题干净且 URL 对得上
  const headings = (snapshot.headings ?? []).filter(
    (h) => h.level === 2 && (h.text ?? '').trim().length >= 12,
  )
  for (const h of headings) {
    if (items.length >= 10) break
    const title = h.text.trim()
    const exact = links.filter((l) => l.href && (l.text ?? '').includes(title))
    const pool = exact.length
      ? exact
      : links.filter((l) => l.href && (l.text ?? '').includes(title.slice(0, 18)))
    if (!pool.length) continue
    const best = pool.sort((a, b) => (a.text ?? '').length - (b.text ?? '').length)[0]
    const url = resolveResultUrl(best.href)
    if (url) push(title, url)
  }

  // 回填:标题匹配不足时用通用链接过滤补齐
  if (items.length < 3) {
    for (const link of links) {
      if (items.length >= 10) break
      const text = (link.text ?? '').trim()
      if (!text || text.length < 8) continue
      const url = resolveResultUrl(link.href)
      if (url) push(text, url)
    }
  }

  if (items.length) {
    // 附上搜索页可见文本(含各结果摘要):模型可以先筛选,不必逐个开页
    let snippets = ''
    try {
      const serp = await bridgeAction('get_text', {
        ...(agentTabId != null ? { tabId: agentTabId } : {}),
        maxChars: 2500,
      })
      const body = (serp.text ?? '').trim()
      if (body) snippets = `\n\n——搜索页摘要文本(供筛选,链接以上方列表为准)——\n${body}`
    } catch {
      /* 摘要拿不到不影响结果列表 */
    }
    return `搜索「${q}」的结果(按页面顺序,广告已过滤):\n\n${items.join('\n')}${snippets}\n\n用 open_browser_page 打开值得深入的链接。`
  }

  // 链接抽取失败(页面结构变化):退回读正文让模型自己看
  const text = await bridgeAction('get_text', agentTabId != null ? { tabId: agentTabId } : {})
  return truncateText(`没有解析出结果链接,以下是搜索页正文:\n\n${text.text ?? ''}`, 6000)
}

async function browserInteract({ action, selector, text, key }) {
  await ensureExtension()
  const tabParams = agentTabId != null ? { tabId: agentTabId } : {}
  try {
    switch (action) {
      case 'scroll_bottom':
        await bridgeAction('scroll', { ...tabParams, preset: 'bottom' })
        break
      case 'click':
        if (!selector) return '错误:click 需要 selector'
        await bridgeAction('click', { ...tabParams, selector })
        break
      case 'fill':
        if (!selector || text == null) return '错误:fill 需要 selector 和 text'
        await bridgeAction('fill', { ...tabParams, selector, text })
        break
      case 'press':
        if (!key) return '错误:press 需要 key'
        await bridgeAction('press', { ...tabParams, selector, key })
        break
      default:
        return `错误:未知动作 ${action}`
    }
  } catch (err) {
    const message = String(err?.message ?? err)
    // 找不到元素时给模型可执行的下一步,而不是让它瞎猜 selector
    if (/not found|找不到|Element/i.test(message)) {
      return `错误:${message}\n下一步:先 read_browser_page(part=summary) 查看页面元素的 bestSelector,或改用语义定位(如 role=button[name="加载更多"]、label="搜索")再试一次。`
    }
    throw err
  }
  // 动作后等页面响应并重新采集,保持快照与真实页面同步
  await sleep(1000)
  await bridgeAction('capture', tabParams, 60000)
  const summary = await readPageSummary()
  return `动作 ${action} 已执行,页面已重新采集。${summary ? `\n\n${truncateText(summary, 4000)}` : ''}`
}

/**
 * 缩放截图到 VLM 友好尺寸(长边 ≤1280)。
 * Retina 截图动辄 3MP+:视觉 token 超出 VLM 上下文会导致空输出,
 * 实测 vlm-fast 在长边 1280 内表现稳定。
 */
async function downscaleForVlm(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob()
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  if (scale >= 1) {
    bitmap.close()
    return { url: dataUrl, width: bitmap.width, height: bitmap.height }
  }
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(w, h)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
  const url = await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(out)
  })
  return { url, width: w, height: h }
}

async function lookAtBrowserPage(question, fullPage = false) {
  await ensureExtension()
  const shot = await bridgeAction(
    'capture_screenshot',
    {
      ...(agentTabId != null ? { tabId: agentTabId } : {}),
      format: 'jpeg',
      quality: 70,
      detachCdp: true,
      ...(fullPage ? { fullPage: true, maxDimension: 4000, maxPixels: 8_000_000 } : {}),
    },
    60000,
  )
  if (!shot?.data) return '错误:截图失败'
  const image = await downscaleForVlm(`data:${shot.mimeType};base64,${shot.data}`)

  // 本地 VLM 看图回答(冷启动可能要等模型加载)
  const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'vlm-fast',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: image.url } },
            {
              type: 'text',
              text: `这是浏览器里一个网页的截图(${image.width}×${image.height})。${question}\n\n请具体描述,如果问题涉及图片/图表,逐一说明每张图的内容和位置。`,
            },
          ],
        },
      ],
      max_tokens: 800,
      // 贪心解码(temp 0)对压缩网页截图会简并成复读或空输出,必须采样
      temperature: 0.7,
      stream: false,
    }),
    signal: AbortSignal.timeout(300000),
  })
  if (!res.ok) return `错误:视觉模型调用失败 HTTP ${res.status}`
  const json = await res.json()
  const answer = json.choices?.[0]?.message?.content?.trim()
  return answer || '视觉模型没有返回内容(图片可能过大或页面为空白)。'
}

/* —— Obsidian vault 知识检索(local-ai services/knowledge,经网关 upstream)—— */

const VAULT_API = `${GATEWAY}/upstream/vault`

async function searchNotes(query) {
  const res = await fetch(`${VAULT_API}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, k: 6 }),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`vault 服务 HTTP ${res.status}(首次调用需等索引服务拉起)`)
  const { results } = await res.json()
  if (!results?.length) return '笔记库中没有找到相关内容。'
  return results
    .map(
      (r) =>
        `### ${r.breadcrumb}\n(vault: ${r.vault} · path: ${r.path})\n${r.snippet}\n[在 Obsidian 打开](${r.obsidianUrl})`,
    )
    .join('\n\n---\n\n')
}

async function readNote(vault, path) {
  const params = new URLSearchParams({ vault: vault || 'vault', path })
  const res = await fetch(`${VAULT_API}/note?${params}`, {
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`读取失败 HTTP ${res.status}`)
  const note = await res.json()
  return `# ${note.title}(${note.path})\n\n${note.content}`
}

/* —— 本地生图(local-ai services/image,经网关 upstream)—— */

const IMAGE_API = `${GATEWAY}/upstream/image`

/** 本轮工具调用产出的图片(WebP data URL),由 chat 循环取走挂到消息上 */
let pendingImages = []
export function consumePendingImages() {
  const images = pendingImages
  pendingImages = []
  return images
}

/** PNG base64 → WebP data URL(约缩到 1/10 体积,localStorage 友好);失败退回 PNG */
async function pngToWebpDataUrl(b64) {
  const pngUrl = `data:image/png;base64,${b64}`
  try {
    const bitmap = await createImageBitmap(await (await fetch(pngUrl)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    bitmap.close()
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  } catch {
    return pngUrl
  }
}

/**
 * 用本地 LLM 把简短/模糊的生图提示扩写成结构化丰富描述(FLUX/GPT-Image 式)。
 * 覆盖主体/外观/动作/场景/光线/构图/风格/画质。失败时返回 null,由调用方回退原文,绝不阻断生成。
 */
async function enhancePrompt(prompt) {
  const sys =
    '你是生图提示词工程师。把用户给的简短或模糊的画面描述扩写成一段结构化、细节丰富的生图提示词,' +
    '覆盖:主体及外观细节、动作或姿态、场景与背景、光线与氛围、镜头与构图、艺术风格、画质。' +
    '严格保持用户的原意和主体,不要新增用户没暗示的核心元素。用中文输出(可保留必要的英文风格术语),' +
    '80-150 字,只输出提示词本身,不要任何解释、前缀、编号或引号。'
  try {
    const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llm-fast',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 400,
        stream: false,
        // instruct 式单轮扩写,关思考省时
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) return null
    const json = await res.json()
    let out = json.choices?.[0]?.message?.content?.trim()
    if (!out) return null
    out = out.replace(/^["“「『]+/, '').replace(/["”」』]+$/, '').trim()
    // 扩写理应更长;若模型没听话(更短/空),回退原文
    return out.length > prompt.length ? out : null
  } catch {
    return null
  }
}

async function generateImage(args) {
  const rawPrompt = String(args.prompt ?? '').trim()
  if (!rawPrompt) return '错误:prompt 不能为空'

  // Prompt 智能改写:纯 text2img 且(显式要求 或 提示过短)时,用本地 LLM 扩写。
  // 角色/风格模式下 prompt 是「场景增量」,扩写会稀释条件,故跳过。
  const isEdit = Boolean(args.character || args.style)
  let prompt = rawPrompt
  let enhancedFrom = null
  const wantEnhance =
    !isEdit &&
    (args.enhance_prompt === true || (args.enhance_prompt !== false && [...rawPrompt].length < 40))
  if (wantEnhance) {
    const better = await enhancePrompt(rawPrompt)
    if (better) {
      prompt = better
      enhancedFrom = rawPrompt
    }
  }

  const body = {
    model: args.quality === 'quality' ? 'image-quality' : 'image-fast',
    prompt,
    n: args.n,
    aspect: args.aspect,
    negative_prompt: args.negative_prompt,
    character: args.character,
    save_character: args.save_character,
    style: args.style,
    save_style: args.save_style,
    seed: args.seed,
    response_format: 'b64_json',
  }
  // 冷启动要加载 6-20B 模型,质量档 30 步生成本身要几分钟:超时给足;
  // 期间轮询 /progress,消息流里的进度卡(Message.svelte)实时显示阶段与步数
  startImageProgress()
  let res
  let json
  try {
    res = await fetch(`${IMAGE_API}/v1/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(900000),
    })
    json = await res.json().catch(() => null)
  } finally {
    stopImageProgress()
  }
  if (!res.ok) {
    throw new Error(json?.error?.message || `生图服务 HTTP ${res.status}`)
  }
  const lines = []
  if (enhancedFrom) {
    lines.push(`已把简短提示「${enhancedFrom}」自动扩写为:${prompt}`)
  }
  for (const item of json.data ?? []) {
    if (item.b64_json) {
      pendingImages.push(await pngToWebpDataUrl(item.b64_json))
    }
    lines.push(
      `图片已生成并直接展示给用户(${item.width}×${item.height},seed ${item.seed},模型 ${json.model},耗时 ${Math.round((json.timing_ms ?? 0) / 1000)}s)。`,
    )
    if (item.character_saved) {
      lines.push(
        `已注册角色「${item.character_saved.name}」(参考图 ${item.character_saved.refs} 张),之后可用 character="${item.character_saved.name}" 复用该角色。`,
      )
    }
    if (item.style_saved) {
      lines.push(
        `已注册风格「${item.style_saved.name}」(参考图 ${item.style_saved.refs} 张),之后可用 style="${item.style_saved.name}" 复用该风格。`,
      )
    }
  }
  if (!lines.length) return '错误:服务没有返回图片'
  lines.push('图片已在界面中展示,回答时简短确认即可,不要输出图片链接或 markdown 图片语法。')
  return lines.join('\n')
}

async function listCharacters() {
  const res = await fetch(`${IMAGE_API}/characters`, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`生图服务 HTTP ${res.status}`)
  const { characters } = await res.json()
  if (!characters?.length) {
    return '角色库为空。可在 generate_image 时传 save_character="角色名" 注册角色。'
  }
  return characters
    .map((c) => `- ${c.name}(参考图 ${c.refs} 张)${c.description ? `:${c.description}` : ''}`)
    .join('\n')
}

async function listStyles() {
  const res = await fetch(`${IMAGE_API}/styles`, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`生图服务 HTTP ${res.status}`)
  const { styles } = await res.json()
  if (!styles?.length) {
    return '风格库为空。可在 generate_image 时传 save_style="风格名" 注册风格。'
  }
  return styles
    .map((s) => `- ${s.name}(参考图 ${s.refs} 张)${s.description ? `:${s.description}` : ''}`)
    .join('\n')
}

/**
 * 执行一个工具调用,永远返回字符串(错误也以文本返回给模型)。
 * @param {string} name
 * @param {string} argsJson
 * @returns {Promise<string>}
 */
export async function executeTool(name, argsJson) {
  let args = {}
  try {
    args = argsJson ? JSON.parse(argsJson) : {}
  } catch {
    return '错误:工具参数不是合法 JSON'
  }
  if (isNativeTool(name)) {
    try {
      return await executeNativeTool(name, args)
    } catch (err) {
      return `原生工具执行失败:${err?.message ?? err}`
    }
  }
  try {
    switch (name) {
      case 'get_time': {
        const now = new Date()
        return `${now.toLocaleString('zh-CN', { dateStyle: 'full', timeStyle: 'medium' })}(ISO: ${now.toISOString()})`
      }
      case 'calculate': {
        const value = safeCalculate(args.expression)
        return `${args.expression} = ${value}`
      }
      case 'run_javascript': {
        const out = await runInSandbox(args.code)
        const parts = []
        if (out.logs?.length) parts.push(`输出:\n${out.logs.join('\n')}`)
        if (out.result !== undefined) parts.push(`返回值: ${out.result}`)
        if (out.error) parts.push(`错误: ${out.error}`)
        return parts.join('\n\n') || '(无输出)'
      }
      case 'save_memory': {
        // 小模型常忘记用第三人称,代码兜底:没有主语就补"用户",保证召回时无歧义
        const raw = String(args.content ?? '').trim()
        if (!raw) return '错误:记忆内容为空'
        const content = /^(用户|Ken|他|她)/i.test(raw) ? raw : `用户${raw}`
        const item = await addMemory(content)
        return `已记住:${item.text}`
      }
      case 'search_memory': {
        const results = await searchMemories(args.query, 5)
        const hits = results.filter((r) => r.score >= 0.2)
        if (!hits.length) return '没有找到相关记忆。'
        return hits.map((r) => `- ${r.item.text}`).join('\n')
      }
      case 'fetch_url':
        return await fetchUrl(args.url)
      case 'web_search':
        return await webSearch(args.query)
      case 'generate_image':
        return await generateImage(args)
      case 'list_characters':
        return await listCharacters()
      case 'list_styles':
        return await listStyles()
      case 'search_notes':
        return await searchNotes(args.query)
      case 'read_note':
        return await readNote(args.vault, args.path)
      case 'browser_status':
        return await browserStatus()
      case 'read_browser_page':
        return await readBrowserPage(args.part || 'summary', Number(args.offset) || 0)
      case 'open_browser_page':
        return await openBrowserPage(args.url)
      case 'browser_search':
        return await browserSearch(args.query)
      case 'browser_interact':
        return await browserInteract(args)
      case 'look_at_browser_page':
        return await lookAtBrowserPage(args.question ?? '这个页面上有什么?', args.fullPage === true)
      default:
        return `错误:未知工具 ${name}`
    }
  } catch (err) {
    return `错误:${err?.message ?? err}`
  }
}
