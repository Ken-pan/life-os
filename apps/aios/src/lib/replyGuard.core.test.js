import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assistantFabricatedMetrics,
  assistantLeakedCode,
  assistantOverClarifies,
  assistantViolatesStrictFormat,
  buildReplyGuardRewritePrompt,
  countClarifyingQuestions,
  detectReplyGuardViolations,
  filterToolsForVision,
  finalizeGuardedReply,
  shouldPreferQualityModel,
  userAsksStrictFormat,
  userForbidsCode,
  userIsVagueRequest,
  userProvidedMetrics,
  VISION_SAFE_TOOL_NAMES,
} from './replyGuard.core.js'

describe('replyGuard.core', () => {
  it('detects no-code asks and code leaks', () => {
    assert.equal(userForbidsCode('先别写代码，帮我拆计划'), true)
    assert.equal(assistantLeakedCode('```js\nfunction x(){}\n```'), true)
    assert.equal(assistantLeakedCode('实现 getTodayTasks() 然后渲染'), true)
    assert.equal(assistantLeakedCode('确认技术栈（如 React/Vue + Tailwind）'), true)
    assert.equal(assistantLeakedCode('建议初期使用本地 JSON 或 SQLite'), true)
    assert.equal(assistantLeakedCode('确认技术栈方向，下轮再定'), false)
    assert.equal(assistantLeakedCode('第一周做数据模型，第二周做界面'), false)
  })

  it('detects fabricated metrics when user gave none', () => {
    assert.equal(userProvidedMetrics('写三个邮件标题'), false)
    assert.equal(assistantFabricatedMetrics('本地助手响应速度提升 50%'), true)
    assert.equal(assistantFabricatedMetrics('本地助手现在更快了'), false)
    const v = detectReplyGuardViolations(
      '把标题按更短/更具体各改一版',
      '更具体版：本地助手响应速度提升 50%',
    )
    assert.ok(v.some((x) => x.kind === 'no-fabricated-metrics'))
  })

  it('skips metric guard when user supplied the number', () => {
    const v = detectReplyGuardViolations(
      '我们确实提升了 50%，写个标题',
      '响应速度提升 50%：本地助手更快了',
    )
    assert.equal(v.some((x) => x.kind === 'no-fabricated-metrics'), false)
  })

  it('flags quality model for multi-constraint turns', () => {
    assert.equal(shouldPreferQualityModel('先别写代码，拆两周计划'), false)
    assert.equal(shouldPreferQualityModel('按更短/更具体各改一版'), true)
    assert.equal(shouldPreferQualityModel('只要清单，不要其他字'), true)
    assert.equal(shouldPreferQualityModel('你好'), false)
  })

  it('builds rewrite prompt without leaking meta chatter requirement', () => {
    const prompt = buildReplyGuardRewritePrompt(
      [{ kind: 'no-code', note: 'x' }],
      '先别写代码',
      '用 getTodayTasks() 拉数据',
    )
    assert.match(prompt, /只输出修订后的正文/)
    assert.match(prompt, /先别写代码/)
  })

  it('finalizeGuardedReply scrubs residual SQLite after rewrite', async () => {
    const { finalizeGuardedReply } = await import('./replyGuard.core.js')
    const out = finalizeGuardedReply(
      '先别写代码，拆计划',
      '第一周做界面草图。\n若选择 SQLite 会超时。\n第二周做验收。',
    )
    assert.equal(/SQLite/.test(out), false)
    assert.match(out, /界面草图/)
  })

  it('clamps anxiety replies that dump multi-week plans', async () => {
    const { finalizeGuardedReply, userShowsBlockedAnxiety, assistantDumpedLongPlan } =
      await import('./replyGuard.core.js')
    const user = '我想三个月内写完毕业论文，现在还没开始文献综述，好焦虑。'
    const draft = [
      '### 今天（2小时内）可完成的一件事',
      '建立文献地图骨架。',
      '',
      '### 📅 三个月（12周）极简执行计划',
      '| 阶段 | 时间 | 核心目标 |',
      '| :--- | :--- | :--- |',
      '| 第1-2周 | 第1-14天 | 定题与框架 |',
      '| 第3-5周 | 第15-35天 | 文献综述撰写 |',
    ].join('\n')
    assert.equal(userShowsBlockedAnxiety(user), true)
    assert.equal(assistantDumpedLongPlan(draft), true)
    const v = detectReplyGuardViolations(user, draft)
    assert.ok(v.some((x) => x.kind === 'anxiety-today-only'))
    const out = finalizeGuardedReply(user, draft)
    assert.equal(/12\s*周|第1-2周|阶段/.test(out), false)
    assert.match(out, /今天|文献/)
    assert.match(out, /更长/)
    // Explicit long-plan ask should not clamp
    assert.equal(
      detectReplyGuardViolations('给我一个三个月完整计划拆成12周', draft).some(
        (x) => x.kind === 'anxiety-today-only',
      ),
      false,
    )
  })

  it('detects strict-format and finalize truncates + strips preamble', () => {
    assert.equal(userAsksStrictFormat('只要清单，不要其他字'), true)
    const user = '压到不超过 50 字。只输出正文，不要开场白。'
    const draft =
      '好的！以下是修订版：\nAI.OS 是本机私人助手，推理在本地完成，也可选联网查询时效信息，语气轻松好用，非常适合日常办公与个人知识管理场景。'
    assert.equal(assistantViolatesStrictFormat(user, draft), true)
    const v = detectReplyGuardViolations(user, draft)
    assert.ok(v.some((x) => x.kind === 'strict-format'))
    const out = finalizeGuardedReply(user, draft)
    assert.equal(/^(好的|以下是)/m.test(out.trim()), false)
    assert.ok(out.replace(/\s/g, '').length <= 52)
    assert.match(buildReplyGuardRewritePrompt(v, user, draft), /不超过 50 字/)
  })

  it('detects clarify-budget and finalize keeps ≤3 questions + assumption', () => {
    assert.equal(userIsVagueRequest('帮我弄一下那个健身的事。'), true)
    const draft = [
      '想先确认几件事：',
      '1. 目标是减脂还是拉伸？',
      '2. 每天能练多久？',
      '3. 有没有器械？',
      '4. 膝盖/腰有没有旧伤？',
      '5. 更偏好居家还是健身房？',
      '6. 早上还是晚上？',
    ].join('\n')
    assert.ok(countClarifyingQuestions(draft) > 3)
    assert.equal(assistantOverClarifies('帮我弄一下那个健身的事。', draft), true)
    const v = detectReplyGuardViolations('帮我弄一下那个健身的事。', draft)
    assert.ok(v.some((x) => x.kind === 'clarify-budget'))
    const out = finalizeGuardedReply('帮我弄一下那个健身的事。', draft)
    assert.ok(countClarifyingQuestions(out) <= 3)
    assert.match(out, /假设方案/)
    assert.match(buildReplyGuardRewritePrompt(v, '帮我弄一下那个健身的事。', draft), /最多保留 3/)
  })

  it('filterToolsForVision keeps safe tools and drops risky ones', () => {
    const tools = [
      { type: 'function', function: { name: 'calculate' } },
      { type: 'function', function: { name: 'get_time' } },
      { type: 'function', function: { name: 'web_search' } },
      { type: 'function', function: { name: 'run_shell' } },
      { type: 'function', function: { name: 'search_memory' } },
    ]
    assert.equal(filterToolsForVision(tools, false), tools)
    assert.equal(filterToolsForVision(undefined, true), undefined)
    const filtered = filterToolsForVision(tools, true)
    assert.deepEqual(
      filtered.map((t) => t.function.name),
      ['calculate', 'get_time', 'search_memory'],
    )
    for (const name of ['calculate', 'get_time', 'search_memory']) {
      assert.ok(VISION_SAFE_TOOL_NAMES.includes(name))
    }
    assert.equal(VISION_SAFE_TOOL_NAMES.includes('web_search'), false)
    assert.equal(VISION_SAFE_TOOL_NAMES.includes('run_shell'), false)
  })
})
