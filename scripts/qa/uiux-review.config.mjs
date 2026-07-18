/**
 * UI/UX 审核截图 — 每个 app 的核心页面清单（PLAT.UIUX 统一走查）。
 *
 * 单一职责：声明「一个版本做完后要审核哪几屏」。端口 / waitSelector / workspace
 * 从既有 PWA 注册表（scripts/pwa/apps.config.mjs → appRegistry）派生，避免重复维护；
 * 品牌名与主色从 site meta / wordmark accent 派生，用于合成图的标题条。
 *
 * 消费者：scripts/qa/uiux-review.mjs（抓图 + 合成单张 PNG）。
 */
import { PWA_APPS } from '../pwa/apps.config.mjs'
import {
  LIFE_OS_SITE_META,
  LIFE_OS_APP_WORDMARK_ACCENT,
} from '../../packages/theme/src/generated/appRegistry.js'

/**
 * @typedef {object} CorePage
 * @property {string} path 路由（相对 app 根）
 * @property {string} title 合成图上的中文标题
 * @property {string} [waitSelector] 额外等待的选择器（默认用 app 的 waitSelector）
 * @property {number} [settle] 额外静置毫秒（动画 / 异步渲染）
 * @property {Array<Record<string, any>>} [prep] 截图前的交互序列（展示同一页面的不同功能态）。
 *   步骤：{click:sel} | {select:[sel,val]} | {fill:[sel,val]} | {press:key} | {wait:ms} | {waitFor:sel}
 * @property {boolean} [desktopOnly] 仅桌面截（依赖桌面专属控件的功能态；移动端跳过避免重复格）
 */

/**
 * @typedef {object} UiuxAppReview
 * @property {string} id
 * @property {string} name 品牌名（标题条）
 * @property {string} description app 一句话描述
 * @property {string} workspace npm workspace（起 preview）
 * @property {number} port preview 端口
 * @property {string} waitSelector 默认首屏就绪选择器
 * @property {string} scrollSelector 主滚动区选择器（逗号分隔，量内容高度用）
 * @property {{ light: string, dark: string }} accent 主色
 * @property {'light' | 'dark' | 'auto'} defaultTheme
 * @property {CorePage[]} pages 6~8 个核心页面
 * @property {'localStorage' | 'demo' | 'indexeddb'} [seedKind] 预置数据方式（见 uiux-review.mjs seeders）
 * @property {boolean} [authGate] 首屏可能是登录页
 */

/** 从既有注册表补齐运行时字段。 @param {string} id @param {Omit<UiuxAppReview,'name'|'description'|'workspace'|'port'|'waitSelector'|'scrollSelector'|'accent'|'defaultTheme'>} entry */
function hydrate(id, entry) {
  const pwa = PWA_APPS[id]
  const meta = LIFE_OS_SITE_META[id]
  if (!pwa) throw new Error(`uiux-review: 未知 app（PWA 注册表缺失）: ${id}`)
  return {
    ...entry,
    id,
    name: meta?.name ?? pwa.name,
    // app 一句话描述（供画廊/manifest/llms.txt，帮 AI 选合适的 app）
    description: meta?.description?.zh ?? '',
    workspace: pwa.workspace,
    port: pwa.port,
    waitSelector: pwa.waitSelector,
    // 主滚动区选择器（派生自 shellType）——用于测「真实内容高度」裁掉尾部空白，排除全高侧栏。
    scrollSelector: pwa.scrollSelector,
    accent: LIFE_OS_APP_WORDMARK_ACCENT[id] ?? {
      light: '#3d9ed6',
      dark: '#5cb8ea',
    },
    defaultTheme: meta?.defaultTheme ?? 'auto',
  }
}

