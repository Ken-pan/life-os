import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildKimiUpstreamBody,
  handleAiChat,
  isAllowedOrigin,
  mapToKimiModel,
} from './aiChat.mjs'

describe('mapToKimiModel', () => {
  it('maps UI models', () => {
    assert.equal(mapToKimiModel('llm-fast'), 'kimi-k2.5')
    assert.equal(mapToKimiModel('llm-quality'), 'kimi-k2.6')
    assert.equal(mapToKimiModel('kimi-k2.6'), 'kimi-k2.6')
  })
  it('rejects unknown', () => {
    assert.equal(mapToKimiModel('gpt-4'), null)
    assert.equal(mapToKimiModel(''), null)
  })
})

describe('isAllowedOrigin', () => {
  it('allows empty and known hosts', () => {
    assert.equal(isAllowedOrigin(''), true)
    assert.equal(isAllowedOrigin('https://aios-kenos.netlify.app'), true)
    assert.equal(isAllowedOrigin('http://localhost:5197'), true)
  })
  it('rejects unknown hosts', () => {
    assert.equal(isAllowedOrigin('https://evil.example'), false)
  })
})

describe('buildKimiUpstreamBody', () => {
  it('builds a clean Moonshot body', () => {
    const built = buildKimiUpstreamBody({
      model: 'llm-fast',
      messages: [
        { role: 'system', content: 'hi' },
        { role: 'user', content: 'hello' },
      ],
      temperature: 0.5,
      max_tokens: 100,
      thinking: true,
      tools: [{ type: 'function', function: { name: 'get_time' } }],
    })
    assert.equal(built.ok, true)
    assert.equal(built.body.model, 'kimi-k2.5')
    assert.equal(built.body.stream, true)
    assert.equal(built.body.temperature, 0.6)
    assert.deepEqual(built.body.thinking, { type: 'enabled' })
    assert.equal(built.body.tools.length, 1)
    assert.equal(built.body.chat_template_kwargs, undefined)
    assert.equal(built.body.repetition_penalty, undefined)
  })

  it('rejects vision parts', () => {
    const built = buildKimiUpstreamBody({
      model: 'llm-fast',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'what' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,xx' },
            },
          ],
        },
      ],
    })
    assert.equal(built.ok, false)
    assert.equal(built.error, 'vision_unsupported')
  })

  it('rejects bad model', () => {
    const built = buildKimiUpstreamBody({
      model: 'nope',
      messages: [{ role: 'user', content: 'x' }],
    })
    assert.equal(built.ok, false)
    assert.equal(built.error, 'bad_model')
  })
})

describe('handleAiChat', () => {
  it('returns 501 without key', async () => {
    const result = await handleAiChat(undefined, {
      model: 'llm-fast',
      messages: [{ role: 'user', content: 'hi' }],
    })
    assert.equal(result.kind, 'json')
    assert.equal(result.status, 501)
    assert.equal(result.body.error, 'not_configured')
  })

  it('returns 403 for forbidden origin', async () => {
    const result = await handleAiChat(
      'sk-test',
      { model: 'llm-fast', messages: [{ role: 'user', content: 'hi' }] },
      { origin: 'https://evil.example' },
    )
    assert.equal(result.kind, 'json')
    assert.equal(result.status, 403)
  })

  it('streams upstream SSE', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n'
    const result = await handleAiChat(
      'sk-test',
      { model: 'llm-quality', messages: [{ role: 'user', content: 'hi' }] },
      {
        origin: 'https://aios-kenos.netlify.app',
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(String(init.body))
          assert.equal(body.model, 'kimi-k2.6')
          assert.equal(body.stream, true)
          return new Response(sse, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        },
      },
    )
    assert.equal(result.kind, 'stream')
    assert.equal(result.status, 200)
    const text = await new Response(result.body).text()
    assert.match(text, /"content":"ok"/)
  })
})
