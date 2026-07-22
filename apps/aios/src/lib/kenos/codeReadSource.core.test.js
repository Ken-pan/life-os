import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bubbleRole,
  clampThreadMessages,
  extractBubbleHeaders,
  extractComposerMeta,
  extractToolSummary,
  mergeThreadDelta,
  projectCursorSessions,
  projectCursorThread,
  projectCodeSessionsResult,
} from './codeReadSource.core.js'

// 结构取自本机真实 Cursor 数据抽样(state.vscdb / conversation-search.db)。
const COMPOSER = {
  composerId: '33c9c4dc-3065-431e-ab7e-962e6c1b725b',
  name: 'Device access optimization',
  status: 'aborted',
  createdAt: 1784683406145,
  fullConversationHeadersOnly: [
    { bubbleId: 'b-user-1', type: 1, createdAt: '2026-07-22T01:23:26.440Z' },
    { bubbleId: 'b-asst-1', type: 2, createdAt: '2026-07-22T01:23:40.000Z' },
    { bubbleId: 'b-tool-empty', type: 2, createdAt: '2026-07-22T01:23:41.000Z' },
    { bubbleId: 'b-user-2', type: 1, createdAt: '2026-07-22T01:24:00.000Z' },
  ],
}
const BUBBLES = {
  'b-user-1': { type: 1, text: '请你帮我优化一下设备锁' },
  'b-asst-1': { type: 2, text: '这是典型的「设备信任 / 设备锁」架构问题。' },
  'b-tool-empty': { type: 2, text: '' }, // 无文本气泡应被跳过
  'b-user-2': { type: 1, text: '好的继续' },
}