// 选页原则：挑差异大、能展示特色功能的核心页面；不放 /settings 这类通用页。
// 各 app 在 localhost 空库时自动灌 demo 数据（见各 app 的 demoMode），故截图直接有内容。
/** @type {Record<string, UiuxAppReview>} */
export const UIUX_REVIEW_APPS = {
  planner: hydrate('planner', {
    pages: [
      { path: '/', title: '今日' },
      { path: '/calendar', title: '日历' },
      { path: '/upcoming', title: '接下来' },
      { path: '/projects', title: '项目' },
      { path: '/insights', title: '洞察' },
      { path: '/completed', title: '已完成' },
      { path: '/triage', title: '整理收集箱' },
    ],
  }),
  finance: hydrate('finance', {
    seedKind: 'demo',
    pages: [
      { path: '/home/today', title: '概览' },
      { path: '/accounts', title: '账户' },
      { path: '/stocks', title: '持仓' },
      { path: '/forecast/scenarios', title: '预测' },
      { path: '/history/insights', title: '流水洞察' },
      { path: '/review/queue', title: '审查队列' },
      { path: '/decision/log', title: '决策日志' },
    ],
  }),
  fitness: hydrate('fitness', {
    pages: [
      { path: '/', title: '今日训练' },
      { path: '/program', title: '训练计划' },
      { path: '/day/chest', title: '训练日详情' },
      { path: '/day/chest/focus', title: '专注计时', settle: 700 },
      { path: '/discover/stats', title: '统计分析' },
      { path: '/discover/records', title: '训练记录' },
      { path: '/library', title: '动作库' },
    ],
  }),
  music: hydrate('music', {
    // 浏览/搜索是高频多功能页：展示不同 scope 与「有结果」的搜索态。
    pages: [
      { path: '/', title: '首页' },
      { path: '/library', title: '资料库' },
      { path: '/browse', title: '浏览 · 专辑' },
      { path: '/browse', title: '浏览 · 艺术家', prep: [{ click: '.browse-scopes button:has-text("艺术家")' }] },
      { path: '/search', title: '搜索', settle: 500 },
      { path: '/playlists', title: '歌单' },
      { path: '/liked', title: '喜欢' },
    ],
  }),
  home: hydrate('home', {
    // 平面图/储物各有两种功能态（浏览 vs 编辑、空间 vs 清单）。
    pages: [
      { path: '/plan', title: '平面图 · 浏览', settle: 700 },
      { path: '/plan', title: '平面图 · 编辑', settle: 700, desktopOnly: true, prep: [{ click: '[aria-label="浏览或编辑"] button:has-text("编辑")', settle: 600 }] },
      { path: '/storage', title: '储物 · 空间' },
      { path: '/storage', title: '储物 · 清单', desktopOnly: true, prep: [{ click: '[aria-label="空间或清单视图"] button:has-text("清单")' }] },
      { path: '/tidy', title: '整理建议' },
      { path: '/tidy/go', title: '整理执行' },
    ],
  }),
  knowledge: hydrate('knowledge', {
    // 笔记库是高频高复杂页：展示打开不同类型笔记（方法论/技术块编辑/项目文档）。
    pages: [
      { path: '/', title: '收集箱' },
      { path: '/library?note=k-demo-1', title: '笔记 · 方法论（双链+反链）', settle: 500 },
      { path: '/library?note=k-demo-27', title: '笔记 · 技术（代码/列表块）', settle: 500 },
      { path: '/library?note=k-demo-11', title: '笔记 · 项目文档', settle: 500 },
      { path: '/overview', title: '仪表盘' },
      { path: '/projects', title: '项目看板' },
      { path: '/timeline', title: '时间线' },
    ],
  }),
  health: hydrate('health', {
    // ?demo=1 强制演示：本机 Focus 代理常驻在线，默认会用真实数据（无 Apple Watch → 指标空），
    // 走查需要强制 demo 覆盖真实代理，展示完整状态/趋势。
    pages: [
      { path: '/?demo=1', title: '此刻状态', settle: 700 },
      { path: '/focus?demo=1', title: '专注防沉迷', settle: 700 },
      { path: '/trends?demo=1', title: '健康趋势', settle: 700 },
    ],
  }),
  aios: hydrate('aios', {
    // 对话是高频高复杂页：同一页展示不同能力（代码/检索/生图/产物预览/数据/翻译）。
    // ?chat=<id> 选具体 demo 会话（仅 demo 生效，见 aios demoMode/chat）。
    pages: [
      { path: '/', title: '对话 · 代码调试', settle: 500 },
      { path: '/?chat=demo-chat-runes', title: '对话 · 联网检索+思考', settle: 500 },
      { path: '/?chat=demo-chat-image', title: '对话 · 图片生成', settle: 500 },
      { path: '/?chat=demo-chat-clock', title: '对话 · HTML 产物预览', settle: 600, prep: [{ click: 'button.md-preview', settle: 700 }] },
      { path: '/?chat=demo-chat-sales', title: '对话 · 数据分析', settle: 500 },
      { path: '/?chat=demo-chat-translate', title: '对话 · 中英翻译', settle: 500 },
      { path: '/history', title: '历史会话' },
    ],
  }),
}

/** 默认走查集合（生产 app 优先，可用 --app 覆盖）。 */
export const UIUX_REVIEW_DEFAULT_IDS = ['planner', 'finance', 'fitness', 'music']

/** @param {string} id */
export function getReviewApp(id) {
  const app = UIUX_REVIEW_APPS[id]
  if (!app) {
    throw new Error(
      `uiux-review: 未登记的 app "${id}"。可选: ${Object.keys(UIUX_REVIEW_APPS).join(', ')}`,
    )
  }
  return app
}
