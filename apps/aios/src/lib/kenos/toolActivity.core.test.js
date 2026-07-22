import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  countSearchHits,
  summarizeToolActivity,
  hostOfUrl,
} from './toolActivity.core.js'

describe('countSearchHits', () => {
  it('reads labeled counts and arrays', () => {
    assert.equal(countSearchHits('Found 8 results'), 8)
    assert.equal(countSearchHits(JSON.stringify([{ a: 1 }, { a: 2 }])), 2)
    assert.equal(countSearchHits('错误: down'), null)
  })
})

describe('summarizeToolActivity', () => {
  it('summarizes web search in zh', () => {
    const s = summarizeToolActivity(
      {
        name: 'web_search',
        arguments: JSON.stringify({ query: 'kenos dock' }),
        result: '8 results',
        running: false,
      },
      { locale: 'zh' },
    )
    assert.match(s.title, /搜索了 8/)
    assert.equal(s.detail, 'kenos dock')
    assert.equal(s.failed, false)
  })

  it('marks running generate_image', () => {
    const s = summarizeToolActivity(
      { name: 'generate_image', running: true, arguments: '{}' },
      { locale: 'zh' },
    )
    assert.match(s.title, /正在生成/)
    assert.equal(s.running, true)
  })

  it('extracts host', () => {
    assert.equal(hostOfUrl('https://www.example.com/a'), 'example.com')
  })
})
