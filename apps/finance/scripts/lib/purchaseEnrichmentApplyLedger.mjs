/**
 * Apply run ledger for link-purchase-orders.mjs (Management API writes).
 * Gracefully no-ops when migration not yet applied.
 */

export async function startApplyRun(runSql, escSql, opts) {
  const {
    userId,
    mode,
    scope,
    operator = process.env.USER || 'cli',
    gitHead = process.env.GIT_HEAD || '',
    approvedBy = null,
  } = opts

  try {
    const rows = await runSql(`
      insert into finance_purchase_enrichment_apply_runs
        (user_id, mode, scope, operator, git_head, approved_by)
      values (
        ${userId ? `'${escSql(userId)}'` : 'null'},
        '${escSql(mode)}',
        '${escSql(JSON.stringify(scope))}'::jsonb,
        '${escSql(operator)}',
        '${escSql(gitHead)}',
        ${approvedBy ? `'${escSql(approvedBy)}'` : 'null'}
      )
      returning id;
    `)
    return rows?.[0]?.id ?? null
  } catch (e) {
    console.warn('[apply-ledger] start skipped (tables missing?):', e.message)
    return null
  }
}

export async function logApplyRunItem(runSql, escSql, runId, item) {
  if (!runId) return
  const { transactionId, action, before, after, reason } = item
  try {
    await runSql(`
      insert into finance_purchase_enrichment_apply_run_items
        (run_id, transaction_id, action, before, after, reason)
      values (
        '${escSql(runId)}',
        '${escSql(transactionId)}',
        '${escSql(action)}',
        ${before ? `'${escSql(JSON.stringify(before))}'::jsonb` : 'null'},
        ${after ? `'${escSql(JSON.stringify(after))}'::jsonb` : 'null'},
        ${reason ? `'${escSql(reason)}'` : 'null'}
      );
    `)
  } catch (e) {
    console.warn('[apply-ledger] item log failed:', e.message)
  }
}

export async function finishApplyRun(runSql, escSql, runId, stats) {
  if (!runId) return
  try {
    await runSql(`
      update finance_purchase_enrichment_apply_runs
      set finished_at = now(),
          stats = '${escSql(JSON.stringify(stats))}'::jsonb
      where id = '${escSql(runId)}';
    `)
  } catch (e) {
    console.warn('[apply-ledger] finish failed:', e.message)
  }
}
