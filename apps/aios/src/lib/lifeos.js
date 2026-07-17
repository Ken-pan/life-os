import { createLifeOsSupabaseClient } from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'
import { CLOUD, isCloudAuthorized } from '$lib/cloud.svelte.js'
import {
  expenseAmt,
  formatLifeOsToday,
  buildTaskCapturePayload,
  resolvePeriod as resolvePeriodCore,
  ymd,
} from '$lib/lifeos.core.js'

/**
 * Life OS 跨 app 数据读取。
 * AIOS 与 finance / planner / fitness / music / home 共用同一个 Supabase 项目
 * (按 app 分 schema),且共享同一登录态(@life-os/sync)。这里用对应 schema 的
 * client 直读那些 app 的数据,RLS 按当前用户放行 —— 让 AIOS 真正成为 Life OS 中枢,
 * 能回答"这个月花了多少""今天还有什么待办""这周练了几次"。
 *
 * 全部只读。写操作(加任务等)因有副作用另行开门。
 * 纯格式化 / payload → `lifeos.core.js`（AIOS.STABLE.26）。
 */

/** schema → 单例 client(共享 AIOS 登录 session) */
const clientCache = new Map()
function schemaClient(schema) {
  if (clientCache.has(schema)) return clientCache.get(schema)
  const { supabase } = createLifeOsSupabaseClient(createClient, {
    env: import.meta.env,
    schema,
  })
  clientCache.set(schema, supabase)
  return supabase
}

function todayYmd() {
  return ymd(new Date())
}

function resolvePeriod(args = {}) {
  return resolvePeriodCore(args, todayYmd())
}

const NEED_LOGIN =
  '需要先登录 Life OS 账户才能读取跨 app 数据(设置 → 云同步登录)。'

/* —————————————————————— 今日快照 —————————————————————— */

/** 跨 app「今日」聚合的原始数据(RPC 返回对象),失败/未登录返回 null。 */
export async function lifeOsTodayRaw() {
  if (!isCloudAuthorized()) return null
  try {
    const sb = schemaClient('public')
    const { data, error } = await sb.rpc('portal_today_summary')
    if (error || !data || data.ok === false) return null
    return data
  } catch {
    return null
  }
}

/** 跨 app「今日」聚合:planner + finance + fitness + music + home。走现成 RPC。 */
export async function lifeOsToday() {
  if (!isCloudAuthorized()) return NEED_LOGIN
  const sb = schemaClient('public')
  const { data, error } = await sb.rpc('portal_today_summary')
  if (error) return `读取今日快照失败:${error.message}`
  return formatLifeOsToday(data)
}

/* —————————————————————— 财务汇总 —————————————————————— */

/**
 * 财务收支汇总 + 分类/商家明细。
 * @param {{period?:string, from?:string, to?:string, category?:string, merchant?:string}} args
 */
