/**
 * State Engine v0 — 六维状态推导(纯函数,零依赖,可直接跑 node --test)。
 *
 * 原则(HLT-2 完成标准):每个维度输出 level + 结构化 reasons(来源可解释),
 * 绝不输出无法追溯的裸分数。Raw observation ≠ Interpretation:本文件只做
 * Interpretation,观察数据的采集与持久化在 stateEngine.svelte.js / Focus 代理。
 *
 * level 语义:good(状态好)/ ok(正常)/ watch(开始恶化,注意)/ bad(该干预)
 *            / unknown(缺数据,如实说,不编)
 * reason 形如 { k: 'state.r_xxx', p: {参数} },由页面经 i18n 渲染。
 */

export const DIMENSION_ORDER = ['energy', 'focus', 'recovery', 'stress', 'sleepDebt', 'physical']

/** 综合结论的排查优先级:先看谁最需要被处理 */
const HEADLINE_PRIORITY = ['stress', 'sleepDebt', 'recovery', 'energy', 'physical', 'focus']

const HOUR = 3600 * 1000

// ---------- 观察数据选择器(纯) ----------

/** 最近 18 小时内的最后一次主观 check-in;更早的视为过期 */
export function latestCheckin(list, now) {
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i]
    if (o.type !== 'checkin') continue
    if (now - o.ts > 18 * HOUR) return null
    return o
  }
  return null
}

function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * 最近的睡眠记录(24h 内算“昨晚”)+ 用于均值的最近几晚。
 * 同一晚可能同时有手动记录和 Apple Health 测量值 → 按日去重,measured(source:'health')优先。
 */
export function recentSleeps(list, now, n = 3) {
  const byDate = new Map()
  for (const o of list) {
    if (o.type !== 'sleep') continue
    const k = dayKey(o.ts)
    const prev = byDate.get(k)
    const better =
      !prev ||
      (o.source === 'health' && prev.source !== 'health') ||
      (o.source === prev.source && o.ts > prev.ts)
    if (better) byDate.set(k, o)
  }
  const merged = [...byDate.values()].sort((a, b) => a.ts - b.ts) // 旧→新
  const recent = merged.slice(-n).reverse() // 新在前
  const last = recent[0] && now - recent[0].ts <= 24 * HOUR ? recent[0] : null
  return { last, recent }
}

/** Apple Health /health 天数据 → 睡眠观察数据(measured),喂进 State Engine */
export function healthDaysToSleepObs(days) {
  if (!Array.isArray(days)) return []
  return days
    .filter((d) => d && d.date && typeof d.sleepHours === 'number')
    .map((d) => ({
      ts: new Date(`${d.date}T08:00:00`).getTime(),
      type: 'sleep',
      hours: d.sleepHours,
      source: 'health',
    }))
}

/**
 * HLT-3 自适应专注窗口:睡眠债/压力/恢复/精力越差,窗口越紧。
 * 纯函数,返回建议分钟数 + 驱动维度(null = 用基准,不覆盖)。
 * @param {Record<string,{level:string}>} dims
 * @param {number} baseMinutes 代理基准窗口(config)
 */
export function recommendPolicy(dims, baseMinutes = 20) {
  const rank = { good: 0, ok: 0, unknown: 0, watch: 1, bad: 2 }
  let sev = 0
  let driver = null
  for (const k of ['sleepDebt', 'stress', 'recovery', 'energy']) {
    const r = rank[dims?.[k]?.level] ?? 0
    if (r > sev) {
      sev = r
      driver = k
    }
  }
  if (sev === 0) return { limitMinutes: baseMinutes, driver: null }
  const limitMinutes = Math.min(baseMinutes, sev >= 2 ? 12 : 16)
  return { limitMinutes, driver }
}

// ---------- 推导 ----------

