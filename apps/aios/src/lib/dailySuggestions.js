import { browser } from '$app/environment'
import { GATEWAY, pingGateway, tinyComplete } from '$lib/localai.js'
import { S } from '$lib/state.svelte.js'
import { isCloudAuthorized } from '$lib/cloud.svelte.js'
import { lifeOsToday } from '$lib/lifeos.js'

/**
 * 首页动态建议:基于「今日感知」素材(今天的 Obsidian 日报 + 近期项目动态 +
 * 所在地)让常驻小模型想 4 个用户此刻可能想问的,替代写死的静态建议。
 * 按 日期+所在地 每天缓存一次;网关不可达或素材不足时返回 null,页面退回静态。
 *
 * 重要:走 llm-tiny,绝不抢手机 Ask 的 llm-fast / 35B 槽位。
 */

const CACHE_KEY = 'aios_daily_suggestions_v1'

/** 经网关 vault upstream 读一篇笔记正文(短超时,失败返回空串) */
async function readNote(vault, path) {
  try {
    const params = new URLSearchParams({ vault, path })
    const res = await fetch(`${GATEWAY}/upstream/vault/note?${params}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ''
    const note = await res.json()
    return typeof note?.content === 'string' ? note.content : ''
  } catch {
    return ''
  }
}

/** @returns {Promise<string[] | null>} 4 条建议,或 null(退回静态) */
export async function generateDailySuggestions() {
  if (!browser) return null
  const today = new Date().toLocaleDateString('sv-SE')
  const loc = S.settings.location?.trim() || ''
  const cacheId = `${today}|${loc}`
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    if (c?.id === cacheId && Array.isArray(c.items) && c.items.length >= 3)
      return c.items
  } catch {
    /* 缓存损坏则重算 */
  }
  // 网关不可达(云端只读版/网关没开)直接退回静态,不空等
  if (!(await pingGateway())) return null

  // Life OS 今日快照(待办/财务/健身…)—— 登录后才有,失败或未登录静默跳过
  const lifeOs = isCloudAuthorized()
    ? await lifeOsToday().catch(() => '')
    : ''
  const hasLifeOs =
    lifeOs && !lifeOs.startsWith('需要') && !lifeOs.startsWith('暂无')

  const [brief, pulse] = await Promise.all([
    readNote('memory', `${today}.md`),
    readNote('memory', 'project-git-pulse.md'),
  ])
  if (!brief && !pulse && !loc && !hasLifeOs) return null // 没个性化素材

  const ctx = [
    loc ? `所在地:${loc}` : '',
    hasLifeOs ? lifeOs : '',
    brief ? `今日日报(会议/邮件/进展):\n${brief.slice(0, 1400)}` : '',
    pulse ? `近期项目动态:\n${pulse.slice(0, 1000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await tinyComplete(
    `今天是 ${today}。下面是用户的近况。据此想 4 个「用户此刻可能想让 AI 帮忙的事」,` +
      '做成首页可点击的建议:每个不超过 14 字、口语化、点了能直接发送,尽量具体到' +
      '用户的会议/项目/所在地/待办/花销(不要泛泛的"帮我头脑风暴";有逾期待办或' +
      '异常花销时可以直接点出来)。只输出 4 行,每行一个,' +
      `不要编号或解释。\n\n${ctx}`,
    {
      maxTokens: 220,
      temperature: 0.85,
      timeoutMs: 25000,
      // Never steal the phone Ask 35B lane for homepage chips.
      allowFastFallback: false,
    },
  )
  if (!raw) return null
  const items = raw
    .split('\n')
    .map((l) =>
      l
        .replace(/^\s*(?:[-*•]|\d+[.、)])\s*/, '')
        .replace(/^["「']|["」']$/g, '')
        .trim(),
    )
    .filter((l) => l.length >= 3 && l.length <= 24)
    .slice(0, 4)
  if (items.length < 3) return null
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ id: cacheId, items }))
  } catch {
    /* 存不下不影响本次使用 */
  }
  return items
}
