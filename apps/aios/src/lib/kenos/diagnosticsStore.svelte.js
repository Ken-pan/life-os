/**
 * /diagnostics 页状态 + 处置动作(乐观更新 → 失败回滚 → 后台重载)。
 */
import { CLOUD } from '$lib/cloud.svelte.js'
import {
  readDiagnostics,
  writeBugResolution,
  writeIssueResolution,
} from './diagnosticsReadSource.js'
import {
  planBugResolution,
  planIssueResolution,
} from './diagnosticsResolution.core.js'

export const DIAG = $state({
  loading: true,
  error: '',
  reason: '',
  partial: false,
  loadedAt: 0,
  /** @type {object|null} */
  model: null,
  /** @type {Set<string>} 正在写的 issue(禁用按钮用) */
  pending: new Set(),
})

export async function loadDiagnostics({ force = false } = {}) {
  if (!force && DIAG.loadedAt && Date.now() - DIAG.loadedAt < 15_000) return
  DIAG.loading = true
  DIAG.error = ''
  DIAG.reason = ''
  try {
    const res = await readDiagnostics({ now: Date.now() })
    if (!res.ok) {
      DIAG.reason = res.reason || ''
      DIAG.error = res.error || ''
      DIAG.model = res.model
    } else {
      DIAG.model = res.model
      DIAG.partial = Boolean(res.partial)
      DIAG.error = res.error || ''
      DIAG.loadedAt = Date.now()
    }
  } catch (e) {
    DIAG.error = e instanceof Error ? e.message : String(e)
  } finally {
    DIAG.loading = false
  }
}

const pk = (issue) => `${issue.issueType}:${issue.issueKey}`

/**
 * 标注一个问题的处置状态(crash/log → resolutions;bug → bug_logs)。
 * 乐观更新本地 model,失败回滚并报错。
 * @param {object} issue diagnosticsModel 里的 issue
 * @param {'open'|'resolved'|'ignored'} status
 * @param {{ note?: string }} [opts]
 */
export async function markIssue(issue, status, { note = '' } = {}) {
  if (!issue || DIAG.pending.has(pk(issue))) return false
  const prevStatus = issue.status
  const prevNote = issue.note
  // 乐观更新
  issue.status = status
  if (note) issue.note = note
  DIAG.pending = new Set(DIAG.pending).add(pk(issue))
  try {
    if (issue.issueType === 'bug') {
      const plan = planBugResolution({ id: issue.issueKey, status })
      if (!plan.ok) throw new Error(plan.error)
      await writeBugResolution(plan.id, plan.patch)
    } else {
      const plan = planIssueResolution({
        issueType: issue.issueType,
        issueKey: issue.issueKey,
        status,
        userId: CLOUD.user?.id,
        note: note || issue.note,
        sample: {
          count: issue.count,
          lastSeen: issue.lastSeen,
          build: issue.build || '',
        },
      })
      if (!plan.ok) throw new Error(plan.error)
      await writeIssueResolution(plan.row)
    }
    return true
  } catch (e) {
    issue.status = prevStatus
    issue.note = prevNote
    DIAG.error = e instanceof Error ? e.message : String(e)
    return false
  } finally {
    const next = new Set(DIAG.pending)
    next.delete(pk(issue))
    DIAG.pending = next
  }
}
