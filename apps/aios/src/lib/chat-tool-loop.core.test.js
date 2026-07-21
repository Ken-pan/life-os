import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWireMessages,
  classifyToolRawResult,
  isBuildCodeAsk,
  normalizeToolResult,
  PARALLEL_SAFE_TOOLS,
  settleAbortedToolCalls,
  shouldAutoRetryTool,
  wireMsgSize,
} from './chat-tool-loop.core.js'

test('isBuildCodeAsk blocks code/build asks without image intent', () => {
  assert.equal(isBuildCodeAsk('写一个贪吃蛇小游戏'), true)
  assert.equal(isBuildCodeAsk('用 html 做个待办网页'), true)
  assert.equal(isBuildCodeAsk('画一张贪吃蛇的插画'), false)
  assert.equal(isBuildCodeAsk('生成图片：计算器海报'), false)
  assert.equal(isBuildCodeAsk('写一个角色扮演文字游戏'), true)
  assert.equal(isBuildCodeAsk('画一张角色立绘'), false)
  assert.equal(isBuildCodeAsk(''), false)
})

test('wireMsgSize counts tool arguments and image urls', () => {
  const withTools = wireMsgSize({
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        function: {
          name: 'generate_image',
          arguments: '{"prompt":"' + 'a'.repeat(1000) + '"}',
        },
      },
    ],
  })
  assert.ok(withTools > 1000)
  const withImage = wireMsgSize({
    role: 'user',
    content: [
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,' + 'x'.repeat(80_000) },
      },
      { type: 'text', text: 'hi' },
    ],
  })
  assert.ok(withImage <= 50_000 + 50 + 10)
  assert.ok(withImage > 40_000)
})

test('settleAbortedToolCalls clears running shimmer state', () => {
  const calls = [
    { id: 'a', name: 'web_search', running: true },
    { id: 'b', name: 'calculate', running: false, result: '1+1 = 2' },
  ]
  settleAbortedToolCalls(calls)
  assert.equal(calls[0].running, false)
  assert.match(String(calls[0].result), /停止|用户/)
  assert.equal(calls[1].result, '1+1 = 2')
})

test('buildWireMessages replays tool_calls then tool results in order', () => {
  const wire = buildWireMessages(
    {
      messages: [
        { role: 'user', content: '算一下' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'c1',
              name: 'calculate',
              arguments: '{"expression":"1+1"}',
              result: '1+1 = 2',
            },
          ],
        },
        { role: 'assistant', content: '答案是 2' },
      ],
    },
    'sys',
  )
  assert.equal(wire[0].role, 'system')
  assert.equal(wire[1].role, 'user')
  assert.equal(wire[2].role, 'assistant')
  assert.equal(wire[2].tool_calls[0].function.name, 'calculate')
  assert.equal(wire[3].role, 'tool')
  assert.equal(wire[3].tool_call_id, 'c1')
  assert.equal(wire[4].content, '答案是 2')
})

test('buildWireMessages always keeps the last user message under tight budget', () => {
  const huge = 'x'.repeat(5000)
  const wire = buildWireMessages(
    {
      messages: [
        { role: 'user', content: 'old' },
        { role: 'assistant', content: huge },
        { role: 'user', content: '最新问题必须保留' },
        { role: 'assistant', content: huge },
      ],
    },
    'sys',
    { charBudget: 200 },
  )
  const users = wire.filter((m) => m.role === 'user')
  assert.ok(users.some((m) => m.content === '最新问题必须保留'))
  assert.equal(wire[0].content, 'sys')
})

test('parallel-safe tool set includes calculate and Life OS reads', () => {
  assert.ok(PARALLEL_SAFE_TOOLS.has('calculate'))
  assert.ok(PARALLEL_SAFE_TOOLS.has('get_time'))
  assert.ok(PARALLEL_SAFE_TOOLS.has('life_os_today'))
  assert.ok(PARALLEL_SAFE_TOOLS.has('finance_summary'))
  assert.ok(PARALLEL_SAFE_TOOLS.has('planner_tasks'))
  assert.ok(PARALLEL_SAFE_TOOLS.has('search_memory'))
  assert.ok(PARALLEL_SAFE_TOOLS.has('focus_status'))
  assert.equal(PARALLEL_SAFE_TOOLS.has('planner_add_task'), false)
  assert.equal(PARALLEL_SAFE_TOOLS.has('save_memory'), false)
  assert.equal(PARALLEL_SAFE_TOOLS.has('start_focus'), false)
  assert.equal(PARALLEL_SAFE_TOOLS.has('compose_library_note'), false)
})

test('normalizeToolResult structures empty and policy failures', () => {
  assert.equal(classifyToolRawResult(''), 'empty')
  assert.equal(classifyToolRawResult('没有找到相关记忆。'), 'empty')
  const empty = normalizeToolResult('search_memory', '没有找到相关记忆。')
  assert.match(empty, /error_type: empty/)
  assert.match(empty, /不要编造/)

  const policy = normalizeToolResult(
    'planner_add_task',
    '[写入未开放] 当前环境生产写入已关闭（只读/演示，fail-closed）。',
  )
  assert.match(policy, /error_type: policy/)
  assert.match(policy, /不要假装写入已成功/)

  const ok = normalizeToolResult('calculate', '1+1 = 2')
  assert.equal(ok, '1+1 = 2')
  assert.equal(normalizeToolResult('x', empty), empty) // idempotent
})

test('normalizeToolResult marks timeouts as transient and retryable once', () => {
  const raw = '错误:browser_search 超时(30s)'
  assert.equal(classifyToolRawResult(raw), 'transient')
  const norm = normalizeToolResult('browser_search', raw)
  assert.match(norm, /error_type: transient/)
  assert.equal(shouldAutoRetryTool('browser_search', norm, 0), true)
  assert.equal(shouldAutoRetryTool('browser_search', norm, 1), false)
  assert.equal(shouldAutoRetryTool('planner_add_task', norm, 0), false)
})

test('buildWireMessages normalizes missing tool results on replay', () => {
  const wire = buildWireMessages(
    {
      messages: [
        { role: 'user', content: '查笔记' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 't1',
              name: 'search_notes',
              arguments: '{}',
              result: undefined,
            },
          ],
        },
      ],
    },
    'sys',
  )
  const toolMsg = wire.find((m) => m.role === 'tool')
  assert.match(toolMsg.content, /error_type: empty/)
})