describe('codeReadSource.core', () => {
  it('maps bubble type to role (1=user, 2/other=assistant)', () => {
    assert.equal(bubbleRole(1), 'user')
    assert.equal(bubbleRole(2), 'assistant')
    assert.equal(bubbleRole(undefined), 'assistant')
  })

  it('sorts sessions most-recent-first and fills defaults', () => {
    const rows = [
      { id: 'a', title: 'old', updated_at: 100, is_archived: 0, source: 'local' },
      { id: 'b', title: '', updated_at: 300, is_archived: 1, source: 'local' },
      { id: '', title: 'skipme', updated_at: 999 }, // 无 id 跳过
    ]
    const out = projectCursorSessions(rows)
    assert.equal(out.length, 2)
    assert.equal(out[0].id, 'b')
    assert.equal(out[0].title, '未命名对话')
    assert.equal(out[0].archived, true)
    assert.equal(out[1].id, 'a')
  })

  it('extracts ordered bubble headers from new structure', () => {
    const headers = extractBubbleHeaders(COMPOSER)
    assert.equal(headers.length, 4)
    assert.equal(headers[0].bubbleId, 'b-user-1')
    assert.equal(headers[0].role, 'user')
    assert.equal(headers[1].role, 'assistant')
    assert.ok(headers[0].ts > 0)
  })

  it('falls back to conversationMap when headers absent', () => {
    const headers = extractBubbleHeaders({
      conversationMap: { x: { type: 1 }, y: { type: 2 } },
    })
    assert.deepEqual(
      headers.map((h) => h.role),
      ['user', 'assistant'],
    )
  })

  it('projects a full thread, preserving order and dropping empty bubbles', () => {
    const thread = projectCursorThread(COMPOSER, BUBBLES)
    assert.equal(thread.id, '33c9c4dc-3065-431e-ab7e-962e6c1b725b')
    assert.equal(thread.title, 'Device access optimization')
    assert.equal(thread.status, 'aborted')
    assert.equal(thread.messages.length, 3) // 空气泡被跳过
    assert.deepEqual(
      thread.messages.map((m) => m.role),
      ['user', 'assistant', 'user'],
    )
    assert.equal(thread.messages[0].text, '请你帮我优化一下设备锁')
  })

  it('truncates over-long message text', () => {
    const long = 'x'.repeat(25000)
    const thread = projectCursorThread(
      { composerId: 'c', fullConversationHeadersOnly: [{ bubbleId: 'z', type: 2 }] },
      { z: { type: 2, text: long } },
    )
    assert.ok(thread.messages[0].text.length < 25000)
    assert.ok(thread.messages[0].text.endsWith('（已截断）'))
  })

  it('merges deltas: reuses untouched refs, updates streaming tail, appends new bubbles', () => {
    const prev = projectCursorThread(COMPOSER, BUBBLES)
    assert.equal(prev.messages.length, 3)

    // 流式场景:尾气泡文本在长,同时新出现一条 assistant 气泡。
    const grownComposer = {
      ...COMPOSER,
      fullConversationHeadersOnly: [
        ...COMPOSER.fullConversationHeadersOnly,
        { bubbleId: 'b-asst-2', type: 2, createdAt: '2026-07-22T01:24:10.000Z' },
      ],
    }
    // 本轮只拉了尾气泡(文本已增长)和新气泡 —— 其余不在 bubbleJsons 里。
    const delta = mergeThreadDelta(prev, grownComposer, {
      'b-user-2': { type: 1, text: '好的继续,顺便看下测试' },
      'b-asst-2': { type: 2, text: '收到,正在跑测试…' },
    })
    assert.equal(delta.messages.length, 4)
    // 没拉的旧消息保持对象引用不变(下游按引用短路)。
    assert.equal(delta.messages[0], prev.messages[0])
    assert.equal(delta.messages[1], prev.messages[1])
    // 拉了且变了的换新对象。
    assert.equal(delta.messages[2].text, '好的继续,顺便看下测试')
    assert.notEqual(delta.messages[2], prev.messages[2])
    assert.equal(delta.messages[3].text, '收到,正在跑测试…')

    // 拉了但内容没变 → 引用也不变。
    const same = mergeThreadDelta(prev, COMPOSER, { 'b-user-2': BUBBLES['b-user-2'] })
    assert.equal(same.messages[2], prev.messages[2])

    // 本轮拉到的空气泡:无工具名 → 跳过;有工具名 → 投影成 tool 步骤消息。
    const withEmpty = mergeThreadDelta(prev, COMPOSER, { 'b-tool-empty': { type: 2, text: '' } })
    assert.equal(withEmpty.messages.length, 3)
    const withTool = mergeThreadDelta(prev, COMPOSER, {
      'b-tool-empty': { type: 2, text: '', toolFormerData: { name: 'edit_file_v2' } },
    })
    assert.equal(withTool.messages.length, 4)
    const toolMsg = withTool.messages.find((m) => m.tool)
    assert.equal(toolMsg.tool, 'edit_file_v2')
    assert.equal(toolMsg.text, '')
    // 桥的精简行形态(.tool 直给)同样识别
    const slim = mergeThreadDelta(prev, COMPOSER, {
      'b-tool-empty': { type: 2, text: '', tool: 'read_file_v2' },
    })
    assert.equal(slim.messages.find((m) => m.tool)?.tool, 'read_file_v2')
    // 模型工具的截尾把 tool 步骤滤掉(不进上下文)
    const clamped = clampThreadMessages(withTool.messages)
    assert.ok(clamped.messages.every((m) => m.text))
  })

  it('extracts tool summaries (path tail, first command line, failure flag)', () => {
    // 结构取自真实 toolFormerData 抽样
    const read = extractToolSummary({
      name: 'read_file_v2',
      status: 'completed',
      rawArgs: '{"path":"/Users/kenpan/proj/apps/portal/src/routes/+page.svelte","limit":40}',
    })
    assert.deepEqual(read, { tool: 'read_file_v2', arg: 'routes/+page.svelte' })
    const run = extractToolSummary({
      name: 'run_terminal_command_v2',
      status: 'error',
      rawArgs: JSON.stringify({ command: '# comment line\nnpm test && echo done' }),
    })
    assert.equal(run.arg, 'npm test && echo done') // 跳过注释行
    assert.equal(run.failed, true)
    const long = extractToolSummary({
      name: 'ripgrep_raw_search',
      rawArgs: JSON.stringify({ pattern: 'x'.repeat(200) }),
    })
    assert.ok(long.arg.length <= 81 && long.arg.endsWith('…'))
    assert.equal(extractToolSummary({ name: 'todo_write', rawArgs: '{"merge":true}' }).arg, undefined)
    assert.equal(extractToolSummary(null), null)
    assert.equal(extractToolSummary({ rawArgs: 'broken{' }), null)
  })

  it('extracts composer meta across field-shape variants', () => {
    // 干净 modelName + 独立 params
    const clean = extractComposerMeta({
      modelConfig: {
        modelName: 'grok-4.5',
        maxMode: false,
        selectedModels: [{ modelId: 'grok-4.5', parameters: [{ id: 'effort', value: 'high' }, { id: 'fast', value: 'true' }] }],
      },
      unifiedMode: 'agent',
      contextUsagePercent: 71.36,
      subagentComposerIds: ['a', 'b', 'c'],
      trackedGitRepos: [{ repoPath: '/Users/x/「Projects」/life-os' }],
    })
    assert.deepEqual(clean, {
      model: 'grok-4.5',
      effort: 'high',
      fast: true,
      mode: 'agent',
      contextPct: 71,
      subagents: 3,
      workspace: 'life-os',
    })
    // maxMode true 追加、model 'default' 视为空、无 effort、fast 非串
    const max = extractComposerMeta({
      modelConfig: { modelName: 'default', maxMode: true, selectedModels: [{ parameters: [] }] },
      unifiedMode: 'chat',
      contextUsagePercent: 0,
    })
    assert.deepEqual(max, { maxMode: true, mode: 'chat' })
    // 空/畸形不崩
    assert.equal(extractComposerMeta(null), null)
    assert.equal(extractComposerMeta({}), null)
    // 已带 meta 的远程精简 composer:mergeThreadDelta 直接透传,不重算
    const passthrough = mergeThreadDelta(
      null,
      { composerId: 'c', meta: { model: 'slim' }, fullConversationHeadersOnly: [] },
      {},
    )
    assert.deepEqual(passthrough.meta, { model: 'slim' })
  })

  it('clamps model-facing thread output, keeping the tail', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ text: `msg-${i}` }))
    const byCount = clampThreadMessages(many, { maxMessages: 20 })
    assert.equal(byCount.messages.length, 20)
    assert.equal(byCount.dropped, 30)
    assert.equal(byCount.messages.at(-1).text, 'msg-49') // 永远保尾

    const heavy = [{ text: 'a'.repeat(9000) }, { text: 'b'.repeat(9000) }, { text: 'c'.repeat(100) }]
    const byChars = clampThreadMessages(heavy, { maxMessages: 20, maxChars: 10000 })
    assert.equal(byChars.messages.length, 2) // 第一条被字符预算挤掉
    assert.equal(byChars.dropped, 1)
    assert.equal(byChars.messages.at(-1).text.at(0), 'c')

    const single = clampThreadMessages([{ text: 'z'.repeat(20000) }], { maxChars: 5000 })
    assert.equal(single.messages.length, 1)
    assert.ok(single.messages[0].text.startsWith('…（前文截断）'))
    assert.ok(single.messages[0].text.endsWith('z'))
    assert.ok(single.messages[0].text.length <= 5000 + 10)

    assert.deepEqual(clampThreadMessages(null), { messages: [], dropped: 0 })
  })

  it('returns unsupported state when not native', () => {
    const res = projectCodeSessionsResult({ native: false })
    assert.equal(res.state.status, 'unsupported')
    assert.equal(res.items.length, 0)
  })

  it('wraps native sessions into ready/empty state', () => {
    const ready = projectCodeSessionsResult({
      native: true,
      sessions: [{ id: 'a', title: 't', updated_at: 5 }],
    })
    assert.equal(ready.state.status, 'ready')
    assert.equal(ready.state.availableCount, 1)
    const empty = projectCodeSessionsResult({ native: true, sessions: [] })
    assert.equal(empty.state.status, 'empty')
    const err = projectCodeSessionsResult({ native: true, error: 'db locked' })
    assert.equal(err.state.status, 'unavailable')
    assert.equal(err.state.retryable, true)
  })
})
