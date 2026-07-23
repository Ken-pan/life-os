/**
 * Kenos 诊断 triage 读模型(纯函数)。
 *
 * 三个来源 → 统一「问题」形状,供 /diagnostics 展示 + 标注:
 *   - 崩溃  kenos_crash_events(已按 fingerprint 携带上下文)→ 按 fingerprint 聚合
 *   - 日志  kenos_app_logs 里 level in (error,fatal) → 无服务端指纹时算稳定分组键
 *   - Bug   bug_logs(自带 status open/fixed/ignored)→ 逐条,不聚合
 *
 * 处置状态:崩溃/日志来自 kenos_issue_resolutions(按 issue_key);bug 用自身 status。
 * 排序:未解决优先 → 按末次出现时间倒序;已解决/忽略折叠在后。
 */

const STATUS_OPEN = 'open'
const STATUS_RESOLVED = 'resolved'
const STATUS_IGNORED = 'ignored'

const clampStr = (v, n) => String(v ?? '').slice(0, n)

/** 简单稳定散列(FNV-1a,32bit hex),给无服务端指纹的日志算分组键。 */
export function stableHash(input) {
  let h = 0x811c9dc5
  const s = String(input ?? '')
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** 把错误信息里的易变部分(数字/uuid/十六进制地址/引号内容)抹平,得到稳定分组键。 */
export function normalizeLogSignature(message, { category = '' } = {}) {
  const base = String(message ?? '')
    .replace(/0x[0-9a-fA-F]+/g, '0x·')
    .replace(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
      '·uuid·',
    )
    .replace(/\b\d[\d.,]*\b/g, '·n·')
    .replace(/["'`][^"'`]{0,80}["'`]/g, '·s·')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  return `${clampStr(category, 40)}::${base || 'unknown'}`
}

/** issue_key:崩溃优先用服务端 fingerprint,否则退化到标准化签名散列。 */
export function crashIssueKey(row) {
  const fp = row?.fingerprint || row?.metadata?.fingerprint
  if (fp) return `fp:${clampStr(fp, 380)}`
  const sig = normalizeLogSignature(row?.message, {
    category: row?.kind || row?.event || 'crash',
  })
  return `sig:${stableHash(sig)}`
}

export function logIssueKey(row) {
  const fp = row?.metadata?.fingerprint
  if (fp) return `fp:${clampStr(fp, 380)}`
  return `sig:${stableHash(normalizeLogSignature(row?.message, { category: row?.category }))}`
}

/**
 * @param {Array<object>} resolutions kenos_issue_resolutions 行
 * @returns {Map<string, {status:string, note:string, updatedAt:string}>} key = `${issue_type}:${issue_key}`
 */
export function indexResolutions(resolutions = []) {
  const map = new Map()
  for (const r of resolutions) {
    if (!r?.issue_type || !r?.issue_key) continue
    map.set(`${r.issue_type}:${r.issue_key}`, {
      status: [STATUS_OPEN, STATUS_RESOLVED, STATUS_IGNORED].includes(r.status)
        ? r.status
        : STATUS_RESOLVED,
      note: r.note || '',
      updatedAt: r.updated_at || '',
    })
  }
  return map
}

/** 聚合崩溃:同 fingerprint 合并,统计次数/首末时间/样本上下文。 */
export function groupCrashes(rows = [], resolutionIndex = new Map()) {
  const byKey = new Map()
  for (const row of rows) {
    const key = crashIssueKey(row)
    const at = row?.logged_at || row?.created_at || ''
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        issueType: 'crash',
        issueKey: key,
        kind: row?.kind || row?.event || 'crash',
        title: clampStr(row?.exception_name || row?.signal_name || row?.message || '崩溃', 160),
        message: clampStr(row?.message, 400),
        count: 1,
        firstSeen: at,
        lastSeen: at,
        build: row?.app_build || row?.build_version || row?.session_build || '',
        device: row?.device_model || '',
        system: row?.system_version || '',
        ctxDomain: row?.ctx_domain || '',
        ctxSpace: row?.ctx_space || '',
        ctxPath: row?.ctx_path || '',
        topFrames: clampStr(row?.top_frames, 600),
      })
    } else {
      existing.count += 1
      if (at && at > existing.lastSeen) existing.lastSeen = at
      if (at && (!existing.firstSeen || at < existing.firstSeen))
        existing.firstSeen = at
    }
  }
  return [...byKey.values()].map((c) =>
    attachResolution(c, resolutionIndex.get(`crash:${c.issueKey}`)),
  )
}

/** 聚合错误日志:同签名合并。 */
export function groupErrorLogs(rows = [], resolutionIndex = new Map()) {
  const byKey = new Map()
  for (const row of rows) {
    const key = logIssueKey(row)
    const at = row?.logged_at || row?.created_at || ''
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        issueType: 'log',
        issueKey: key,
        level: row?.level || 'error',
        category: clampStr(row?.category, 60),
        title: clampStr(row?.message, 160),
        message: clampStr(row?.message, 400),
        count: 1,
        firstSeen: at,
        lastSeen: at,
        ctxDomain: row?.metadata?.ctxDomain || row?.metadata?.domain || '',
        ctxPath: row?.metadata?.ctxPath || row?.metadata?.path || '',
        build: row?.metadata?.ctxBuild || row?.metadata?.buildVersion || '',
      })
    } else {
      existing.count += 1
      if (at && at > existing.lastSeen) existing.lastSeen = at
      if (at && (!existing.firstSeen || at < existing.firstSeen))
        existing.firstSeen = at
    }
  }
  return [...byKey.values()].map((l) =>
    attachResolution(l, resolutionIndex.get(`log:${l.issueKey}`)),
  )
}

/** Bug:逐条,用自身 status 映射到统一 open/resolved/ignored。 */
export function projectBugs(rows = []) {
  return rows.map((b) => {
    const raw = String(b?.status || 'open')
    const status =
      raw === 'fixed'
        ? STATUS_RESOLVED
        : raw === 'ignored'
          ? STATUS_IGNORED
          : STATUS_OPEN
    return {
      issueType: 'bug',
      issueKey: String(b?.id || ''),
      title: clampStr(b?.title || '(无标题)', 160),
      message: clampStr(b?.notes || b?.error_message || '', 400),
      app: b?.app || '',
      route: b?.route || '',
      severity: b?.severity || 'medium',
      count: 1,
      firstSeen: b?.created_at || '',
      lastSeen: b?.updated_at || b?.created_at || '',
      screenshotPath: b?.screenshot_path || '',
      consoleSummary: clampStr(b?.console_summary, 600),
      errorStack: clampStr(b?.error_stack, 800),
      status,
      note: '',
    }
  })
}

function attachResolution(issue, res) {
  return {
    ...issue,
    status: res?.status || STATUS_OPEN,
    note: res?.note || '',
    resolvedAt: res?.updatedAt || '',
  }
}

const isOpen = (i) => i.status === STATUS_OPEN

/** 未解决优先 → 末次出现时间倒序。 */
function sortIssues(a, b) {
  if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1
  return String(b.lastSeen || '').localeCompare(String(a.lastSeen || ''))
}

/**
 * 组装三段式 triage 模型。
 * @param {{ crashes?: object[], logs?: object[], bugs?: object[], resolutions?: object[] }} input
 */
export function buildDiagnosticsModel({
  crashes = [],
  logs = [],
  bugs = [],
  resolutions = [],
} = {}) {
  const idx = indexResolutions(resolutions)
  const section = (items) => {
    const sorted = [...items].sort(sortIssues)
    const open = sorted.filter(isOpen)
    return {
      items: sorted,
      open,
      resolved: sorted.filter((i) => !isOpen(i)),
      openCount: open.length,
      total: sorted.length,
    }
  }
  const crashSection = section(groupCrashes(crashes, idx))
  const logSection = section(groupErrorLogs(logs, idx))
  const bugSection = section(projectBugs(bugs))
  return {
    crashes: crashSection,
    logs: logSection,
    bugs: bugSection,
    openTotal:
      crashSection.openCount + logSection.openCount + bugSection.openCount,
  }
}

export const DIAGNOSTICS_STATUS = Object.freeze({
  open: STATUS_OPEN,
  resolved: STATUS_RESOLVED,
  ignored: STATUS_IGNORED,
})
