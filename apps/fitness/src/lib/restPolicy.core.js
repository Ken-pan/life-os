/**
 * 组间休息秒数策略（纯函数，可单测）。
 * drop / superset 组间几乎不休，封顶 15s。
 *
 * @param {{ rest?: number, scheme?: string } | null | undefined} ex
 * @returns {number}
 */
export function effectiveRestSeconds(ex) {
  const base = Math.max(0, Math.round(Number(ex?.rest) || 0))
  if (!base) return 0
  const scheme = ex?.scheme || 'straight'
  if (scheme === 'drop' || scheme === 'superset') return Math.min(base, 15)
  return base
}

/**
 * Focus 是否处于可交互的组间休息（未完成、未展示 done）。
 * @param {{ visible?: boolean, inline?: boolean, mode?: string, status?: string, showDone?: boolean, paused?: boolean }} t
 */
export function isActiveRest(t) {
  return Boolean(
    t?.visible &&
    t?.inline &&
    t?.mode === 'rest' &&
    t?.status !== 'complete' &&
    !t?.showDone,
  )
}
