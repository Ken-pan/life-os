/**
 * 硬安全规则(规范 §5, 评审 §3)。纯函数,无 IO。
 *
 * 诚实边界:当前数据模型**没有**插座位置、通风口、设备型号散热参数、材料可燃性,
 * 所以电源线长/散热距离/可燃物这些规则**算不出真值** —— 与其编,不如只做数据够得着的、
 * 把够不着的显式标 `dataLimited`(规范 §9.2:不确定就标记,不臆造)。
 *
 * 现在能可靠算两条:
 * - **热敏物近热源**:envSensitive 含 'heat' 的物品,存在离灶台/烤箱/微波炉/烘干机
 *   近的储物区 → 警告(别把巧克力/药/耗材囤在灶台上方)。
 * - **高柜防倾**:高而未贴墙的开放层架/衣柜 = 倾倒风险(§3.5 重心/防倾)。
 *
 * i18n:只吐 reasonCode/severity;dataLimited 列出没数据没查的规则,交 UI 说明。
 */

import { PX_PER_FT } from './dimensions.js'
import { canonicalPlacementKind, placementSpec } from './placements.js'

/** @typedef {import('./types.js').SpatialProject} SpatialProject */

/** 产热/产蒸汽的源(规范 §5.2–5.3)。 */
const HEAT_KINDS = new Set(['stove', 'range', 'oven', 'range_hood', 'microwave', 'dryer'])
/** 高而窄、倒了会砸人的开放/立式家具。 */
const TALL_TIP_KINDS = new Set(['wire_rack', 'equipment_rack', 'bookshelf', 'shelf', 'cube_shelf', 'wardrobe'])
/** 热源邻近阈值(英尺)。 */
const HEAT_PROXIMITY_FT = 3
/** 高于此高度(英寸)且未贴墙即计倾倒风险。 */
const TALL_IN = 48

const centerOf = (o) => {
  const b = o.bounds ?? o
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}
const distFt = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / PX_PER_FT

/** 家具/设施的高度(英寸):实测优先,退规格 tall。 */
function heightInOf(pl) {
  const measured = pl?.attrs?.heightIn
  if (Number.isFinite(measured)) return measured
  const spec = placementSpec(pl?.kind ?? '')
  return spec?.tall ?? 0
}

/**
 * 全屋硬安全评估。
 * @param {SpatialProject} project
 * @returns {{ hazards: Array<{ kind: string, subjectId: string, subjectLabel: string, reasonCode: string, severity: 'high'|'medium', params: object }>, dataLimited: string[] }}
 */
export function analyzeSafety(project) {
  const placements = (project?.placements ?? []).filter((p) => !p.attrs?.staged)
  const fixtures = project?.fixtures ?? []
  const hazards = []

  // —— 热源位置(placements + fixtures)——
  const heatSources = [
    ...placements.filter((p) => HEAT_KINDS.has(canonicalPlacementKind(p.kind ?? ''))),
    ...fixtures.filter((f) => f.bounds && HEAT_KINDS.has(canonicalPlacementKind(f.kind ?? ''))),
  ].map((s) => ({ label: s.label, c: centerOf(s) }))

  // 规则 1:热敏物近热源
  if (heatSources.length) {
    for (const zone of project?.storageZones ?? []) {
      const zc = zone.bounds ? centerOf(zone) : zone.marker
      if (!zc) continue
      const near = heatSources.find((h) => distFt(zc, h.c) <= HEAT_PROXIMITY_FT)
      if (!near) continue
      for (const item of zone.items ?? []) {
        if (!(item.envSensitive ?? []).includes('heat')) continue
        hazards.push({
          kind: 'heat-sensitive-near-heat',
          subjectId: item.id,
          subjectLabel: item.name,
          reasonCode: 'SAFETY_HEAT_SENSITIVE_NEAR_HEAT',
          severity: 'medium',
          params: { zoneCode: zone.code, heatLabel: near.label },
        })
      }
    }
  }

  // 规则 2:高柜防倾 —— 高且未贴墙(无 wallAnchor)
  for (const pl of placements) {
    if (!TALL_TIP_KINDS.has(canonicalPlacementKind(pl.kind ?? ''))) continue
    if (heightInOf(pl) < TALL_IN) continue
    if (pl.wallAnchor?.x || pl.wallAnchor?.y) continue // 已贴墙
    hazards.push({
      kind: 'tip-risk',
      subjectId: pl.id,
      subjectLabel: pl.label,
      reasonCode: 'SAFETY_TALL_UNANCHORED_TIP_RISK',
      severity: 'high',
      params: { heightIn: Math.round(heightInOf(pl)) },
    })
  }

  hazards.sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1))

  // 诚实地列出「没数据、没查」的规则,别让沉默冒充「安全」(规范 §9.2)。
  const dataLimited = [
    'SAFETY_POWER_CORD_ROUTING', // 缺插座位置/线长
    'SAFETY_HEAT_DISSIPATION_CLEARANCE', // 缺设备型号散热参数
    'SAFETY_VENT_BLOCKED', // 缺通风口位置
    'SAFETY_LOAD_BEARING', // 缺家具承重/物品重量
  ]

  return { hazards, dataLimited }
}
