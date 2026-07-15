#!/usr/bin/env node
/**
 * 508 参数模式的拖拽压力测试（wall-edit.js）。
 *
 * 这块此前零测试覆盖，却是参数模式下全部墙体/门窗拖拽的落点，
 * 且有 8 个引用方。fuzz 只覆盖了墙图模式，这里补上另一半。
 *
 * 每个 op 复刻 state.svelte.js 的 commitLayoutDrag：
 *   applyWallDrag / applyOpeningDrag → 拿不到就是「该方向无法继续调整」
 *   → applyLayoutConfig 再跑 validate508Config，不合法就拒绝落盘。
 * 所以真正要钉的是：**这道防线不能有缝** —— 落盘的 config 必须永远合法。
 *
 * 运行：npm run test:508-drag  [-- --runs=3000 --ops=40 --seed=1]
 */
import {
  applyOpeningDrag,
  applyWallDrag,
  OPENING_EDIT_BINDINGS,
  WALL_EDIT_ALIASES,
  WALL_EDIT_BINDINGS,
} from '../src/lib/spatial/wall-edit.js'
import {
  build508Project,
  default508Config,
  setRoomDimension,
  validate508Config,
} from '../src/lib/spatial/layout-508.js'

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)
const RUNS = Number(argv.runs ?? 1500)
const OPS = Number(argv.ops ?? 40)
const SEED0 = Number(argv.seed ?? 1)

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)]
const clone = (o) => JSON.parse(JSON.stringify(o))

const WALL_IDS = [
  ...Object.keys(WALL_EDIT_BINDINGS),
  ...Object.keys(WALL_EDIT_ALIASES),
]
const OPENING_IDS = Object.keys(OPENING_EDIT_BINDINGS)

/** @type {Map<string, { count: number, sample: any }>} */
const findings = new Map()
function record(tag, msg, ctx) {
  const cur = findings.get(tag)
  if (cur) {
    cur.count++
    if (ctx.history && ctx.history.length < cur.sample.history.length)
      cur.sample = { msg, ...ctx }
    return
  }
  findings.set(tag, { count: 1, sample: { msg, ...ctx } })
}

/**
 * 取一个**合法**的起点 config。
 *
 * 默认 config 目前过不了自己的校验（浴室门被走廊储物柜遮挡：门 offset 2'4"
 * 落在 2'8" 深的储物柜里）。而 applyLayoutConfig 只要有任何 issue 就拒绝落盘，
 * 于是所有拖拽全被拒 —— 压测将无事可做。这里先做已知的最小修复拿到合法起点，
 * 好让拖拽逻辑真的被压到；修复内容会在报告里点名，不藏着。
 */
function seedConfig() {
  const config = default508Config()
  const issues = validate508Config(config)
  if (!issues.length) return { config, repairedFrom: null }
  const repaired = setRoomDimension(config, 'linenCloset', 'w', { ft: 2, in: 4 })
  return { config: repaired, repairedFrom: issues[0] }
}

/** 复刻 commitLayoutDrag：先算，再验，验不过就不落盘 */
function commitDrag(config, kind, id, deltaPx, dragMode) {
  const next =
    kind === 'wall'
      ? applyWallDrag(config, id, deltaPx)
      : applyOpeningDrag(config, id, deltaPx, dragMode)
  if (!next) return { config, applied: false }
  // applyLayoutConfig 会 validate，不合法就 toast 拒绝
  if (validate508Config(next).length) return { config, applied: false, rejected: next }
  return { config: next, applied: true }
}

let runsOk = 0
let drift = 0
/** @type {string | null} */
let repairedFrom = null

