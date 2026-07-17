/**
 * 极简安全 Markdown 渲染器（零依赖，为 KnowledgeOS 阅读视图）。
 * 全部文本先 HTML 转义，只生成白名单标签，不放行原始 HTML。
 * 支持：标题 / 粗斜体 / 删除线 / 行内 code / 代码块 / 列表 / 引用 / 分隔线 /
 * 链接（http·https）/ Obsidian [[wikilink]]。
 *
 * wikilink：`[[目标]]` 与 `[[目标|显示名]]` → <a data-wikilink="目标">，
 * 由消费方（NoteReader）委托点击后 resolve 到同名条目并跳转。
 */

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** 抽出所有 [[wikilink]] 目标（去 |显示名、去 #锚点），用于反向链接索引。 */
export function extractWikilinks(text) {
  const out = []
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = m[1].split('|')[0].split('#')[0].trim()
    if (target) out.push(target)
  }
  return [...new Set(out)]
}

/** 行内语法：先保护 code span，再抽 wikilink / 链接，最后转义 + 加粗斜体。 */
function renderInline(raw) {
  const stash = []
  const put = (html) => `\x00${stash.push(html) - 1}\x00`

  // 1. 行内 code（保护内部字符不被后续规则啃）
  let text = raw.replace(/`([^`]+)`/g, (_, code) => put(`<code>${escapeHtml(code)}</code>`))

  // 2. wikilink [[目标|显示]] —— 在转义前抽走，data 属性存原始目标
  text = text.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const [target, label] = inner.split('|')
    const t = target.trim()
    const shown = (label ?? target).trim()
    return put(
      `<a class="wikilink" data-wikilink="${escapeHtml(t)}" href="#">${escapeHtml(shown)}</a>`,
    )
  })

  // 3. 显式链接 [label](url) → 裸 url
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, href) =>
    put(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`),
  )
  text = text.replace(/(?<![("])(https?:\/\/[^\s<）]+)/g, (url) =>
    put(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`),
  )

  // 4. 转义正文，套用加粗 / 斜体 / 删除线
  text = escapeHtml(text)
  text = text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<em>$1</em>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')

  // 5. 还原占位符
  return text.replace(/\x00(\d+)\x00/g, (_, i) => stash[Number(i)])
}

/** 块级：逐行状态机，处理代码块 / 标题 / 列表 / 引用 / 分隔线 / 段落。 */
export function renderMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n')
  const html = []
  let i = 0
  let listType = null // 'ul' | 'ol' | null

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    // 代码块 ```lang
    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      closeList()
      const body = []
      i += 1
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i])
        i += 1
      }
      i += 1 // 跳过收尾 ```
      html.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`)
      continue
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      closeList()
      const level = heading[1].length
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      i += 1
      continue
    }

    // 分隔线
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList()
      html.push('<hr />')
      i += 1
      continue
    }

    // 引用
    if (/^>\s?/.test(line)) {
      closeList()
      const quote = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }
      html.push(`<blockquote>${renderInline(quote.join(' '))}</blockquote>`)
      continue
    }

    // 无序 / 有序列表
    const ul = line.match(/^[-*+]\s+(.*)$/)
    const ol = line.match(/^\d+\.\s+(.*)$/)
    if (ul || ol) {
      const want = ul ? 'ul' : 'ol'
      if (listType !== want) {
        closeList()
        html.push(`<${want}>`)
        listType = want
      }
      html.push(`<li>${renderInline((ul ?? ol)[1])}</li>`)
      i += 1
      continue
    }

    // 空行
    if (line.trim() === '') {
      closeList()
      i += 1
      continue
    }

    // 段落（合并连续非空非块级行）
    closeList()
    const para = [line]
    i += 1
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6}\s|```|>|\s*(-{3,}|\*{3,}|_{3,})\s*$|[-*+]\s|\d+\.\s)/.test(lines[i])
    ) {
      para.push(lines[i])
      i += 1
    }
    html.push(`<p>${renderInline(para.join(' '))}</p>`)
  }

  closeList()
  return html.join('\n')
}
