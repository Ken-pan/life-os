/**
 * Reply output guards — detect hard-constraint leaks and build one-shot rewrite prompts.
 * Pure module (no Svelte) so unit tests stay dependency-free.
 *
 * Application-level enforcement on top of system-prompt primacy
 * (prompt alone is the weakest layer for local mid-size models).
 */

/**
 * User asked to plan without code / implementation dump.
 * @param {string} userText
 */
export function userForbidsCode(userText) {
  const t = String(userText || '')
  return /先别写代码|不要写代码|别写代码|先不要代码|不要给代码|别给代码|不要代码块|先别写实现|不要写函数/.test(
    t,
  )
}

/**
 * Assistant leaked code-like implementation despite a no-code ask.
 * @param {string} assistantText
 */
export function assistantLeakedCode(assistantText) {
  const t = String(assistantText || '')
  if (/```/.test(t)) return true
  if (/\bfunction\s+[A-Za-z_][\w]*/.test(t)) return true
  if (/\bdef\s+[A-Za-z_][\w]*/.test(t)) return true
  if (/\b(async\s+)?function\b/.test(t)) return true
  if (
    /\b(get|set|add|toggle|fetch|create|update|delete)[A-Z][A-Za-z0-9_]*\s*\(/.test(
      t,
    )
  )
    return true
  if (/\bimport\s+.+from\s+['"]/.test(t)) return true
  if (/#include\s+</.test(t)) return true
  if (/\bNext\.js\b|\bReact\b|\bVue\b|\bSvelte\b|Tailwind/.test(t)) return true
  if (
    /技术栈/.test(t) &&
    /(React|Vue|Svelte|Tailwind|Next\.js|HTML\/CSS)/.test(t)
  )
    return true
  if (/\bSQLite\b|\blocalStorage\b|IndexedDB/.test(t)) return true
  if (/HTML\/CSS|原生 HTML/.test(t)) return true
  return false
}

/**
 * @param {string} userText
 */
export function userProvidedMetrics(userText) {
  const t = String(userText || '')
  return /\d+\s*%|\d+\s*倍|提升\s*\d+|降低\s*\d+|加快\s*\d+|减少\s*\d+/.test(t)
}

/**
 * @param {string} assistantText
 */
export function assistantFabricatedMetrics(assistantText) {
  const t = String(assistantText || '')
  if (/(提升|降低|加快|减少|增长|提速|优化)[^。\n]{0,12}\d+\s*%/.test(t))
    return true
  if (/\d+\s*%[^。\n]{0,12}(提升|降低|加快|更快|性能|延迟|速度)/.test(t))
    return true
  if (/提升\s*\d+\s*%|\d+\s*%\s*(更快|提升|优化)/.test(t)) return true
  return false
}

/**
 * @param {string} userText
 */
export function userAskedForCopyOrTitles(userText) {
  const t = String(userText || '')
  return /标题|文案|slogan|标语|邮件|推送|营销|改写|更短|更具体|宣传/i.test(t)
}

/**
 * @param {string} userText
 */
export function userShowsBlockedAnxiety(userText) {
  const t = String(userText || '')
  if (!t) return false
  if (
    /给我.*(周|月).*计划|拆成\s*\d+\s*周|三个月.*计划|完整计划|里程碑表/.test(t)
  )
    return false
  return /焦虑|好慌|好累|不知道从哪|无从下手|压力好大|崩溃|拖延|还没开始|一直没动|不知道怎么开始/.test(
    t,
  )
}

/**
 * @param {string} assistantText
 */
export function assistantDumpedLongPlan(assistantText) {
  const t = String(assistantText || '')
  if (!t) return false
  return (
    /\|\s*阶段\s*\|/.test(t) ||
    /#{1,3}[^\n]*(12\s*周|三个月|冲刺计划|极简执行计划|分周计划)/.test(t) ||
    /第\s*1\s*[-–—]\s*2\s*周|第1-2周|第\s*3\s*[-–—]\s*5\s*周|第\s*11\s*[-–—]\s*12\s*周/.test(
      t,
    )
  )
}

/**
 * User demanded strict output shape (no preamble / only X).
 * @param {string} userText
 */
export function userAsksStrictFormat(userText) {
  const t = String(userText || '')
  return /只要|仅输出|不要其他字|不要开场白|只回答一个词|只答|一行回答|只用|仅用|不要解释/.test(
    t,
  )
}

/**
 * Compact character count (whitespace stripped) — matches QA word-limit probes.
 * @param {string} text
 */
export function compactCharCount(text) {
  return String(text || '').replace(/\s/g, '').length
}

/**
 * Parse an explicit max length from the user turn, if any.
 * @param {string} userText
 * @returns {number | null}
 */
export function parseUserMaxChars(userText) {
  const t = String(userText || '')
  const m =
    t.match(/(?:不超过|最多|压到|控制在|≤|<=)\s*(\d+)\s*字/) ||
    t.match(/(\d+)\s*字(?:以内|左右|上下)?/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 && n <= 2000 ? n : null
}

/**
 * Assistant violated strict format / length constraints.
 * @param {string} userText
 * @param {string} assistantText
 */
export function assistantViolatesStrictFormat(userText, assistantText) {
  const u = String(userText || '')
  const a = String(assistantText || '')
  if (!userAsksStrictFormat(u) && parseUserMaxChars(u) == null) return false

  const maxChars = parseUserMaxChars(u)
  if (maxChars != null && compactCharCount(a) > maxChars + 2) return true

  if (!userAsksStrictFormat(u)) return false

  // One-word / one-line asks
  if (/只回答一个词|只答名称|只答城市名|只答一个词/.test(u)) {
    const lines = a
      .trim()
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length > 2 || compactCharCount(a) > 40) return true
  }

  // “只要清单 / 不要其他字 / 不要开场白”
  if (/不要其他字|不要开场白|只要清单|仅输出|不要解释/.test(u)) {
    if (/^(好的|当然|没问题|以下是|下面是|说明[：:])/m.test(a.trim()))
      return true
    if (/###\s*说明|补充说明|注意事项：/.test(a) && compactCharCount(a) > 200)
      return true
    // Long prose after a short list ask
    if (/只要清单|仅输出/.test(u) && compactCharCount(a) > 450) return true
  }

  return false
}

/**
 * Vague / underspecified asks that should not get a long intake questionnaire.
 * @param {string} userText
 */
export function userIsVagueRequest(userText) {
  const t = String(userText || '').trim()
  if (!t) return false
  if (t.length > 80) return false
  if (/帮我弄|弄一下|那个事|随便|怎么弄|搞一下|处理一下|整一下/.test(t))
    return true
  // Very short imperative without details
  return t.length <= 16 && /帮|弄|整|搞|看看/.test(t)
}

/**
 * Count top-level clarifying questions in an assistant reply.
 * @param {string} assistantText
 */
export function countClarifyingQuestions(assistantText) {
  const t = String(assistantText || '')
  const numbered = t.match(/^\s*(?:\d+[\.\、\)]|[-*]\s+\*\*[^*]+\*\*)/gm) || []
  // Prefer numbered intake items when present
  if (numbered.length >= 3) return numbered.length
  const marks = t.match(/[？?]/g) || []
  return marks.length
}

/**
 * @param {string} assistantText
 */
export function assistantHasAssumptionPlan(assistantText) {
  return /假设方案|最小方案|若你暂时|如果你希望立刻|先按这个假设/.test(
    String(assistantText || ''),
  )
}

/**
 * Over-clarification without offering an assumption path.
 * @param {string} userText
 * @param {string} assistantText
 */
export function assistantOverClarifies(userText, assistantText) {
  if (!userIsVagueRequest(userText)) return false
  const n = countClarifyingQuestions(assistantText)
  if (n <= 3) return false
  // 4+ questions is over-budget unless already paired with an assumption plan AND still <=5
  if (assistantHasAssumptionPlan(assistantText) && n <= 5) return false
  return true
}

/**
 * @param {string} userText
 */
export function shouldPreferQualityModel(userText) {
  const t = String(userText || '')
  if (!t) return false
  if (/更短[\s\S]{0,20}更具体|更具体[\s\S]{0,20}更短|各改一版|分别改/.test(t))
    return true
  if (
    /(只要|仅输出|不要其他字|不要开场白).{0,40}(清单|表格|一行|一个词|JSON)/.test(
      t,
    )
  )
    return true
  if (
    /不超过\s*\d+\s*字|≤\s*\d+\s*字|最多\s*\d+\s*字/.test(t) &&
    /改|写|润色|压缩/.test(t)
  ) {
    return true
  }
  let cues = 0
  if (/只要|仅输出|不要其他字|不要开场白/.test(t)) cues++
  if (/表格|JSON|一行|一个词|checkbox|勾选/.test(t)) cues++
  if (/分别|各|同时满足/.test(t)) cues++
  if (/先别|不要写代码|禁/.test(t)) cues++
  return cues >= 2
}

/** Read-only tools safe to keep when the conversation has images (vision path). */
export const VISION_SAFE_TOOL_NAMES = Object.freeze([
  'get_time',
  'calculate',
  'run_javascript',
  'search_memory',
  'save_memory',
  'search_notes',
  'read_note',
  'ask_notes',
  'life_os_today',
  'planner_tasks',
  'finance_summary',
])

/**
 * @param {Array<{ type?: string, function?: { name?: string } }>|undefined} tools
 * @param {boolean} visionMode
 */
export function filterToolsForVision(tools, visionMode) {
  if (!visionMode || !tools?.length) return tools
  const allow = new Set(VISION_SAFE_TOOL_NAMES)
  return tools.filter((t) => allow.has(t?.function?.name || ''))
}

/**
 * @typedef {{
 *   kind:
 *     | 'no-code'
 *     | 'no-fabricated-metrics'
 *     | 'anxiety-today-only'
 *     | 'strict-format'
 *     | 'clarify-budget',
 *   note: string,
 * }} ReplyGuardViolation
 */

/**
 * @param {string} userText
 * @param {string} assistantText
 * @returns {ReplyGuardViolation[]}
 */
export function detectReplyGuardViolations(userText, assistantText) {
  /** @type {ReplyGuardViolation[]} */
  const out = []
  if (userForbidsCode(userText) && assistantLeakedCode(assistantText)) {
    out.push({
      kind: 'no-code',
      note: '用户要求先别写代码,但回复含代码块或实现级函数名',
    })
  }
  if (
    !userProvidedMetrics(userText) &&
    assistantFabricatedMetrics(assistantText)
  ) {
    out.push({
      kind: 'no-fabricated-metrics',
      note: '用户未提供数据,回复编造了百分比/提升幅度',
    })
  }
  if (
    userShowsBlockedAnxiety(userText) &&
    assistantDumpedLongPlan(assistantText)
  ) {
    out.push({
      kind: 'anxiety-today-only',
      note: '用户焦虑/阻塞,但回复附带了多周长计划',
    })
  }
  if (assistantViolatesStrictFormat(userText, assistantText)) {
    out.push({
      kind: 'strict-format',
      note: '用户要求严格格式/字数,但回复超限或夹带说明',
    })
  }
  if (assistantOverClarifies(userText, assistantText)) {
    out.push({
      kind: 'clarify-budget',
      note: '模糊请求下澄清问题过多且未给假设方案',
    })
  }
  return out
}

/**
 * @param {ReplyGuardViolation[]} violations
 * @param {string} userText
 * @param {string} draft
 */
export function buildReplyGuardRewritePrompt(violations, userText, draft) {
  const kinds = new Set(violations.map((v) => v.kind))
  const rules = []
  if (kinds.has('no-code')) {
    rules.push(
      '用户要求先别写代码/实现:只保留阶段、验收标准、风险与清单;删除所有代码块、函数名、API 签名、import、伪代码,以及具体技术栈/存储选型(如 React/Vue/SQLite/localStorage/HTML/CSS)。改用“本地数据 / 界面草图 / 交互验收”等产品语言。',
    )
  }
  if (kinds.has('no-fabricated-metrics')) {
    rules.push(
      '删除一切无来源的百分比、“提升 X%”、“加快 N%”等量化宣传;改成定性表述(如“响应更快”),除非用户原文已给出数字。',
    )
  }
  if (kinds.has('anxiety-today-only')) {
    rules.push(
      '用户处于焦虑/阻塞:只保留「今天约 2 小时内可完成的一件具体事」及必要步骤;删除所有多周/三个月/12 周表格与阶段路线图。末尾可用一句话询问是否需要更长计划,不要主动展开。',
    )
  }
  if (kinds.has('strict-format')) {
    const maxChars = parseUserMaxChars(userText)
    rules.push(
      maxChars
        ? `严格服从格式与字数:去空白后不超过 ${maxChars} 字;不要开场白、不要解释段、不要“以下是”。`
        : '严格服从用户格式约束(只要/仅输出/不要其他字/不要开场白):删除前言与补充说明,只留被要求的正文。',
    )
  }
  if (kinds.has('clarify-budget')) {
    rules.push(
      '请求模糊:同一轮最多保留 3 个关键澄清问题,并必须附带一个简短的假设方案(写明假设),让用户可直接开干或改正。删除多余问卷项。',
    )
  }
  return [
    '你是修订器。下面有一份助手草稿违反了用户硬约束。请输出修订后的完整回复。',
    '只输出修订后的正文,不要解释你改了什么,不要加前言。',
    `硬约束:\n- ${rules.join('\n- ')}`,
    `用户原话:\n${userText}`,
    `助手草稿:\n${draft}`,
  ].join('\n\n')
}

/**
 * @param {string} text
 */
export function scrubNoCodeLeaks(text) {
  let t = String(text || '')
  t = t.replace(/```[\s\S]*?```/g, '（已省略实现细节）')
  t = t
    .split('\n')
    .filter((line) => {
      if (
        /\b(get|set|add|toggle|fetch|create|update|delete)[A-Z][A-Za-z0-9_]*\s*\(/.test(
          line,
        )
      ) {
        return false
      }
      if (
        /\bSQLite\b|\blocalStorage\b|IndexedDB|\bReact\b|\bVue\b|\bSvelte\b|Tailwind|\bNext\.js\b|HTML\/CSS|原生 HTML/.test(
          line,
        )
      ) {
        return false
      }
      return true
    })
    .join('\n')
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * @param {string} text
 */
export function scrubFabricatedMetrics(text) {
  let t = String(text || '')
  t = t.replace(
    /(提升|降低|加快|减少|增长|提速|优化)[^。\n]{0,12}\d+\s*%/g,
    '$1（幅度未验证）',
  )
  t = t.replace(
    /\d+\s*%[^。\n]{0,12}(提升|降低|加快|更快|性能|延迟|速度)/g,
    '明显$1',
  )
  t = t.replace(/提升\s*\d+\s*%/g, '明显提升')
  return t
}

/**
 * @param {string} text
 */
export function scrubLongPlanDump(text) {
  let t = String(text || '')
  const cut = t.search(
    /\n#{1,3}[^\n]*(三个月|12\s*周|冲刺计划|极简执行计划|分周计划)|\n\|[^\n]*阶段[^\n]*\|/,
  )
  if (cut > 40) t = t.slice(0, cut).trim()
  t = t.replace(/\n\|[^\n]*阶段[^\n]*\|[\s\S]*$/m, '').trim()
  t = t
    .replace(
      /\n#{1,3}[^\n]*(三个月|12\s*周|冲刺计划|极简执行计划)[\s\S]*$/m,
      '',
    )
    .trim()
  if (!/更长计划|完整计划|需要的话/.test(t)) {
    t = `${t}\n\n需要的话我再给你更长的分周计划。`
  }
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Trim to max compact chars at a soft boundary.
 * @param {string} text
 * @param {number} maxChars
 */
export function scrubToMaxChars(text, maxChars) {
  const raw = String(text || '').trim()
  if (compactCharCount(raw) <= maxChars) return raw
  // Prefer first paragraph / first lines
  const parts = raw.split(/\n+/)
  let out = ''
  for (const p of parts) {
    const next = out ? `${out}\n${p}` : p
    if (compactCharCount(next) > maxChars) break
    out = next
  }
  if (!out) {
    // Hard cut on compact stream then restore minimal spaces
    const compact = raw.replace(/\s/g, '')
    out = compact.slice(0, maxChars)
  }
  return out.trim()
}

/**
 * Drop preamble lines when user forbade them.
 * @param {string} text
 */
export function scrubStrictPreamble(text) {
  let t = String(text || '').trim()
  t = t.replace(
    /^(好的[！!。]?|当然[！!。]?|没问题[！!。]?|以下是[^:\n]*[:：]?\s*|下面是[^:\n]*[:：]?\s*)+/u,
    '',
  )
  t = t.replace(/\n{0,2}###\s*说明[\s\S]*$/m, '')
  t = t.replace(/\n{0,2}\*\*说明[：:][\s\S]*$/m, '')
  return t.trim()
}

/**
 * Keep at most 3 numbered clarify items + assumption block if present.
 * @param {string} text
 */
export function scrubClarifyBudget(text) {
  const t = String(text || '')
  const lines = t.split('\n')
  const out = []
  let q = 0
  let inAssumption = false
  for (const line of lines) {
    if (/假设方案|最小方案|若你暂时|如果你希望立刻|先按这个假设/.test(line))
      inAssumption = true
    const isQ = /^\s*(?:\d+[\.\、\)]|[-*]\s+\*\*)/.test(line)
    if (isQ && !inAssumption) {
      q += 1
      if (q > 3) continue
    }
    out.push(line)
  }
  let body = out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!assistantHasAssumptionPlan(body)) {
    // Domain-neutral default — do not invent fitness/home assumptions for unrelated asks.
    body = `${body}\n\n**假设方案：** 若你暂时无法补充细节，我先按「最小可执行一步」推进；不对再说我改。`
  }
  return body
}

/**
 * @param {string} userText
 * @param {string} text
 */
export function finalizeGuardedReply(userText, text) {
  let out = text
  let violations = detectReplyGuardViolations(userText, out)
  if (violations.some((v) => v.kind === 'no-code')) out = scrubNoCodeLeaks(out)
  violations = detectReplyGuardViolations(userText, out)
  if (violations.some((v) => v.kind === 'no-fabricated-metrics')) {
    out = scrubFabricatedMetrics(out)
  }
  violations = detectReplyGuardViolations(userText, out)
  if (violations.some((v) => v.kind === 'anxiety-today-only')) {
    out = scrubLongPlanDump(out)
  }
  violations = detectReplyGuardViolations(userText, out)
  if (violations.some((v) => v.kind === 'strict-format')) {
    out = scrubStrictPreamble(out)
    const maxChars = parseUserMaxChars(userText)
    if (maxChars != null) out = scrubToMaxChars(out, maxChars)
  }
  violations = detectReplyGuardViolations(userText, out)
  if (violations.some((v) => v.kind === 'clarify-budget')) {
    out = scrubClarifyBudget(out)
  }
  if (userForbidsCode(userText) && assistantLeakedCode(out))
    out = scrubNoCodeLeaks(out)
  return out
}
