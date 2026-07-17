import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWireMessages,
  isBuildCodeAsk,
  PARALLEL_SAFE_TOOLS,
} from './chat-tool-loop.core.js'

test('isBuildCodeAsk blocks code/build asks without image intent', () => {
  assert.equal(isBuildCodeAsk('写一个贪吃蛇小游戏'), true)
  assert.equal(isBuildCodeAsk('用 html 做个待办网页'), true)
  assert.equal(isBuildCodeAsk('画一张贪吃蛇的插画'), false)
  assert.equal(isBuildCodeAsk('生成图片：计算器海报'), false)
  assert.equal(isBuildCodeAsk(''), false)
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
            { id: 'c1', name: 'calculate', arguments: '{"expression":"1+1"}', result: '1+1 = 2' },
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

test('parallel-safe tool set includes calculate', () => {
  assert.ok(PARALLEL_SAFE_TOOLS.has('calculate'))
  assert.ok(PARALLEL_SAFE_TOOLS.has('get_time'))
})
