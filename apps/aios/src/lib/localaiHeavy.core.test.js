import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isHeavyLocalModel } from './localaiHeavy.core.js'

describe('isHeavyLocalModel', () => {
  it('flags Ask / VLM / image models', () => {
    assert.equal(isHeavyLocalModel('llm-fast'), true)
    assert.equal(isHeavyLocalModel('llm-quality'), true)
    assert.equal(isHeavyLocalModel('vlm-fast'), true)
    assert.equal(isHeavyLocalModel('image-fast'), true)
  })

  it('leaves tiny / embeddings / tts off the heavy lane', () => {
    assert.equal(isHeavyLocalModel('llm-tiny'), false)
    assert.equal(isHeavyLocalModel('embeddings'), false)
    assert.equal(isHeavyLocalModel(''), false)
  })
})