export async function financeSummary(args = {}) {
  if (!isCloudAuthorized()) return NEED_LOGIN
  const { from, to, label } = resolvePeriod(args)
  const sb = schemaClient('public')
  let q = sb
    .from('finance_transactions')
    .select('txn_date, flow, amount, budget_impact, category, merchant_name')
    .gte('txn_date', from)
    .lte('txn_date', to)
    .order('txn_date', { ascending: false })
    .limit(4000)
  if (args.category) q = q.ilike('category', `%${args.category}%`)
  if (args.merchant) q = q.ilike('merchant_name', `%${args.merchant}%`)

  const { data, error } = await q
  if (error) return `读取财务数据失败:${error.message}`
  const rows = data ?? []
  if (!rows.length) {
    return `${label}没有${args.category ? `「${args.category}」` : ''}${args.merchant ? `「${args.merchant}」` : ''}相关交易记录。`
  }

  let income = 0
  let expense = 0
  const byCategory = new Map()
  const byMerchant = new Map()
  for (const r of rows) {
    if (r.flow === 'income') {
      income += Math.abs(Number(r.amount) || 0)
    } else if (r.flow === 'expense') {
      const a = expenseAmt(r)
      expense += a
      const cat = r.category || '未分类'
      byCategory.set(cat, (byCategory.get(cat) || 0) + a)
      const mer = r.merchant_name || '未知商家'
      byMerchant.set(mer, (byMerchant.get(mer) || 0) + a)
    }
  }

  const r2 = (n) => Math.round(n * 100) / 100
  const scope =
    (args.category ? `分类「${args.category}」` : '') +
    (args.merchant ? `商家「${args.merchant}」` : '')
  const out = [
    `财务汇总(${label}${scope ? ` · ${scope}` : ''}):`,
    `· 支出 ¥${r2(expense)}、收入 ¥${r2(income)}、结余 ¥${r2(income - expense)}`,
    `· 交易 ${rows.length} 笔`,
  ]
  const topCat = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  if (topCat.length > 1 && !args.category) {
    out.push('\n支出分类 TOP:')
    for (const [cat, amt] of topCat) {
      const pct = expense ? Math.round((amt / expense) * 100) : 0
      out.push(`  - ${cat}:¥${r2(amt)}(${pct}%)`)
    }
  }
  const topMer = [...byMerchant.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  if (topMer.length > 1 && (args.category || args.merchant || topCat.length <= 1)) {
    out.push('\n支出商家 TOP:')
    for (const [mer, amt] of topMer) out.push(`  - ${mer}:¥${r2(amt)}`)
  }
  return out.join('\n')
}

/* —————————————————————— 待办任务 —————————————————————— */

/**
 * 列出 Planner 待办。
 * @param {{scope?:'today'|'overdue'|'open'|'completed_today'|'all', area?:string}} args
 */
export async function plannerTasks(args = {}) {
  if (!isCloudAuthorized()) return NEED_LOGIN
  const sb = schemaClient('public')
  const { data, error } = await sb
    .from('planner_tasks')
    .select('data')
    .limit(2000)
  if (error) return `读取待办失败:${error.message}`

  const today = todayYmd()
  const scope = args.scope || 'open'
  const tasks = (data ?? [])
    .map((r) => r.data)
    .filter((t) => t && !t.deletedAt)
    .filter((t) => (args.area ? t.area === args.area : true))
    .filter((t) => {
      switch (scope) {
        case 'today':
          return !t.completed && (t.dueDate === today || t.scheduledDate === today)
        case 'overdue':
          return !t.completed && t.dueDate && t.dueDate < today
        case 'completed_today':
          return t.completed && t.completedAt && ymd(new Date(t.completedAt)) === today
        case 'all':
          return true
        case 'open':
        default:
          return !t.completed
      }
    })

  if (!tasks.length) {
    const zh = {
      today: '今天没有到期的待办。',
      overdue: '没有逾期的待办 👍',
      completed_today: '今天还没有完成的任务。',
      all: '待办库是空的。',
      open: '没有未完成的待办 🎉',
    }
    return zh[scope] || '没有匹配的待办。'
  }

  // 排序:逾期优先 → 有到期日的按日期 → 其余按优先级
  const prioRank = { high: 0, urgent: 0, medium: 1, normal: 1, low: 2 }
  tasks.sort((a, b) => {
    const ad = a.dueDate || '9999'
    const bd = b.dueDate || '9999'
    if (ad !== bd) return ad < bd ? -1 : 1
    return (prioRank[a.priority] ?? 1) - (prioRank[b.priority] ?? 1)
  })

  const shown = tasks.slice(0, 40)
  const scopeLabel = {
    today: '今天',
    overdue: '逾期',
    completed_today: '今天已完成',
    all: '全部',
    open: '未完成',
  }[scope]
  const lines = [`Planner ${scopeLabel}任务(${tasks.length} 项${tasks.length > shown.length ? `,列前 ${shown.length}` : ''}):`]
  for (const t of shown) {
    const bits = []
    if (t.dueDate) {
      const overdue = !t.completed && t.dueDate < today
      bits.push(`到期 ${t.dueDate}${t.dueTime ? ' ' + t.dueTime : ''}${overdue ? ' ⚠逾期' : ''}`)
    } else if (t.scheduledDate) {
      bits.push(`计划 ${t.scheduledDate}${t.scheduledStart ? ' ' + t.scheduledStart : ''}`)
    }
    if (t.area && t.area !== 'planner') bits.push(t.area)
    if (t.priority && t.priority !== 'normal') bits.push(t.priority)
    const meta = bits.length ? `(${bits.join(' · ')})` : ''
    lines.push(`${t.completed ? '☑' : '☐'} ${t.title || '(无标题)'}${meta ? ' ' + meta : ''}`)
  }
  return lines.join('\n')
}

/* —————————————————————— 写:加待办 —————————————————————— */

/**
 * 给 Planner 加一条待办。走 life_events 收件箱(core.task_captured):
 * AIOS 不直写 planner_tasks(会被 Planner 整包同步覆盖),而是投递一条事件,
 * Planner 下次打开/同步时用自己的 createTask 落地并回写整包 —— 架构安全、不丢。
 * @param {{title?:string, notes?:string, dueDate?:string}} args
 */
export async function plannerAddTask(args = {}) {
  if (!isCloudAuthorized()) return NEED_LOGIN
  const built = buildTaskCapturePayload(args)
  if (built.error === 'empty_title') return '错误:待办标题不能为空。'
  const userId = CLOUD.user?.id
  if (!userId) return NEED_LOGIN

  const { payload } = built
  const sb = schemaClient('public')
  const { error } = await sb.from('life_events').insert({
    user_id: userId,
    type: 'core.task_captured',
    payload,
  })
  if (error) return `加待办失败:${error.message}`

  const due = payload.due_date ? `,到期 ${payload.due_date}` : ''
  return `已把「${payload.title}」${due}投递到 Planner 收件箱,下次打开 Planner 会自动出现在 Inbox。`
}
