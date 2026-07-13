/**
 * 用户画像与种子记忆(来源:Obsidian vault 的 USER.md / MEMORY.md 等资料)。
 *
 * 两层记忆分工(参考 ChatGPT memory / MemGPT core memory 的业界实践):
 * - 画像 = 核心记忆:少量最稳定的身份/偏好事实,每轮常驻注入 system prompt,
 *   零检索开销、不会漏召回;在设置页可编辑,存 settings.userProfile。
 * - 种子记忆 = 情景记忆:更细粒度的项目/经历事实,进 memory store 按语义
 *   相关度召回,只在相关时占用上下文,保持小模型的 prompt 精简。
 * 两层内容不重复:画像放"他是谁",种子放"他做过什么"。
 */

export const PROFILE_SCHEMA_VERSION = 2

const LEGACY_TEMPORARY_PROFILE_LINES = [
  '近期重心:冲刺个人作品集 portfolio2026(SvelteKit),准备"作品集马拉松"。',
]

export const DEFAULT_USER_PROFILE = `姓名:Ken Pan(潘俊丞),称呼 Ken,网名树冲;他/him。
职业:Sr. Product Designer @ Ingram Micro(西雅图),"设计+代码"全栈设计师,专注 B2B 电商与信息密集型系统(搜索、对比、导航等决策流)。
教育:清华大学 → IIT Institute of Design(The New Bauhaus)。
生活:住西雅图(America/Los_Angeles);伴侣 Kevin Chen;养两只豆柴犬 Onyx 和 Sard。
兴趣:摄影(Sony A7CR)、健身、烹饪、旅行。
设备:M5 Max MacBook Pro;AIOS 与本地模型都跑在这台机器上。
沟通偏好:默认简体中文;先给结论再展开,直接具体,不要空洞客套。`

/**
 * 画像只保存长期稳定事实。v1 曾把 2026-03 的“近期重心”放进每轮常驻画像，
 * 导致数月后仍拿旧项目主动寒暄。迁移只删除已知的旧默认行，用户自行编辑的
 * 其他内容原样保留。
 */
export function migrateUserProfile(profile, fromVersion = 1) {
  if (typeof profile !== 'string') return DEFAULT_USER_PROFILE
  if (fromVersion >= PROFILE_SCHEMA_VERSION) return profile

  const stale = new Set(LEGACY_TEMPORARY_PROFILE_LINES)
  return profile
    .split('\n')
    .filter((line) => !stale.has(line.trim()))
    .join('\n')
    .trim()
}

export const SEED_MEMORIES = [
  'Ken 曾联合创办 Broadser(Superus),0→1 做到 3 万用户、1500 付费用户,Product Hunt 当日第一(2022-2023)',
  'Ken 的 side project AI Design Commons(aidesigncommons.com)收录 36+ 个 AI 设计工作流,用 React + TypeScript + Supabase 构建',
  'Ken 在 Ingram Micro 主导过搜索体验优化(发现效率 +30%)、商品对比优化、Merchandising Data、Xvantage 导航等 B2B 电商设计项目',
  'Ken 2021 年在商汤科技(SenseTime)做设计运营平台 SenseTime Hub,用户增长 128%',
  'Ken 做过 civic tech 项目 Landfiner(chicagolandaccesspathways.com),为 Chicago Food Policy Action Council 开发',
  'Ken 运营过 CIWEI Job Board(ciwei.group),500+ 月活,用 Puppeteer + GitHub Actions 自动抓取职位',
  'Ken 开发过 Now Lyrics:macOS SwiftUI 应用 + Chrome 扩展,为 YouTube Music、Apple Music、Spotify 实时显示歌词',
  'Ken 写过多个 Figma 插件:StyleInsight、StyleSync、Zenith Table Management、JD-Analytics 等',
  'Ken 的常用技术栈:React/Next.js、Vue/Nuxt、SvelteKit、TypeScript、Express/Node、Supabase/PostgreSQL、Swift/SwiftUI、Puppeteer、Playwright',
  'Ken 的本地 AI 环境:LocalAI 网关 + llama-swap 按需加载模型;AIOS 是他自己开发的本地 AI 对话 app',
  'Ken 的 Telegram 是 @ken_pan,他的另一个本地 AI 助手代号 Korben(Telegram 桥 + OpenClaw)',
]
