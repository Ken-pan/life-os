/**
 * 极简安全 Markdown 渲染器(流式友好,零依赖)。
 * 全部文本先 HTML 转义,只生成白名单标签,不放行任何原始 HTML。
 * 支持:代码块 / 行内 code / 粗斜体 / 删除线 / 标题 / 列表 / 引用 /
 * 分隔线 / 链接(仅 http·https) / 表格。
 */

import katex from 'katex'

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** LaTeX 公式 → KaTeX HTML(出错不抛,降级为红字提示) */
function renderMath(tex, display) {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      strict: false,
    })
  } catch {
    const d = display ? '$$' : '$'
    return escapeHtml(d + tex + d)
  }
}

/** 行内语法:先转义,再按占位符保护 code span,最后套用其余规则 */
function renderInline(raw) {
  const codeSpans = []
  // 占位符用 NUL 包裹索引(\x00<index>\x00):NUL 不会出现在模型文本里,也不受
  // 转义/加粗/斜体/链接规则影响。刻意不用「空格+数字+空格」——那会误伤正文里
  // 空格分隔的普通数字(如中文「将 5 升桶」),把数字当占位符吞掉。
  let text = raw.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(`<code>${escapeHtml(code)}</code>`)
    return `\x00${codeSpans.length - 1}\x00`
  })
  // 行内公式(code span 之后、转义之前抽取;NUL 占位符不受转义/内联规则影响;复用 codeSpans 占位池,与其索引天然对齐)
  const stashMath = (tex) => `\x00${codeSpans.push(renderMath(tex, false)) - 1}\x00`
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => stashMath(tex))
  text = text.replace(/(?<!\\)\$([^\n$]+?)\$/g, (m, tex) => {
    const t = tex.trim()
    // 防误判,以下情况保留原文不当公式:空、含首尾空格(多为货币 "$5 and $")、纯数字("$5")、
    // 或含中日韩字符——真·LaTeX 几乎不含中文,含中文的多是货币/正文里两个 $ 恰好夹住
    // (如定价 "$5/百万 token,$25/…"),误判成公式会渲染成乱码
    if (!t || t !== tex || /^[\d.,]+$/.test(t) || /[一-鿿]/.test(t)) return m
    return stashMath(tex)
  })
  text = escapeHtml(text)
  text = text
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, href) => {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
    })
  text = text.replace(/\x00(\d+)\x00/g, (_, i) => codeSpans[Number(i)] ?? '')
  return text
}

function renderTable(lines) {
  const rows = lines.map((line) =>
    line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim()),
  )
  const header = rows[0]
  const body = rows.slice(2)
  let html = '<div class="md-table-wrap"><table><thead><tr>'
  for (const cell of header) html += `<th>${renderInline(cell)}</th>`
  html += '</tr></thead><tbody>'
  for (const row of body) {
    html += '<tr>'
    for (let i = 0; i < header.length; i++) {
      html += `<td>${renderInline(row[i] ?? '')}</td>`
    }
    html += '</tr>'
  }
  html += '</tbody></table></div>'
  return html
}

/* —— 轻量语法高亮:注释/字符串/关键字/数字,词法级,全部先转义 —— */

const KEYWORDS = {
  js: 'const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof of in null undefined true false this super yield static get set',
  py: 'def return if elif else for while break continue import from as class try except finally raise with lambda pass global nonlocal assert yield async await del not and or in is None True False self print',
  sh: 'if then else elif fi for while do done case esac function echo exit return local export readonly cd source set unset shift',
  css: '',
  html: '',
  sql: 'select from where insert into update delete set values create table drop alter join left right inner outer on group by order limit having distinct as and or not null primary key',
}
const LANG_ALIAS = {
  javascript: 'js', typescript: 'js', ts: 'js', jsx: 'js', tsx: 'js', svelte: 'js',
  json: 'js', java: 'js', c: 'js', cpp: 'js', 'c++': 'js', go: 'js', rust: 'js', swift: 'js', kotlin: 'js',
  python: 'py', python3: 'py',
  bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh',
  mysql: 'sql', postgres: 'sql', postgresql: 'sql', sqlite: 'sql',
}

