import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LEO_AVATAR_SRC,
  __resetLeoAvatarPreloadCacheForTest,
  inferLeoExpression,
  leoAvatarSrc,
  leoImageDraft,
  looksLikeLeoImageAsk,
  normalizeLeoExpression,
  preloadLeoAvatars,
  stabilizeLeoExpression,
  stripLeoAvatarNoise,
} from './leoAvatar.core.js'

describe('leoAvatar.core', () => {
  it('normalizes unknown expression to neutral', () => {
    assert.equal(normalizeLeoExpression('nope'), 'neutral')
    assert.equal(normalizeLeoExpression('smile'), 'smile')
    assert.equal(normalizeLeoExpression('serious'), 'serious')
    assert.equal(normalizeLeoExpression('soft'), 'soft')
    assert.equal(normalizeLeoExpression('thinking'), 'thinking')
  })

  it('maps expression to static /leo paths', () => {
    assert.equal(leoAvatarSrc({ expression: 'smile' }), '/leo/smile.png')
    assert.equal(leoAvatarSrc({ expression: 'serious' }), '/leo/serious.png')
    assert.equal(leoAvatarSrc({ expression: 'soft' }), '/leo/soft.png')
    assert.equal(leoAvatarSrc({ expression: 'thinking' }), '/leo/thinking.png')
    assert.equal(leoAvatarSrc(), LEO_AVATAR_SRC.neutral)
    assert.equal(leoAvatarSrc({ expression: null }), '/leo/neutral.png')
  })

  it('infers smile / serious / soft / thinking from assistant text (zh+en)', () => {
    assert.equal(inferLeoExpression('Come here babe 😉'), 'smile')
    assert.equal(inferLeoExpression('Turn around. Look at me.'), 'serious')
    assert.equal(inferLeoExpression('转过去。看着我。听话。'), 'serious')
    assert.equal(inferLeoExpression('红灯。先抱着你，喘口气。'), 'soft')
    assert.equal(inferLeoExpression("Okay. Stop. You're safe."), 'soft')
    assert.equal(inferLeoExpression('*低语* 放松……'), 'soft')
    assert.equal(inferLeoExpression('Hmm. Let me think.'), 'thinking')
    assert.equal(inferLeoExpression('Hey. How was practice?'), 'neutral')
  })

  it('strips think/code noise before inference', () => {
    assert.equal(
      stripLeoAvatarNoise('<think>plan</think>\n哈哈 想你了').includes('哈哈'),
      true,
    )
    assert.equal(
      inferLeoExpression('<think>plan</think>\n哈哈 想你了'),
      'smile',
    )
  })

  it('stabilizes expression during streaming (upgrade, no flicker down)', () => {
    assert.equal(
      stabilizeLeoExpression('smile', 'neutral', { streaming: true }),
      'smile',
    )
    assert.equal(
      stabilizeLeoExpression('smile', 'serious', { streaming: true }),
      'serious',
    )
    assert.equal(
      stabilizeLeoExpression('serious', 'soft', { streaming: true }),
      'soft',
    )
    assert.equal(
      stabilizeLeoExpression('smile', 'neutral', { streaming: false }),
      'neutral',
    )
  })

  it('preloads all expression srcs exactly once (dedup across calls)', () => {
    __resetLeoAvatarPreloadCacheForTest()
    const requested = []
    const imageFactory = () => {
      const img = {}
      Object.defineProperty(img, 'src', {
        set(v) {
          requested.push(v)
        },
      })
      return img
    }
    preloadLeoAvatars({ imageFactory })
    assert.deepEqual(new Set(requested), new Set(Object.values(LEO_AVATAR_SRC)))
    assert.equal(requested.length, Object.keys(LEO_AVATAR_SRC).length)

    // 再次调用(如表情切换触发的重复预热)不应重复请求同一 src
    preloadLeoAvatars({ imageFactory })
    assert.equal(requested.length, Object.keys(LEO_AVATAR_SRC).length)
  })

  it('preloadLeoAvatars is a safe no-op without an Image constructor', () => {
    __resetLeoAvatarPreloadCacheForTest()
    assert.doesNotThrow(() => preloadLeoAvatars({ imageFactory: () => null }))
  })

  it('builds Ken→Leo image drafts with handbook trigger phrases', () => {
    assert.match(leoImageDraft({ locale: 'zh' }), /画一张/)
    assert.match(leoImageDraft({ locale: 'en' }), /Draw this moment/)
    assert.match(leoImageDraft({ locale: 'zh', hasDraft: true }), /再画一张/)
    assert.match(leoImageDraft({ locale: 'en', hasDraft: true }), /Also draw/)
    assert.equal(looksLikeLeoImageAsk(leoImageDraft({ locale: 'zh' })), true)
    assert.equal(looksLikeLeoImageAsk(leoImageDraft({ locale: 'en' })), true)
    assert.equal(looksLikeLeoImageAsk('想你了'), false)
  })
})