function fmtTime(ts) {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function levelFromFive(v) {
  if (v >= 4) return 'good'
  if (v >= 3) return 'ok'
  if (v >= 2) return 'watch'
  return 'bad'
}

/** 睡眠小时数映射到 1-5(供 physical 合成) */
function sleepToFive(hours) {
  if (hours >= 8) return 5
  if (hours >= 7) return 4
  if (hours >= 6) return 3
  if (hours >= 5) return 2
  return 1
}

/**
 * @param {object} input
 * @param {number} input.now                 epoch ms
 * @param {Array}  input.observations        [{ts, type:'checkin', energy, stress} | {ts, type:'sleep', hours}]
 * @param {object} input.agent               { online, phase, score, limitSeconds, note,
 *                                             breaksToday, todayNetMinutes, warnsToday }
 * @returns {{ dims: Record<string, {level: string, reasons: Array<{k:string,p?:object}>}>, headline: {k:string,p?:object} }}
 */
export function deriveState({ now, observations, agent }) {
  const checkin = latestCheckin(observations, now)
  const { last: sleepLast, recent: sleeps } = recentSleeps(observations, now)
  const a = agent ?? { online: false }
  const netMin = Math.max(0, Math.round(a.todayNetMinutes ?? 0))
  const dims = {}

  // Energy — 主观精力,长时间高负荷下调一档
  {
    const reasons = []
    if (!checkin) {
      dims.energy = { level: 'unknown', reasons: [{ k: 'state.r_noCheckin' }] }
    } else {
      let v = checkin.energy
      reasons.push({
        k: 'state.r_checkin',
        p: { time: fmtTime(checkin.ts), energy: checkin.energy, stress: checkin.stress },
      })
      const hrs = Math.round((now - checkin.ts) / HOUR)
      if (hrs >= 6) reasons.push({ k: 'state.r_stale', p: { hours: hrs } })
      if (netMin >= 150) {
        v -= 1
        reasons.push({ k: 'state.r_highLoad', p: { min: netMin } })
      }
      dims.energy = { level: levelFromFive(v), reasons }
    }
  }

  // Focus — Focus 代理实时相位
  {
    if (!a.online) {
      dims.focus = { level: 'unknown', reasons: [{ k: 'state.r_agentOffline' }] }
    } else if (a.phase === 'breaking') {
      dims.focus = { level: 'ok', reasons: [{ k: 'state.r_break' }] }
    } else {
      const limit = Math.max(1, a.limitSeconds ?? 1200)
      const frac = (a.score ?? 0) / limit
      const p = { min: Math.floor((a.score ?? 0) / 60), limit: Math.floor(limit / 60) }
      const reasons = [
        frac >= 0.85 || a.phase === 'warning'
          ? { k: 'state.r_nearLimit', p }
          : { k: 'state.r_headroom', p },
      ]
      if (a.note) reasons.push({ k: 'state.r_focusLive', p: { note: a.note } })
      const level = a.phase === 'warning' || frac >= 0.85 ? 'watch' : frac >= 0.5 ? 'ok' : 'good'
      dims.focus = { level, reasons }
    }
  }

  // Recovery — 今日负荷 vs 保护休息次数(粗略:每小时净专注应配 1 次)
  {
    if (!a.online && netMin === 0) {
      dims.recovery = { level: 'unknown', reasons: [{ k: 'state.r_agentOffline' }] }
    } else if (netMin < 30) {
      dims.recovery = { level: 'good', reasons: [{ k: 'state.r_netToday', p: { min: netMin } }] }
    } else {
      const breaks = a.breaksToday ?? 0
      const needed = Math.floor(netMin / 60)
      if (breaks >= needed) {
        dims.recovery = {
          level: 'ok',
          reasons: [
            { k: 'state.r_netToday', p: { min: netMin } },
            { k: 'state.r_breaks', p: { n: breaks } },
          ],
        }
      } else {
        dims.recovery = {
          level: 'watch',
          reasons: [{ k: 'state.r_fewBreaks', p: { min: netMin, n: breaks } }],
        }
      }
    }
  }

  // Stress — 主观压力,当天频繁逼近强制休息上调一档
  {
    if (!checkin) {
      dims.stress = { level: 'unknown', reasons: [{ k: 'state.r_noCheckin' }] }
    } else {
      let v = checkin.stress
      const reasons = [
        {
          k: 'state.r_checkin',
          p: { time: fmtTime(checkin.ts), energy: checkin.energy, stress: checkin.stress },
        },
      ]
      const warns = a.warnsToday ?? 0
      if (warns >= 2) {
        v += 1
        reasons.push({ k: 'state.r_warns', p: { n: warns } })
      }
      // 压力是反向量表:低 = 好
      const level = v <= 2 ? 'good' : v <= 3 ? 'ok' : v <= 4 ? 'watch' : 'bad'
      dims.stress = { level, reasons }
    }
  }

  // Sleep debt — 昨晚时长 + 近几晚均值
  {
    if (!sleepLast) {
      dims.sleepDebt = { level: 'unknown', reasons: [{ k: 'state.r_noSleep' }] }
    } else {
      const h = sleepLast.hours
      const sleepKey = sleepLast.source === 'health' ? 'state.r_sleepLastMeasured' : 'state.r_sleepLast'
      const reasons = [{ k: sleepKey, p: { hours: h } }]
      let level = h >= 7 ? 'good' : h >= 6 ? 'ok' : h >= 5 ? 'watch' : 'bad'
      if (sleeps.length >= 2) {
        const avg = sleeps.reduce((s, o) => s + o.hours, 0) / sleeps.length
        reasons.push({ k: 'state.r_sleepAvg', p: { n: sleeps.length, avg: avg.toFixed(1) } })
        if (avg < 6.5 && level === 'good') level = 'ok' // 单晚补觉抵不掉连续欠债
      }
      dims.sleepDebt = { level, reasons }
    }
  }

  // Physical readiness — v0 启发式:睡眠 × 精力合成,缺一即 unknown
  {
    if (!checkin || !sleepLast) {
      const reasons = []
      if (!checkin) reasons.push({ k: 'state.r_noCheckin' })
      if (!sleepLast) reasons.push({ k: 'state.r_noSleep' })
      dims.physical = { level: 'unknown', reasons }
    } else {
      const avg = (checkin.energy + sleepToFive(sleepLast.hours)) / 2
      dims.physical = {
        level: levelFromFive(Math.round(avg)),
        reasons: [
          { k: 'state.r_derived' },
          {
            k: sleepLast.source === 'health' ? 'state.r_sleepLastMeasured' : 'state.r_sleepLast',
            p: { hours: sleepLast.hours },
          },
        ],
      }
    }
  }

  // 综合结论
  let headline
  if (a.online && a.phase === 'breaking') {
    headline = { k: 'state.h_breaking' }
  } else {
    const firstAt = (lvl) => HEADLINE_PRIORITY.find((k) => dims[k].level === lvl)
    const worst = firstAt('bad') ?? firstAt('watch')
    const unknowns = DIMENSION_ORDER.filter((k) => dims[k].level === 'unknown').length
    if (worst) {
      headline = { k: `state.h_${worst}` }
    } else if (unknowns >= 3) {
      // 一半以上维度缺数据时,不假装知道"状态不错"——先引导补数据
      headline = { k: 'state.h_noData' }
    } else {
      headline = { k: 'state.h_allGood' }
    }
  }

  return { dims, headline }
}
