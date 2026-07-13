import { addMemory, searchMemories } from '$lib/memory.svelte.js'

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
          '把关于用户的一条重要事实存入长期记忆(跨对话持久)。当用户告诉你偏好、背景、正在做的事,或明确要求"记住"时使用。内容用第三人称一句话概括。',
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
        description: '在长期记忆中语义检索与主题相关的事实。当需要回忆用户此前告诉过你的信息时使用。',
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
          '读取一个网页并返回其正文(Markdown)。当用户给出链接、或 web_search 的结果需要深入查看时使用。',
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
          '在互联网上搜索。当问题涉及最新信息、新闻、你不确定的事实、或用户明确要求搜索时使用。返回结果列表(标题/链接/摘要);要看详情用 fetch_url 打开具体链接。',
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
]

/** @param {{ webAccess?: boolean }} opts */
export function toolDefinitions({ webAccess = true } = {}) {
  return DEFS.filter((t) => (t.web ? webAccess : true)).map((t) => t.def)
}

export function toolIcon(name) {
  return DEFS.find((t) => t.key === name)?.icon ?? 'wrench'
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

async function fetchUrl(url) {
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
        const item = await addMemory(args.content)
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
      default:
        return `错误:未知工具 ${name}`
    }
  } catch (err) {
    return `错误:${err?.message ?? err}`
  }
}
