/**
 * 用途/来源 key → 人话。**展示层 i18n**:领域层 spatial/function-truth.js 只吐 key,
 * 中文/英文/无障碍文案集中在这里(评审 §4)。/plan 属性条与 /tidy 功能确认共用一份。
 */

/** @type {Record<string, string>} */
export const FUNCTION_LABELS_ZH = {
  'diet-equipment-station': '饮食设备站',
  photography: '摄影器材',
  'tools-cables-power': '工具/线材/电源',
  'pet-supplies': '宠物用品',
  'long-term-stock': '长期库存',
  'sleep-only': '睡眠(不储物)',
  'work-surface': '办公台面',
  dining: '餐饮',
  cooking: '烹饪(禁储物)',
  'general-storage': '通用储物',
}

/** @type {Record<string, string>} */
export const FUNCTION_SOURCE_LABELS_ZH = {
  user: '已确认',
  'user-session-import': '待确认(种子)',
  document: '按旧规划',
  scan: '按扫描',
  guess: '按类型猜',
}

/** @param {string} key */
export const functionLabelZh = (key) => FUNCTION_LABELS_ZH[key] ?? key
