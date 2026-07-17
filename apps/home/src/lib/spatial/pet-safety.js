/**
 * 宠物安全规则引擎(规范 §4, 评审 B5)。纯函数,无 IO。
 *
 * 三条铁律:
 * - **多风险**:一件东西可同时有毒 + 是药 + 小零件,`derivePetRisks` 返回数组,不是单选。
 * - **看容器**:放 50cm 高但在带门防护柜里 ≠ 放开放篮里。危险判定消费 `zone.zoneAccess`,
 *   不是只看高度。
 * - **能力用户可配**:可触高度/会不会跳台面/会不会开柜,读 `meta.petSafety`,不按品种默认。
 *
 * 与手填的 `relations`(near/far_from)分工:relations 是用户说的家规;这里是**自动
 * 派生**的危险,用户可用 `petRiskOverride` 覆写(explicit-safe / custom)。
 *
 * i18n:只吐 risk 枚举 / reasonCode,不吐中文(评审 §4)。
 */

/** @typedef {import('./types.js').PetRisk} PetRisk */
/** @typedef {import('./types.js').SpatialStorageItem} SpatialStorageItem */
/** @typedef {import('./types.js').SpatialStorageZone} SpatialStorageZone */
/** @typedef {import('./types.js').SpatialProject} SpatialProject */

/** 宠物默认可触高度(cm):小型犬地面至约 90cm(规范 §4.1)。 */
export const DEFAULT_REACH_CM = 90
/** 会跳台面时的可触高度(cm)。 */
const COUNTER_CM = 120

/**
 * 风险词表(中英)。顺序无关 —— 收集**所有**命中,不是先命中先赢。
 * 一件「处方维生素」会同时命中 meds 和 toxic(补剂对狗常有毒),这正是要的多值。
 * @type {Array<{ risk: PetRisk, re: RegExp }>}
 */
const RISK_RULES = [
  { risk: 'meds', re: /药|处方|维生素|补剂|片剂|胶囊|安眠|布洛芬|med(icine|ication)?|pill|supplement|vitamin|prescription|ibuprofen|tylenol/i },
  { risk: 'toxic', re: /消毒|清洁剂|漂白|洗涤剂|洁厕|杀虫|农药|巧克力|木糖醇|酒精|精油|樟脑|驱蚊|bleach|detergent|cleaner|chocolate|xylitol|pesticide|essential\s*oil|alcohol|deet/i },
  { risk: 'cord', re: /电线|数据线|充电线|电源线|适配器|插头|插排|排插|延长线|cord|cable|charger|adapter|power\s*strip|extension/i },
  { risk: 'small-parts', re: /电池|纽扣|磁力|磁铁|乐高|积木|螺丝|小零件|硬币|发夹|battery|button\s*cell|magnet|lego|screw|coin|hairpin/i },
  { risk: 'plastic-bag', re: /塑料袋|保鲜袋|包装袋|封口袋|购物袋|plastic\s*bag|ziplock|zip\s*lock|grocery\s*bag/i },
  { risk: 'food', re: /零食|狗粮|猫粮|宠物粮|坚果|葡萄|葡萄干|口香糖|蛋白粉|treat|kibble|jerky|nut|grape|raisin|gum|protein\s*powder/i },
  { risk: 'chew', re: /橡皮筋|皮筋|袜子|鞋带|海绵|泡沫|耳塞|耳机|鞋|sock|shoelace|sponge|foam|earbud/i },
]

/**
 * 从物品名/商家标题/标签自动派生宠物风险(可多种)。
 * @param {SpatialStorageItem} item
 * @returns {PetRisk[]}
 */
export function derivePetRisks(item) {
  const text = [item?.name ?? '', item?.purchase?.title ?? '', ...(item?.tags ?? [])].join(' ')
  if (!text.trim()) return []
  /** @type {PetRisk[]} */
  const out = []
  for (const { risk, re } of RISK_RULES) {
    if (re.test(text) && !out.includes(risk)) out.push(risk)
  }
  // 药物/补剂对宠物**本就有毒**:含蓄地把 meds 升级为 meds+toxic(规范 §4.2 把
  // 「药物」「人类补剂」都列为不得暴露在宠物可触区)。多值,不覆盖已命中的 toxic。
  if (out.includes('meds') && !out.includes('toxic')) out.push('toxic')
  return out
}

/**
 * 一件物品的**有效**风险:用户覆写优先,否则用已存的 petRisks,否则现场派生。
 * explicit-safe = 用户显式判安全 → 空(但这是用户的责任,不再自动加回)。
 * @param {SpatialStorageItem} item
 * @returns {PetRisk[]}
 */
export function effectivePetRisks(item) {
  const ov = item?.petRiskOverride
  if (ov) {
    if (ov.mode === 'explicit-safe') return []
    if (ov.mode === 'custom') return Array.isArray(ov.risks) ? ov.risks : []
  }
  if (Array.isArray(item?.petRisks)) return item.petRisks
  return derivePetRisks(item)
}

/**
 * 这个区宠物够不够得着(消费 zoneAccess + meta.petSafety)。
 * - 无 zoneAccess 信息 → null(未知,不臆断安全,交调用方标「需确认」)。
 * - petProof → 打不开,安全。
 * - 开放式 → 取物口高度在可触带内即危险。
 * - 能关的门 → 挡得住(除非宠物会开柜)。
 * @param {SpatialStorageZone} zone
 * @param {SpatialProject['meta']['petSafety']} [petSafety]
 * @returns {boolean | null}
 */
export function zoneReachable(zone, petSafety) {
  const a = zone?.zoneAccess
  if (!a) return null
  if (a.petProof) return false
  const base = petSafety?.reachInCm ?? DEFAULT_REACH_CM
  const reach = petSafety?.canJumpToCounter ? Math.max(base, COUNTER_CM) : base
  const withinReach = (a.heightCm ?? 0) <= reach
  if (a.open) return withinReach
  if (a.closable) return petSafety?.opensCabinets ? withinReach : false
  // 非开放又不能关(敞口/矛盾)→ 只按高度
  return withinReach
}

/**
 * 全屋宠物危险:可触(或未知可触)的区里,有自动/覆写判定的危险物。
 * certainty:reachable===true → confirmed;null(无容器信息)→ possible(需确认容器)。
 * @param {SpatialProject} project
 * @returns {Array<{ itemId: string, name: string, zoneCode: string, risks: PetRisk[], certainty: 'confirmed'|'possible', reasonCode: string, params: object }>}
 */
export function petHazards(project) {
  const petSafety = project?.meta?.petSafety
  const out = []
  for (const zone of project?.storageZones ?? []) {
    const reach = zoneReachable(zone, petSafety)
    if (reach === false) continue // 确认安全,跳过
    for (const item of zone.items ?? []) {
      const risks = effectivePetRisks(item)
      if (!risks.length) continue
      const confirmed = reach === true
      out.push({
        itemId: item.id,
        name: item.name,
        zoneCode: zone.code,
        risks,
        certainty: confirmed ? 'confirmed' : 'possible',
        reasonCode: confirmed ? 'PET_HAZARD_REACHABLE' : 'PET_HAZARD_UNKNOWN_ACCESS',
        params: { risks, zoneCode: zone.code },
      })
    }
  }
  // 确认危险排在「需确认」前面
  out.sort((a, b) => (a.certainty === 'confirmed' ? 0 : 1) - (b.certainty === 'confirmed' ? 0 : 1))
  return out
}

/** 一个区是否**宠物安全**(可放危险物):确认够不着或防护。 */
export function isPetSafeZone(zone, petSafety) {
  return zoneReachable(zone, petSafety) === false
}
