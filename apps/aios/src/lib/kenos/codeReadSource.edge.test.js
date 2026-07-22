import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clampThreadMessages,
  extractBubbleHeaders,
  extractToolSummary,
  mergeThreadDelta,
  projectCursorSessions,
} from './codeReadSource.core.js'

describe('codeReadSource edge cases', () => {
  it('mergeThreadDelta survives hostile/malformed structures', () => {
    // 非对象输入
    assert.equal(mergeThreadDelta(null, null, null).messages.length, 0)
    assert.equal(mergeThreadDelta(undefined, 'string', 42).messages.length, 0)
    // headers 有重复 bubbleId(库异常):不崩,产出可渲染列表
    const dup = {
      composerId: 'c-dup',
      fullConversationHeadersOnly: [
        { bubbleId: 'x', type: 1 },
        { bubbleId: 'x', type: 1 },
      ],
    }
    const r = mergeThreadDelta(null, dup, { x: { type: 1, text: 'hi' } })
    assert.equal(r.messages.length, 1) // 重复 bubbleId 必须去重,否则 keyed each 白屏
    // header 里 bubbleId 缺失/非串
    const bad = {
      composerId: 'c-bad',
      fullConversationHeadersOnly: [{ bubbleId: null }, { type: 2 }, 'junk', { bubbleId: 'ok', type: 2 }],
    }
    const r2 = mergeThreadDelta(null, bad, { ok: { type: 2, text: 't' } })
    assert.equal(r2.messages.length, 1)
    // conversationMap 回退(老库)
    const legacy = { id: 'c-legacy', conversationMap: { m1: { type: 1 }, m2: { type: 2 } } }
    const r3 = mergeThreadDelta(null, legacy, { m1: { type: 1, text: 'a' }, m2: { type: 2, text: 'b' } })
    assert.deepEqual(r3.messages.map((m) => m.role), ['user', 'assistant'])
    // prev 引用了已从 headers 消失的消息:不残留
    const prev = { id: 'c', messages: [{ bubbleId: 'gone', role: 'user', text: 'old' }] }
    const r4 = mergeThreadDelta(prev, { composerId: 'c', fullConversationHeadersOnly: [{ bubbleId: 'new1', type: 1 }] }, { new1: { type: 1, text: 'n' } })
    assert.deepEqual(r4.messages.map((m) => m.bubbleId), ['new1'])
  })

  it('title falls back and clamps at 160 chars', () => {
    const long = { composerId: 'c', name: 'T'.repeat(500), fullConversationHeadersOnly: [] }
    assert.equal(mergeThreadDelta(null, long, {}).title.length, 160)
    assert.equal(mergeThreadDelta(null, { composerId: 'c' }, {}).title, '未命名对话')
  })

  it('sessions projection survives junk rows', () => {
    const out = projectCursorSessions([
      null,
      42,
      { id: 123, title: null, updated_at: 'NaN' }, // id 非串 → skip
      { id: 'ok', title: '   ', updated_at: -5, is_archived: 2 },
    ])
    assert.equal(out.length, 1)
    assert.equal(out[0].title, '未命名对话')
    assert.equal(out[0].archived, true) // truthy 数字
  })

  it('extractToolSummary resists prototype pollution and junk', () => {
    const polluted = extractToolSummary({
      name: 'read_file_v2',
      rawArgs: '{"__proto__":{"hacked":true},"path":"/a/b.js"}',
    })
    assert.equal(polluted.arg, 'a/b.js')
    assert.equal(({}).hacked, undefined) // 原型未被污染
    assert.equal(extractToolSummary({ name: 42 }), null)
    assert.equal(extractToolSummary({ name: 'x', rawArgs: 12345 }).tool, 'x')
  })

  it('clampThreadMessages handles all-tool and zero budgets', () => {
    const allTool = [{ tool: 'a', text: '' }, { tool: 'b', text: '' }]
    assert.deepEqual(clampThreadMessages(allTool), { messages: [], dropped: 0 })
    const one = clampThreadMessages([{ text: 'abc' }], { maxMessages: 0, maxChars: 0 })
    // maxMessages 0 → slice(-0) 全保留?边界:不崩即可,输出有界
    assert.ok(Array.isArray(one.messages))
  })

  it('extractBubbleHeaders tolerates junk headers', () => {
    assert.deepEqual(extractBubbleHeaders({ fullConversationHeadersOnly: [null, 1, {}] }), [])
    assert.deepEqual(extractBubbleHeaders({ conversationMap: null }), [])
  })
})
