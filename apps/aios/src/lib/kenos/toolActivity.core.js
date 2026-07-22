/**
 * Human-readable Tool Activity Card summaries (Phase 2).
 * Keep tool internals folded; surface what Kenos did.
 */

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function parseToolArgs(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw)
  }
  try {
    const v = JSON.parse(String(raw || '{}'))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

/**
 * @param {string | undefined} result
 * @returns {number | null}
 */
export function countSearchHits(result) {
  const text = String(result || '')
  if (!text || text.startsWith('错误')) return null
  // Common local/tool shapes: "N results", JSON arrays, markdown list lines.
  const labeled = text.match(/(\d+)\s*(?:results?|条|个结果|来源)/i)
  if (labeled) return Number(labeled[1])
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.length
    if (Array.isArray(parsed?.results)) return parsed.results.length
    if (Array.isArray(parsed?.items)) return parsed.items.length
  } catch {
    /* not json */
  }
  const bullets = text
    .split('\n')
    .filter((l) => /^\s*[-*•]\s+/.test(l) || /^\s*\d+\.\s+/.test(l))
  return bullets.length > 0 ? bullets.length : null
}

/**
 * @param {string | undefined} url
 */
export function hostOfUrl(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '')
  } catch {
    return String(url || '').trim()
  }
}

/**
 * @param {{
 *   name?: string
 *   arguments?: string | Record<string, unknown>
 *   result?: string
 *   running?: boolean
 *   images?: unknown[]
 * }} tc
 * @param {{
 *   tTool?: (name: string) => string
 *   locale?: 'zh' | 'en'
 * }} [opts]
 */
export function summarizeToolActivity(tc, opts = {}) {
  const locale = opts.locale === 'en' ? 'en' : 'zh'
  const name = String(tc?.name || '')
  const args = parseToolArgs(tc?.arguments)
  const running = Boolean(tc?.running)
  const toolLabel =
    typeof opts.tTool === 'function' ? opts.tTool(name) : name || 'tool'

  /** @type {string} */
  let title
  /** @type {string} */
  let detail = ''

  switch (name) {
    case 'browser_search':
    case 'web_search': {
      const n = countSearchHits(tc?.result)
      const q = String(args.query || '').trim()
      if (running) {
        title =
          locale === 'en' ? 'Searching the web…' : '正在搜索网页…'
      } else if (n != null) {
        title =
          locale === 'en'
            ? `Searched ${n} web source${n === 1 ? '' : 's'}`
            : `搜索了 ${n} 个网页来源`
      } else {
        title =
          locale === 'en' ? 'Searched the web' : '搜索了网页'
      }
      detail = q
      break
    }
    case 'open_browser_page':
    case 'fetch_url': {
      const host = hostOfUrl(/** @type {string} */ (args.url))
      title = running
        ? locale === 'en'
          ? 'Opening page…'
          : '正在打开网页…'
        : locale === 'en'
          ? `Opened ${host || 'a page'}`
          : `打开了 ${host || '网页'}`
      detail = host
      break
    }
    case 'search_notes':
    case 'ask_notes':
    case 'search_memory': {
      const q = String(args.query || '').trim()
      title = running
        ? locale === 'en'
          ? 'Searching notes…'
          : '正在搜索笔记…'
        : locale === 'en'
          ? 'Searched notes'
          : '搜索了笔记'
      detail = q
      break
    }
    case 'calculate': {
      const expr = String(args.expression || '').trim()
      title = running
        ? locale === 'en'
          ? 'Calculating…'
          : '正在计算…'
        : locale === 'en'
          ? 'Ran a calculation'
          : '完成了计算'
      detail = expr
      break
    }
    case 'generate_image': {
      const n = Array.isArray(tc?.images) ? tc.images.length : 0
      title = running
        ? locale === 'en'
          ? 'Generating image…'
          : '正在生成图片…'
        : n > 0
          ? locale === 'en'
            ? `Generated ${n} image${n === 1 ? '' : 's'} locally`
            : `本地生成了 ${n} 张图片`
          : locale === 'en'
            ? 'Generated an image locally'
            : '本地生成了图片'
      detail =
        locale === 'en' ? 'Not uploaded to cloud' : '未上传云端'
      break
    }
    case 'run_sql':
    case 'query_data':
    case 'work_query': {
      title = running
        ? locale === 'en'
          ? 'Running a read-only query…'
          : '正在运行只读查询…'
        : locale === 'en'
          ? 'Ran a read-only query'
          : '在数据中运行了只读查询'
      detail = locale === 'en' ? 'Read-only' : '只读'
      break
    }
    default: {
      title = running
        ? locale === 'en'
          ? `Running ${toolLabel}…`
          : `正在执行 ${toolLabel}…`
        : locale === 'en'
          ? `Used ${toolLabel}`
          : `使用了 ${toolLabel}`
      break
    }
  }

  const failed =
    !running &&
    typeof tc?.result === 'string' &&
    (tc.result.startsWith('错误') || /^error\b/i.test(tc.result))

  return {
    title,
    detail: detail.slice(0, 80),
    running,
    failed,
    statusLabel: running
      ? locale === 'en'
        ? 'Running'
        : '进行中'
      : failed
        ? locale === 'en'
          ? 'Failed'
          : '失败'
        : locale === 'en'
          ? 'Done'
          : '完成',
  }
}