for (let run = 0; run < RUNS; run++) {
  const seed = SEED0 + run
  const r = rng(seed)
  const seeded = seedConfig()
  let config = seeded.config
  repairedFrom = seeded.repairedFrom
  const history = []
  let broke = false

  // 起手必须是合法的，否则整轮都没意义
  const seedIssues = validate508Config(config)
  if (seedIssues.length) {
    record('SEED-INVALID', `起点 config 不合法且修不动：${seedIssues[0]}`, { seed, history: [] })
    break
  }

  for (let i = 0; i < OPS && !broke; i++) {
    const kind = r() < 0.5 ? 'wall' : 'opening'
    const id = kind === 'wall' ? pick(r, WALL_IDS) : pick(r, OPENING_IDS)
    const dragMode = r() < 0.25 ? 'width' : 'move'
    // 覆盖细微拖动到夸张拖动
    const deltaPx = Math.round((r() * 2 - 1) * pick(r, [4, 20, 90, 400]))

    const before = clone(config)
    let res
    try {
      res = commitDrag(config, kind, id, deltaPx, dragMode)
    } catch (err) {
      record('EX-THROW', `${kind} ${id} 抛错：${err.message}`, {
        seed, history: [...history, `${kind}:${id}@${deltaPx}`], err: err.stack,
      })
      broke = true
      break
    }

    // 纯函数性：入参不得被就地改写
    if (JSON.stringify(before) !== JSON.stringify(config)) {
      record('P-MUTATED-INPUT', `${kind} ${id} 就地改写了入参 config`, {
        seed, history: [...history, `${kind}:${id}@${deltaPx}`],
      })
      broke = true
      break
    }

    if (!res.applied) continue
    history.push(`${kind}:${id}@${deltaPx}`)
    config = res.config

    // 落盘的 config 必须永远合法 —— 这是整道防线的意义
    const issues = validate508Config(config)
    if (issues.length) {
      record('V-INVALID-PERSISTED', `落盘了不合法的 config：${issues[0]}`, {
        seed, history: [...history], op: `${kind}:${id}@${deltaPx}`,
      })
      broke = true
      break
    }

    // 渲染必须不炸，且几何必须有限
    try {
      const project = build508Project(config, {})
      if (!Number.isFinite(project.viewport.width) || !Number.isFinite(project.viewport.height)) {
        record('R-VIEWPORT-NAN', 'viewport 出现 NaN', { seed, history: [...history] })
        broke = true
        break
      }
      for (const w of project.walls) {
        if (![w.from.x, w.from.y, w.to.x, w.to.y].every(Number.isFinite)) {
          record('R-WALL-NAN', `墙 ${w.id} 坐标非有限`, { seed, history: [...history] })
          broke = true
          break
        }
      }
    } catch (err) {
      record('R-THROW', `build508Project 抛错：${err.message}`, {
        seed, history: [...history], err: err.stack,
      })
      broke = true
      break
    }

    // 可逆性：拖 +d 再拖 -d，应该回到原处（两次都被接受时才算数）
    const back = commitDrag(config, kind, id, -deltaPx, dragMode)
    if (back.applied && JSON.stringify(back.config) !== JSON.stringify(before)) {
      drift++
      record(
        'D-NOT-REVERSIBLE',
        `${kind} ${id} 拖 ${deltaPx}px 再拖回 ${-deltaPx}px 没回到原状`,
        { seed, history: [...history], op: `${kind}:${id}@${deltaPx}` },
      )
      broke = true
      break
    }
  }
  if (!broke) runsOk++
}

console.log(`\n508 拖拽压测：${RUNS} 轮 × ${OPS} ops，seed ${SEED0}..${SEED0 + RUNS - 1}`)
if (repairedFrom) {
  console.log(
    `⚠️  默认 config 过不了自己的校验（${repairedFrom}），`,
  )
  console.log(
    '    起点已就地修复（走廊储物柜宽 → 2\'4"）才跑得动 —— 这是另一个待决的数据问题，不是本压测的结论。',
  )
}
console.log(`干净跑完：${runsOk}/${RUNS}\n`)

if (!findings.size) {
  console.log('✅ 未发现违例')
  process.exit(0)
}

for (const [tag, { count, sample }] of [...findings.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`❌ ${tag}  ×${count}`)
  console.log(`   ${sample.msg}`)
  console.log(`   seed=${sample.seed}  ops=${sample.history?.length}`)
  console.log(`   复现路径: ${sample.history?.join(' → ') || '(第一步就炸)'}`)
  if (argv.verbose && sample.err) console.log(sample.err)
  console.log()
}
process.exit(1)
