// 本地演示数据（localhost）—— 一整套自洽的训练快照，全面点亮各核心页面：
// 今日 / 计划 / 训练日详情 / 专注记录 / 统计 / 记录。仅 localhost 空库时灌入（见 demoMode.js）。
// 结构随 migrate() 归一化，写宽松即可。数值虚构但符合真实进阶节奏（重量单位 LBS，RIR 0–3）。
//
// 只灌 logs / rotation / weights / settings.bodyweight —— 计划本体是静态代码（program.js），不入库。
// 动作 id 与每日组数严格对齐 bro-split（胸 chest → 背 back → 腿 legs → 臂 arms）真实定义。

const DAY = 86_400_000

/** 本地时区 YYYY-MM-DD（对齐 state.dateKeyOf，避免晚间训练记到「明天」） */
function dayKey(offsetDays) {
  const d = new Date(Date.now() - offsetDays * DAY)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 某天傍晚 19:00 起、每组间隔数分钟的 ISO 时间戳 */
function setIso(offsetDays, minutesIn) {
  const d = new Date(Date.now() - offsetDays * DAY)
  d.setHours(19, 0, 0, 0)
  d.setMinutes(d.getMinutes() + minutesIn)
  return d.toISOString()
}

/**
 * bro-split 各训练日的动作定义（id / 组数 / 基准次数 / 当前工作重量 LBS）。
 * 与 program.js 的 BRO_DAYS 真实动作严格一致；per-side 器械（哑铃）重量按单侧存。
 */
const DAYS = {
  chest: [
    { id: 'c_bench', sets: 4, reps: 7, w: 185, step: 5 },
    { id: 'c_incdb', sets: 3, reps: 10, w: 55, step: 2.5 },
    { id: 'c_incmc', sets: 3, reps: 11, w: 90, step: 5 },
    { id: 'c_fly', sets: 3, reps: 13, w: 40, step: 2.5 },
  ],
  back: [
    { id: 'b_pull', sets: 4, reps: 8, w: 0, step: 0 },
    { id: 'b_chestsup', sets: 3, reps: 11, w: 100, step: 5 },
    { id: 'b_pulldown', sets: 3, reps: 11, w: 150, step: 5 },
    { id: 'b_row', sets: 3, reps: 11, w: 130, step: 5 },
    { id: 'b_face', sets: 3, reps: 17, w: 50, step: 2.5 },
    { id: 'b_ext', sets: 3, reps: 13, w: 45, step: 0 },
  ],
  legs: [
    { id: 'l_squat', sets: 4, reps: 9, w: 275, step: 10 },
    { id: 'l_rdl', sets: 3, reps: 9, w: 155, step: 5 },
    { id: 'l_press', sets: 3, reps: 12, w: 360, step: 10 },
    { id: 'l_curl', sets: 3, reps: 12, w: 120, step: 5 },
    { id: 'l_ext', sets: 3, reps: 13, w: 160, step: 5 },
    { id: 'l_thrust', sets: 3, reps: 11, w: 275, step: 10 },
    { id: 'l_calf', sets: 4, reps: 14, w: 200, step: 5 },
  ],
  arms: [
    { id: 'ar_cgbench', sets: 3, reps: 9, w: 135, step: 5 },
    { id: 'ar_ezcurl', sets: 3, reps: 10, w: 70, step: 2.5 },
    { id: 'ar_ropeoh', sets: 3, reps: 12, w: 50, step: 2.5 },
    { id: 'ar_preacher', sets: 3, reps: 11, w: 75, step: 2.5 },
    { id: 'ar_rope', sets: 2, reps: 13, w: 55, step: 2.5 },
    { id: 'ar_hammer', sets: 2, reps: 12, w: 35, step: 2.5 },
  ],
}

/**
 * 训练排期（最近 ~4 周，胸→背→腿→臂 严格轮换）。
 * cyclesAgo：该动作相对最近一次的「回退圈数」，用来把更早的历史重量线性调低，制造进阶曲线。
 * 最近一次过去训练是 arms（offset 2）→ 今日推荐落在 chest（见 state.todayDayId）。
 */
const SESSIONS = [
  { offset: 26, dayId: 'chest', cyclesAgo: 3 },
  { offset: 23, dayId: 'back', cyclesAgo: 2 },
  { offset: 21, dayId: 'legs', cyclesAgo: 2 },
  { offset: 19, dayId: 'arms', cyclesAgo: 2 },
  { offset: 16, dayId: 'chest', cyclesAgo: 2 },
  { offset: 14, dayId: 'back', cyclesAgo: 1 },
  { offset: 12, dayId: 'legs', cyclesAgo: 1 },
  { offset: 10, dayId: 'arms', cyclesAgo: 1 },
  { offset: 8, dayId: 'chest', cyclesAgo: 1 },
  { offset: 6, dayId: 'back', cyclesAgo: 0 },
  { offset: 4, dayId: 'legs', cyclesAgo: 0 },
  { offset: 2, dayId: 'arms', cyclesAgo: 0 },
]

const round2half = (v) => Math.round(v * 2) / 2

/** 生成一组：随组数递增 RIR（3→0）、随疲劳略降次数；per-side 器械重量原样（单侧值） */
function makeSet(offset, exW, baseReps, si) {
  return {
    reps: Math.max(baseReps - si, baseReps - 3),
    rir: Math.max(3 - si, 0),
    weight: exW,
    ts: setIso(offset, si * 3),
  }
}

/** 某动作在某次训练的整条记录（全部组完成） */
function makeEntry(offset, ex, cyclesAgo) {
  const w = ex.w > 0 ? round2half(ex.w - ex.step * cyclesAgo) : 0
  const sets = Array.from({ length: ex.sets }, (_, si) =>
    makeSet(offset, w, ex.reps, si),
  )
  return {
    done: ex.sets,
    sets,
    skipped: null,
    startedAt: setIso(offset, 0),
  }
}

/** 体重序列：近 ~4 周约每 3–4 天一记，从 181 缓降到 178（LBS，轻度减脂趋势） */
function buildBodyweight() {
  const points = [
    [27, 181.4],
    [23, 181.0],
    [19, 180.3],
    [15, 179.6],
    [11, 179.2],
    [7, 178.7],
    [3, 178.3],
    [0, 178.0],
  ]
  return points.map(([offset, w]) => ({
    date: dayKey(offset),
    w,
    ts: setIso(offset, 0),
  }))
}

/**
 * 完整持久化对象（raw，交给 migrate 归一化）。
 * 只覆盖真实产生数据的字段；其余走 migrate 补默认。
 */
export function buildDemoSeed() {
  /** @type {Record<string, any>} */
  const logs = {}
  /** @type {{ date: string, dayId: string }[]} */
  const history = []

  // —— 过去 12 次完整训练：点亮 计划进度 / 训练日详情 / 统计 / 记录 / 轮换历史 ——
  for (const s of SESSIONS) {
    const key = `${dayKey(s.offset)}|${s.dayId}`
    const dayLog = {}
    for (const ex of DAYS[s.dayId]) {
      dayLog[ex.id] = makeEntry(s.offset, ex, s.cyclesAgo)
    }
    logs[key] = dayLog
    history.push({ date: dayKey(s.offset), dayId: s.dayId })
  }

  // —— 今日胸日：仅前 2 个动作完成，制造「进行中」session（点亮 专注 / 今日概览）——
  const todayEx = DAYS.chest
  const todayLog = {}
  todayLog[todayEx[0].id] = makeEntry(0, todayEx[0], 0) // c_bench 4/4
  todayLog[todayEx[1].id] = makeEntry(0, todayEx[1], 0) // c_incdb 3/3
  logs[`${dayKey(0)}|chest`] = todayLog // 后两个动作缺席 → 进行中

  // —— 当前工作重量映射（LBS）：动作起始重量记忆 ——
  /** @type {Record<string, number>} */
  const weights = {}
  for (const dayId of ['chest', 'back', 'legs', 'arms']) {
    for (const ex of DAYS[dayId]) {
      if (ex.w > 0) weights[ex.id] = ex.w
    }
  }

  return {
    schemaVersion: 7,
    activeProgramId: 'bro-split',
    settings: {
      unit: 'lbs',
      theme: 'dark',
      locale: 'zh',
      bodyweight: buildBodyweight(),
    },
    weights,
    logs,
    rotation: {
      // 最近过去训练是 arms → next 指向 chest（index 0），与 todayDayId 推荐一致
      next: 0,
      history: history.sort((a, b) => a.date.localeCompare(b.date)),
      lastDeload: null,
      phaseStart: dayKey(26),
    },
    lastDay: 'arms',
    sessionMeta: {},
    programOverrides: {},
  }
}