/** @returns {string} 高亮后的安全 HTML */
export function highlightCode(code, lang) {
  const family = LANG_ALIAS[lang] ?? (lang in KEYWORDS ? lang : null)
  if (!family) return escapeHtml(code)
  const kw = new Set((KEYWORDS[family] ?? '').split(' ').filter(Boolean))
  const comment =
    family === 'py' || family === 'sh'
      ? /#[^\n]*/y
      : family === 'sql'
        ? /--[^\n]*/y
        : /\/\/[^\n]*|\/\*[\s\S]*?\*\//y
  const rules = [
    ['cmt', comment],
    ['str', /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/y],
    ['num', /\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?\b/y],
    ['word', /[A-Za-z_$][\w$]*/y],
  ]
  let out = ''
  let i = 0
  while (i < code.length) {
    let matched = false
    for (const [kind, re] of rules) {
      re.lastIndex = i
      const m = re.exec(code)
      if (!m) continue
      const text = escapeHtml(m[0])
      if (kind === 'word') {
        out += kw.has(m[0]) ? `<span class="tok-kw">${text}</span>` : text
      } else {
        out += `<span class="tok-${kind}">${text}</span>`
      }
      i += m[0].length
      matched = true
      break
    }
    if (!matched) {
      out += escapeHtml(code[i])
      i++
    }
  }
  return out
}

const TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

/** 可在侧栏实时渲染的代码块语言 */
export const PREVIEWABLE_LANGS = new Set(['html', 'svg', 'xml'])

/**
 * @param {string} src markdown 文本(可为流式半成品)
 * @param {{ previewLabel?: string, caret?: boolean }} [opts]
 *   previewLabel:HTML/SVG 代码块的预览按钮文案;caret:在结尾追加流式光标
 * @returns {string} 安全 HTML
 */
