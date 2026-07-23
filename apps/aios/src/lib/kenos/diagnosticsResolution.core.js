/**
 * 诊断处置写规划(纯函数)。把 UI 意图 → 可 upsert 的行 / bug 状态更新,
 * 校验集中在此,host 只负责发请求(见 diagnosticsStore.svelte.js)。
 */

import { DIAGNOSTICS_STATUS } from './diagnosticsModel.core.js'

const VALID = new Set(Object.values(DIAGNOSTICS_STATUS))

/** bug_logs 的合法 status 与统一状态互映(bug 用自身列,不进 resolutions 表)。 */
export function unifiedStatusToBug(status) {
  if (status === DIAGNOSTICS_STATUS.resolved) return 'fixed'
  if (status === DIAGNOSTICS_STATUS.ignored) return 'ignored'
  return 'open'
}

/**
 * 规划一次崩溃/日志处置 → kenos_issue_resolutions upsert 行。
 * @param {{ issueType?: string, issueKey?: string, status?: string, userId?: string, note?: string, sample?: object, now?: number }} input
 * @returns {{ ok: true, row: object } | { ok: false, error: string }}
 */
export function planIssueResolution({
  issueType,
  issueKey,
  status,
  userId,
  note = '',
  sample = {},
  now = Date.now(),
} = {}) {
  if (issueType !== 'crash' && issueType !== 'log')
    return { ok: false, error: 'issueType 必须是 crash 或 log' }
  if (!issueKey) return { ok: false, error: 'issueKey 不能为空' }
  if (!userId) return { ok: false, error: '需要登录用户' }
  if (!VALID.has(status)) return { ok: false, error: `非法状态:${status}` }
  const iso = new Date(now).toISOString()
  return {
    ok: true,
    row: {
      user_id: userId,
      issue_type: issueType,
      issue_key: String(issueKey).slice(0, 400),
      status,
      note: note ? String(note).slice(0, 2000) : null,
      sample: sample && typeof sample === 'object' ? sample : {},
      updated_at: iso,
    },
  }
}

/**
 * 规划一次 bug 处置 → bug_logs 行更新。
 * @param {{ id?: string, status?: string }} input
 */
export function planBugResolution({ id, status } = {}) {
  if (!id) return { ok: false, error: 'bug id 不能为空' }
  if (!VALID.has(status)) return { ok: false, error: `非法状态:${status}` }
  return {
    ok: true,
    id: String(id),
    patch: { status: unifiedStatusToBug(status) },
  }
}
