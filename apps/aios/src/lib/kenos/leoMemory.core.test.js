import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildLeoBondExtractPrompt,
  mergeLeoBondMemories,
  normalizeLeoBondFact,
} from './leoMemory.core.js'

describe('leoMemory', () => {
  it('normalizes bond facts with Leo关系 prefix', () => {
    assert.equal(
      normalizeLeoBondFact('喜欢被主导'),
      'Leo关系:Ken喜欢被主导',
    )
    assert.equal(
      normalizeLeoBondFact('Ken 想臣服'),
      'Leo关系:Ken 想臣服',
    )
    assert.equal(normalizeLeoBondFact('AI 说了什么'), null)
  })

  it('pins Leo关系 memories ahead of recall', () => {
    const items = [
      { text: 'Leo关系:Ken喜欢臣服' },
      { text: '用户喜欢咖啡' },
      { text: 'Leo关系:Ken雷点是公开场合' },
    ]
    const merged = mergeLeoBondMemories(items, ['用户喜欢咖啡', '别的'], 3, 4)
    assert.equal(merged[0], 'Leo关系:Ken喜欢臣服')
    assert.ok(merged.includes('Leo关系:Ken雷点是公开场合'))
    assert.ok(merged.includes('用户喜欢咖啡'))
  })

  it('build extract prompt mentions Ken/Leo', () => {
    const p = buildLeoBondExtractPrompt('我想被你带着', '过来。')
    assert.match(p, /Ken:/)
    assert.match(p, /Leo:/)
    assert.match(p, /关系事实/)
  })
})