export function renderMarkdown(src, opts = {}) {
  if (!src) return ''
  const lines = src.replaceAll('\r\n', '\n').split('\n')
  const out = []
  let paragraph = []
  let list = null // { ordered: boolean, items: string[] }

  const flushParagraph = () => {
    if (!paragraph.length) return
    out.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    const tag = list.ordered ? 'ol' : 'ul'
    out.push(`<${tag}>${list.items.map((i) => `<li>${renderInline(i)}</li>`).join('')}</${tag}>`)
    list = null
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 代码块(容忍流式中未闭合的 fence)
    const fence = line.match(/^\s*```\s*(\S*)/)
    if (fence) {
      flushAll()
      const lang = fence[1]
      const code = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      const langLabel = escapeHtml(lang || 'code')
      const langLower = (lang || '').toLowerCase()
      const previewBtn =
        opts.previewLabel && PREVIEWABLE_LANGS.has(langLower)
          ? `<button class="md-preview" type="button" data-md-preview data-lang="${escapeHtml(langLower)}">${escapeHtml(opts.previewLabel)}</button>`
          : ''
      out.push(
        `<div class="md-code"><div class="md-code-head"><span class="md-code-lang">${langLabel}</span>` +
          `<span class="md-code-actions">${previewBtn}<button class="md-copy" type="button" data-md-copy aria-label="copy">⧉</button></span></div>` +
          `<pre><code>${highlightCode(code.join('\n'), langLower)}</code></pre></div>`,
      )
      continue
    }

    // 展示型公式:$$…$$ 或 \[…\](可跨行,容忍流式中未闭合)
    const dispOpen = line.match(/^\s*(\$\$|\\\[)/)
    if (dispOpen) {
      flushAll()
      const openTok = dispOpen[1]
      const closeTok = openTok === '$$' ? '$$' : '\\]'
      let rest = line.trim().slice(openTok.length)
      const inlineEnd = rest.indexOf(closeTok)
      let tex
      if (inlineEnd !== -1) {
        tex = rest.slice(0, inlineEnd) // 单行 $$…$$
      } else {
        const buf = [rest]
        i++
        while (i < lines.length && !lines[i].includes(closeTok)) {
          buf.push(lines[i])
          i++
        }
        if (i < lines.length) {
          buf.push(lines[i].slice(0, lines[i].indexOf(closeTok)))
        }
        tex = buf.join('\n')
      }
      out.push(renderMath(tex.trim(), true))
      continue
    }

    if (!line.trim()) {
      flushAll()
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushAll()
      const level = Math.min(heading[1].length + 2, 6) // 语义降级:# → h3 起
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      continue
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flushAll()
      out.push('<hr>')
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      flushAll()
      const quote = [line.replace(/^\s*>\s?/, '')]
      while (i + 1 < lines.length && /^\s*>\s?/.test(lines[i + 1])) {
        i++
        quote.push(lines[i].replace(/^\s*>\s?/, ''))
      }
      out.push(
        `<blockquote>${renderMarkdown(quote.join('\n'), { ...opts, caret: false })}</blockquote>`,
      )
      continue
    }

    // 表格:当前行含 |,下一行是分隔行
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      flushAll()
      const tableLines = [line, lines[i + 1]]
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        tableLines.push(lines[i])
        i++
      }
      i--
      out.push(renderTable(tableLines))
      continue
    }

    const unordered = line.match(/^\s*[-*+]\s+(.*)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (unordered || ordered) {
      flushParagraph()
      const isOrdered = Boolean(ordered)
      if (!list || list.ordered !== isOrdered) {
        flushList()
        list = { ordered: isOrdered, items: [] }
      }
      list.items.push((unordered ?? ordered)[1])
      continue
    }

    if (list) {
      // 列表项的续行(缩进内容并入上一项)
      if (/^\s{2,}\S/.test(line)) {
        list.items[list.items.length - 1] += ` ${line.trim()}`
        continue
      }
      flushList()
    }
    paragraph.push(line)
  }
  flushAll()
  // 流式光标:尽量贴到最后一段文字末尾(常见收尾),否则独立成行
  if (opts.caret && out.length) {
    const caret = '<span class="md-caret" aria-hidden="true"></span>'
    const lastIdx = out.length - 1
    if (out[lastIdx].endsWith('</p>')) {
      out[lastIdx] = `${out[lastIdx].slice(0, -4)}${caret}</p>`
    } else {
      out.push(caret)
    }
  }
  return out.join('')
}

/**
 * 拆出 <think> 思考块(qwen 思考模式防御;流式中未闭合也可用)。
 * 三种形态:<think>…</think>…;流式未闭合的 <think>…;
 * 孤立 </think>(开标签被模板吃掉,或 mlx-lm 在工具调用轮把闭合标签漏进 content)——
 * 闭合标签之前的部分都算思考。
 * @returns {{ thinking: string, answer: string, thinkingOpen: boolean }}
 */
export function splitThinking(text) {
  if (!text.startsWith('<think>')) {
    const orphan = text.indexOf('</think>')
    if (orphan === -1) {
      return { thinking: '', answer: text, thinkingOpen: false }
    }
    return {
      thinking: text.slice(0, orphan).trim(),
      answer: text.slice(orphan + 8).replace(/^\n+/, ''),
      thinkingOpen: false,
    }
  }
  const end = text.indexOf('</think>')
  if (end === -1) {
    return { thinking: text.slice(7), answer: '', thinkingOpen: true }
  }
  return {
    thinking: text.slice(7, end).trim(),
    answer: text.slice(end + 8).replace(/^\n+/, ''),
    thinkingOpen: false,
  }
}
