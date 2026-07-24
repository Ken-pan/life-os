import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LEO_VOICE,
  LEO_VOICE_STATUS_KEYS,
  adaptiveSilenceMs,
  createVoiceEndDetector,
  enterLeoQuietMode,
  exitLeoQuietMode,
  isLeoQuietModeOn,
  isUsableVoiceTranscript,
  isLeoNameOnlyCall,
  leoVoiceStatusText,
  normalizeLeoVoiceTranscript,
  prepareLeoVoiceTranscript,
  leoAsrPromptHint,
  leoMicConstraints,
  voiceRmsFromTimeDomain,
} from './leoVoice.core.js'

describe('leoVoice', () => {
  it('filters empty / punctuation / ASR junk transcripts', () => {
    assert.equal(isUsableVoiceTranscript(''), false)
    assert.equal(isUsableVoiceTranscript('   '), false)
    assert.equal(isUsableVoiceTranscript('…'), false)
    assert.equal(isUsableVoiceTranscript('。'), false)
    assert.equal(isUsableVoiceTranscript('谢谢观看'), false)
    assert.equal(isUsableVoiceTranscript('Thank you for watching'), false)
    assert.equal(isUsableVoiceTranscript('嗯嗯嗯'), false)
    assert.equal(isUsableVoiceTranscript('uh uh uh'), false)
    assert.equal(isUsableVoiceTranscript('慢一点'), true)
    assert.equal(isUsableVoiceTranscript('继续，别停。'), true)
    assert.equal(isUsableVoiceTranscript('红灯'), true)
    assert.equal(isUsableVoiceTranscript('六六大顺'), true)
    assert.equal(isUsableVoiceTranscript('Leo Leo Leo'), true)
  })

  it('maps Leo-name ASR mishear and treats hands-free name-only as wake', () => {
    assert.equal(
      normalizeLeoVoiceTranscript('六，六，六。', { leoMode: true }),
      'Leo Leo Leo',
    )
    assert.equal(normalizeLeoVoiceTranscript('溜溜溜', { leoMode: true }), 'Leo Leo Leo')
    assert.equal(normalizeLeoVoiceTranscript('六', { leoMode: true }), 'Leo')
    assert.equal(
      normalizeLeoVoiceTranscript('六，六，六。', { leoMode: false }),
      '六，六，六。',
    )
    assert.equal(isLeoNameOnlyCall('Leo Leo Leo'), true)
    assert.equal(isLeoNameOnlyCall('慢一点'), false)

    const wake = prepareLeoVoiceTranscript('六，六，六。', {
      leoMode: true,
      handsFree: true,
    })
    assert.equal(wake.ok, false)
    assert.equal(wake.reason, 'wake')
    assert.equal(wake.text, 'Leo Leo Leo')

    const typed = prepareLeoVoiceTranscript('六，六，六。', {
      leoMode: true,
      handsFree: false,
    })
    assert.equal(typed.ok, true)
    assert.equal(typed.text, 'Leo Leo Leo')

    const real = prepareLeoVoiceTranscript('慢一点', {
      leoMode: true,
      handsFree: true,
    })
    assert.equal(real.ok, true)
    assert.equal(real.text, '慢一点')

    assert.match(leoAsrPromptHint(), /Leo/)
  })

  it('ends utterance only after preroll + min speech + silence', () => {
    const d = createVoiceEndDetector({
      speechRms: 0.05,
      silenceMs: 300,
      minSpeechMs: 200,
      prerollMs: 100,
      tickMs: 100,
      fixedSilence: true,
    })
    assert.equal(d.push(0.2, 50), 'continue') // preroll
    assert.equal(d.push(0.2, 150), 'continue') // speech accumulating
    assert.equal(d.push(0.2, 250), 'continue') // still short silence path
    assert.equal(d.snapshot().ready, true)
    assert.equal(d.push(0.01, 350), 'continue') // silence 100
    assert.equal(d.push(0.01, 450), 'continue') // silence 200
    assert.equal(d.push(0.01, 550), 'end') // silence 300
  })

  it('waits longer silence after short speech; shorter after long speech', () => {
    assert.ok(adaptiveSilenceMs(400) > adaptiveSilenceMs(4000))
    assert.ok(adaptiveSilenceMs(0) >= LEO_VOICE.silenceMsFloor)
    assert.ok(adaptiveSilenceMs(99999) <= LEO_VOICE.silenceMsCeil)

    const short = createVoiceEndDetector({
      speechRms: 0.05,
      silenceMsFloor: 200,
      silenceMsCeil: 500,
      silenceAdaptHeardMs: 1000,
      minSpeechMs: 200,
      prerollMs: 0,
      tickMs: 100,
    })
    // speak 200ms then silence — need near ceil (~500)
    assert.equal(short.push(0.2, 100), 'continue')
    assert.equal(short.push(0.2, 200), 'continue')
    assert.equal(short.push(0.01, 300), 'continue')
    assert.equal(short.push(0.01, 400), 'continue')
    assert.equal(short.push(0.01, 500), 'continue')
    assert.ok(short.snapshot().needSilenceMs >= 400)
    // 再补静音直到达到自适应阈值
    let ended = false
    for (let t = 600; t <= 1200; t += 100) {
      if (short.push(0.01, t) === 'end') {
        ended = true
        break
      }
    }
    assert.equal(ended, true)

    const long = createVoiceEndDetector({
      speechRms: 0.05,
      silenceMsFloor: 200,
      silenceMsCeil: 500,
      silenceAdaptHeardMs: 500,
      minSpeechMs: 200,
      prerollMs: 0,
      tickMs: 100,
    })
    for (let t = 100; t <= 600; t += 100) {
      assert.equal(long.push(0.2, t), 'continue')
    }
    assert.ok(long.snapshot().needSilenceMs <= 250)
    assert.equal(long.push(0.01, 700), 'continue')
    assert.equal(long.push(0.01, 800), 'end')
  })

  it('ignores brief noise before min speech', () => {
    const d = createVoiceEndDetector({
      speechRms: 0.05,
      silenceMs: 200,
      minSpeechMs: 300,
      prerollMs: 0,
      tickMs: 100,
    })
    assert.equal(d.push(0.2, 100), 'continue')
    assert.equal(d.push(0.01, 200), 'continue') // heard only 100ms < min
    assert.equal(d.push(0.01, 400), 'continue')
    assert.equal(d.snapshot().ready, false)
  })

  it('maps voice states to i18n keys and renders text through translate()', () => {
    const keys = new Set(Object.values(LEO_VOICE_STATUS_KEYS))
    // 全部指向 chat.* 命名空间,单一来源,避免各处散落重复文案 key
    for (const key of keys) assert.match(key, /^chat\./)

    const translate = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key)
    assert.equal(leoVoiceStatusText('listening', translate), 'chat.leoListening')
    assert.equal(leoVoiceStatusText('ttsFailed', translate), 'chat.leoVoiceTtsFailed')
    assert.equal(leoVoiceStatusText('wakeIgnored', translate), 'chat.leoVoiceHeardName')
    assert.equal(
      leoVoiceStatusText('processing', translate, { n: 1 }),
      'chat.transcribing:{"n":1}',
    )
    // 未知状态 / 非法 translate → 安全返回空串,不抛错
    assert.equal(leoVoiceStatusText('nope', translate), '')
    assert.equal(leoVoiceStatusText('listening', null), '')
  })

  it('quiet mode: enters muted, exits by restoring the pre-enter snapshot', () => {
    // 两项默认都开着 → 进入安静模式记下 true/true,关掉两项
    const entered = enterLeoQuietMode({ leoAutoSpeak: true, leoHandsFree: true })
    assert.deepEqual(entered.snapshot, { leoAutoSpeak: true, leoHandsFree: true })
    assert.deepEqual(entered.patch, { leoAutoSpeak: false, leoHandsFree: false })
    assert.equal(isLeoQuietModeOn(entered.patch), true)

    // 退出:精确恢复,而不是无脑打开
    assert.deepEqual(exitLeoQuietMode(entered.snapshot), {
      leoAutoSpeak: true,
      leoHandsFree: true,
    })

    // 用户进入前本来就关着 autoSpeak → 退出后 autoSpeak 仍应保持关
    const partial = enterLeoQuietMode({ leoAutoSpeak: false, leoHandsFree: true })
    assert.deepEqual(partial.snapshot, { leoAutoSpeak: false, leoHandsFree: true })
    assert.deepEqual(exitLeoQuietMode(partial.snapshot), {
      leoAutoSpeak: false,
      leoHandsFree: true,
    })

    // 没有快照(比如刷新后)也要有可靠兜底:默认恢复为开
    assert.deepEqual(exitLeoQuietMode(null), { leoAutoSpeak: true, leoHandsFree: true })
    assert.deepEqual(exitLeoQuietMode(undefined), { leoAutoSpeak: true, leoHandsFree: true })

    // 判定只看两项是否同时为 false,不管是手动关的还是安静模式关的
    assert.equal(isLeoQuietModeOn({ leoAutoSpeak: false, leoHandsFree: false }), true)
    assert.equal(isLeoQuietModeOn({ leoAutoSpeak: false, leoHandsFree: true }), false)
    assert.equal(isLeoQuietModeOn({}), false)
    assert.equal(isLeoQuietModeOn(null), false)
  })

  it('computes rms and exposes mic constraints + constants', () => {
    const data = new Uint8Array([128, 140, 116, 128])
    assert.ok(voiceRmsFromTimeDomain(data) > 0)
    assert.equal(voiceRmsFromTimeDomain(null), 0)
    const c = leoMicConstraints()
    assert.equal(c.audio.echoCancellation, true)
    assert.ok(LEO_VOICE.postTtsDelayMs >= 1000)
    assert.ok(LEO_VOICE.silenceMs >= 1500)
    assert.ok(LEO_VOICE.silenceMsFloor < LEO_VOICE.silenceMsCeil)
    assert.ok(LEO_VOICE.minSpeechMs >= 400)
    assert.ok(LEO_VOICE.prerollMs >= 600)
    assert.match(leoAsrPromptHint(), /do not translate/i)
  })
})
