import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  looksLikeLeoSpeakingSuggestion,
  leoComposerPreferEnglish,
  leoFallbackSuggestions,
  leoHomeOpeners,
  textLooksMostlyEnglish,
} from './leoSuggest.core.js'

describe('looksLikeLeoSpeakingSuggestion', () => {
  it('rejects Leo speaking / third-person Ken lines', () => {
    assert.equal(looksLikeLeoSpeakingSuggestion('嘿 Ken，过来靠着我'), true)
    assert.equal(looksLikeLeoSpeakingSuggestion('肯儿，听着'), true)
    assert.equal(looksLikeLeoSpeakingSuggestion('刚练完，身上还热'), true)
    assert.equal(looksLikeLeoSpeakingSuggestion('我是 Leo'), true)
    assert.equal(looksLikeLeoSpeakingSuggestion('Hey Ken. Just finished — still warm.'), true)
    assert.equal(looksLikeLeoSpeakingSuggestion('Come here. Phone down.'), true)
    assert.equal(
      looksLikeLeoSpeakingSuggestion(
        '今天练完了？过来，我帮你拉伸一下肩膀。别装没事，刚才那组我看着呢。你额头那层汗挺好看的。',
      ),
      true,
    )
  })

  it('keeps Ken→Leo user lines including pace controls', () => {
    assert.equal(looksLikeLeoSpeakingSuggestion('今晚想听你说色的'), false)
    assert.equal(looksLikeLeoSpeakingSuggestion('继续，别停。'), false)
    assert.equal(looksLikeLeoSpeakingSuggestion('慢一点。'), false)
    assert.equal(looksLikeLeoSpeakingSuggestion('先抱一下，别急。'), false)
    assert.equal(looksLikeLeoSpeakingSuggestion('红灯'), false)
    assert.equal(looksLikeLeoSpeakingSuggestion('Come closer.'), false)
    assert.equal(looksLikeLeoSpeakingSuggestion('Tonight I follow your lead.'), false)
    assert.equal(looksLikeLeoSpeakingSuggestion('Keep going.'), false)
  })

  it('provides Ken-POV fallbacks; explicit prefers control lines', () => {
    assert.deepEqual(leoFallbackSuggestions(false).slice(0, 1), ['再说具体点。'])
    const explicit = leoFallbackSuggestions(false, { intensity: 'explicit' })
    assert.equal(explicit.length, 3)
    assert.ok(explicit.some((s) => /慢一点|继续|抱/.test(s)))
    assert.equal(leoFallbackSuggestions(true, { intensity: 'explicit' }).length, 3)
  })

  it('prefers English composer language when Leo speaks English', () => {
    assert.equal(textLooksMostlyEnglish('Come here. Stay with me.'), true)
    assert.equal(textLooksMostlyEnglish('今晚想听你说话'), false)
    assert.equal(leoComposerPreferEnglish({ locale: 'zh' }, ''), true)
    assert.equal(
      leoComposerPreferEnglish(
        { locale: 'zh' },
        'Hey Ken. Just finished — still warm. Tonight… chat a bit?',
      ),
      true,
    )
    assert.equal(
      leoComposerPreferEnglish(
        { locale: 'zh' },
        '今天练完了？过来，我帮你拉伸一下肩膀。别装没事，刚才那组我看着呢。你额头那层汗挺好看的。再喝口水休息。',
      ),
      false,
    )
  })
})

describe('leoHomeOpeners', () => {
  it('returns 2-4 Ken-POV chips consistent with the Composer quick openers', () => {
    const chips = leoHomeOpeners({ locale: 'zh', leoIntensity: 'flirty' })
    assert.ok(chips.length >= 2 && chips.length <= 4)
    for (const chip of chips) {
      assert.equal(typeof chip.id, 'string')
      assert.equal(typeof chip.text, 'string')
      assert.ok(chip.text.length > 0)
      assert.equal(looksLikeLeoSpeakingSuggestion(chip.text), false)
    }
  })

  it('flips with intensity/locale like the composer openers do', () => {
    const flirtyZh = leoHomeOpeners({ locale: 'zh', leoIntensity: 'flirty' })
    const explicitZh = leoHomeOpeners({ locale: 'zh', leoIntensity: 'explicit' })
    assert.notDeepEqual(flirtyZh, explicitZh)
    const flirtyEn = leoHomeOpeners({ locale: 'en', leoIntensity: 'flirty' })
    assert.ok(flirtyEn.every((c) => /[A-Za-z]/.test(c.text)))
  })
})
