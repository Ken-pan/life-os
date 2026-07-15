/**
 * 云端扫描拉取的**纯**辅助(无 supabase 依赖,node 单测直接跑):
 * 结果文案与「已处理」标记 —— 设置页与 /plan 新扫描横幅共用。
 */

/** 最近处理过(拉取/忽略)的扫描 —— 新扫描横幅据此判断「有没有新货」 */
export const SEEN_SCAN_KEY = 'homeos_seen_scan_v1'

/** 最近**应用过**的优化副本(id@updatedAt)。设过之后 = 订阅:
 * 云端副本再更新,打开页面自动跟进(强制推送语义),不再逐次点确认。 */
export const APPLIED_COPY_KEY = 'homeos_applied_copy_v1'

/**
 * 「已处理」标记值:id + 更新时间。同一份副本在云端被原地更新
 * (比如服务端补墙后 bump updated_at)也要重新提示。
 * @param {{ id: string, updated_at?: number }} scan
 */
export function scanSeenValue(scan) {
  return `${scan.id}@${scan.updated_at ?? ''}`
}

/**
 * 「摆家具」拉取结果 → 人话(设置页与 /plan 新扫描横幅共用一份文案)。
 * @param {{ report: any, replaced?: any[], identity?: any, photos?: { failed: number } }} res
 * @returns {{ main: string, warns: string[] }}
 */
export function describeFurniturePull(res) {
  const { report, replaced = [], identity = null, photos = null } = res
  const reg = report?.registration
  const parts = [`摆了 ${report?.mapped ?? 0} 件`]
  if (reg?.status === 'ok') {
    parts.push(`墙体配准 ✓(残差中位 ${reg.medianCm}cm)`)
    if (report.refined) parts.push(`${report.refined} 件按实测墙距微调`)
  } else if (reg) {
    parts.push('配准未过门,按分区粗对齐')
  }
  if (report?.anchored) parts.push(`${report.anchored} 件按实测墙距锚定`)
  if (identity && (identity.unchanged || identity.moved.length)) {
    const idParts = [`${identity.unchanged} 件原位`]
    if (identity.moved.length) {
      idParts.push(
        `${identity.moved.length} 件挪过(${identity.moved.map((m) => `${m.label} ${m.movedFt}ft`).join('、')})`,
      )
    }
    parts.push(idParts.join('、'))
  }
  if (identity?.removed?.length) parts.push(`${identity.removed.length} 件上次有这次没扫到`)
  if (replaced.length) parts.push(`顶掉 ${replaced.length} 件手录的`)
  if (report?.skipped) parts.push(`跳过 ${report.skipped} 件`)

  const warns = []
  if (photos?.failed) warns.push(`${photos.failed} 张照片下载失败,对应机位保留为空视角`)
  if (report?.conflicts?.length) {
    warns.push(`${report.conflicts.length} 件墙距与扫描不一致(可能被挪过),未自动吸附`)
  }
  return { main: parts.join(' · '), warns }
}

/** @typedef {import('./spatial/types.js').SpatialProject} SpatialProject */

