// 项目分类 —— 鸟瞰图分组、详情页归类、列表分组三处共用的单一真源。
//
// 分类存在 project.areaId(用户手选,跟随云同步、永久准确);
// 没手选时按项目名/备注启发式派生(零维护,新项目也能自动落位)。
// 用户在详情页/新建表单选了分类 → 写 areaId → 从此以手选为准。

/** 分类定义(label 走 i18n key,双语)。顺序即鸟瞰图/列表的展示顺序。 */
export const PROJECT_CATEGORIES = [
  { id: 'lifeos', labelKey: 'projects.cat_lifeos' },
  { id: 'portfolio', labelKey: 'projects.cat_portfolio' },
  { id: 'work', labelKey: 'projects.cat_work' },
  { id: 'tools', labelKey: 'projects.cat_tools' },
]

/** @type {Set<string>} 合法分类 id */
export const CATEGORY_IDS = new Set(PROJECT_CATEGORIES.map((c) => c.id))

// 明确归"作品集/产品"的(对外发布过、或作品集展示用的 side project)
const PORTFOLIO_NAMES = new Set([
  'Broadser', 'AI Design Commons', 'SenseTime Hub', 'Landfiner',
  'CIWEI Job Board', 'Conference Visual', 'Animal Emoji',
  'NowLyrics', 'Ciwei-Group', 'portfolio2026', 'Context Helper', 'kens-toolbox',
])

/**
 * 项目所属分类 id。手选 areaId 优先,否则按名/备注启发式。
 * @param {{ title?: string, summary?: string, areaId?: string|null }} p
 * @returns {string}
 */
export function categoryOf(p) {
  if (p.areaId && CATEGORY_IDS.has(p.areaId)) return p.areaId
  const title = p.title || ''
  // 展示名已改叫 Korben,但存量项目标题仍写 "Life OS ..." —— 新旧前缀一起认,别让老项目掉出分类。
  if (/^Korben|^Life OS|^PaperOS/.test(title)) return 'lifeos'
  if (/^Ingram/.test(title)) return 'work'
  if (PORTFOLIO_NAMES.has(title)) return 'portfolio'
  if (/作品集|已发布|上架|Product Hunt|users|求职|平台|社区|视觉|动画/.test(p.summary || '')) {
    return 'portfolio'
  }
  return 'tools'
}

/**
 * 分类是否为用户手选(有合法 areaId)。用于详情页 select 的默认值:
 * 手选则回显手选值,否则回显"自动"占位(选了才写 areaId)。
 * @param {{ areaId?: string|null }} p
 */
export function isManualCategory(p) {
  return Boolean(p.areaId && CATEGORY_IDS.has(p.areaId))
}
