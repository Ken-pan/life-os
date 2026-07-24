/**
 * Leo 对讲 / 免键盘语音 — 对齐陪伴产品常见语音状态机参数。
 * 纯逻辑,无 DOM;Composer 负责 MediaRecorder 接线。
 *
 * 行业对照(ST / Candy / 角色陪伴):
 * - VAD: preroll 抗扬声器尾音 + 最短语音 + 静音收尾
 * - ASR: vocabulary bias + 角色名误听纠正
 * - 对讲: 仅喊名字 = wake,不进气泡;有内容才直发
 */

export const LEO_VOICE = Object.freeze({
  /**
   * 断句静音(自适应中点)。短句想一想再继续 → 等更久;
   * 已说较长一段 → 停顿即发,少拖尾。
   */
  silenceMs: 1800,
  /** 短语音后的收尾静音上限(防句中思考被切断) */
  silenceMsCeil: 2400,
  /** 长语音后的收尾静音下限(说完别干等) */
  silenceMsFloor: 1200,
  /** heardMs 到达此值时静音阈值收到 floor */
  silenceAdaptHeardMs: 3600,
  /** RMS 阈值:略抬高,抑制风扇/外放尾音 */
  speechRms: 0.055,
  /** 累计有效语音最短时长,避免气声误触 */
  minSpeechMs: 450,
  /** 开麦前忽略电平(麦克风稳定 + 扬声器尾音) */
  prerollMs: 700,
  /** TTS 自然结束后多久再自动开麦(略加长,少吃自己的尾音) */
  postTtsDelayMs: 1200,
  /** 空转写 / wake-only 后重听延迟 */
  retryListenMs: 500,
  /** 单次录音上限 */
  maxRecordMs: 45_000,
  /** 过短 blob 丢弃 */
  minBlobBytes: 1600,
})

/**
 * 按已听时长取自适应收尾静音。
 * @param {number} heardMs
 * @param {{
 *   silenceMs?: number,
 *   silenceMsFloor?: number,
 *   silenceMsCeil?: number,
 *   silenceAdaptHeardMs?: number,
 * } | null | undefined} [opts]
 */
export function adaptiveSilenceMs(heardMs, opts = {}) {
  const floor = opts?.silenceMsFloor ?? LEO_VOICE.silenceMsFloor
  const ceil = opts?.silenceMsCeil ?? LEO_VOICE.silenceMsCeil
  const adaptAt = opts?.silenceAdaptHeardMs ?? LEO_VOICE.silenceAdaptHeardMs
  const lo = Math.min(floor, ceil)
  const hi = Math.max(floor, ceil)
  const t = Math.min(1, Math.max(0, Number(heardMs) || 0) / Math.max(1, adaptAt))
  // 短句 → hi;长句 → lo
  return Math.round(hi - t * (hi - lo))
}

/**
 * @param {unknown} text
 * @returns {string}
 */
export function voiceTranscriptCore(text) {
  return String(text || '')
    .trim()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

/**
 * @param {unknown} text
 * @returns {boolean}
 */
export function isUsableVoiceTranscript(text) {
  const raw = typeof text === 'string' ? text.trim() : ''
  if (!raw) return false
  const core = voiceTranscriptCore(raw)
  if (core.length < 1) return false
  // 静音/背景乐常见 ASR 幻觉
  if (
    /^(谢谢观看|字幕by|请不吝点赞|thank you for watching|thanks for watching|music|\[music\]|♪+|…+|\.+)$/i.test(
      raw,
    )
  ) {
    return false
  }
  // 静音幻觉:同一汉字连打 ≥3。「六/溜/刘」留给 Leo 名纠错后再判。
  if (
    /^([\u4e00-\u9fff])\1{2,}$/u.test(core) &&
    !/[六溜刘]/.test(core[0] || '')
  ) {
    return false
  }
  // 拉丁单音节空转写（uh uh uh / hmm hmm）
  if (/^([a-z])\1{2,}$/i.test(core) || /^(uh|um|hmm|ah|oh)(\1)+$/i.test(core)) {
    return false
  }
  return true
}

/**
 * 对讲里只喊角色名(Leo / 六六六 纠正后) → 当作 wake,不进气泡。
 * @param {unknown} text
 */
export function isLeoNameOnlyCall(text) {
  const core = voiceTranscriptCore(text).toLowerCase()
  if (!core) return false
  // Leo / leo 重复 1–6 次
  if (/^(leo){1,6}$/i.test(core)) return true
  // 罕见:纯「六」一次(纠错前单字)
  if (core === '六' || core === '溜' || core === '刘') return true
  return false
}

/**
 * Leo 模式下 ASR 常见误听纠正。
 * 「Leo」≈「六」(liù) / 偶发「溜」「刘」。
 * @param {unknown} text
 * @param {{ leoMode?: boolean } | null | undefined} [opts]
 * @returns {string}
 */
export function normalizeLeoVoiceTranscript(text, opts = {}) {
  const raw = typeof text === 'string' ? text.trim() : ''
  if (!raw || !opts?.leoMode) return raw
  const core = voiceTranscriptCore(raw)

  // 纯「六/溜/刘」重复(含单次) → Leo
  const liuRun = core.match(/^([六溜刘])\1*$/u)
  if (liuRun) {
    const n = Math.max(1, [...core].length)
    return Array.from({ length: n }, () => 'Leo').join(' ')
  }
  // 里奥 / 李奥 重复
  if (/^(里奥|李奥)+$/u.test(core)) {
    const n = Math.max(1, Math.floor(core.length / 2))
    return Array.from({ length: n }, () => 'Leo').join(' ')
  }
  // 英文粘连 leoleoleo
  const leoGlue = core.match(/^(leo){2,6}$/i)
  if (leoGlue) {
    const n = Math.floor(core.length / 3)
    return Array.from({ length: n }, () => 'Leo').join(' ')
  }
  return raw
}

/**
 * 统一转写后处理:纠错 → 可用性 → 对讲 wake 分流。
 * @param {unknown} text
 * @param {{ leoMode?: boolean, handsFree?: boolean } | null | undefined} [opts]
 * @returns {{
 *   ok: boolean,
 *   text: string,
 *   reason?: 'empty' | 'junk' | 'wake'
 * }}
 */
export function prepareLeoVoiceTranscript(text, opts = {}) {
  const leoMode = Boolean(opts?.leoMode)
  const handsFree = Boolean(opts?.handsFree)
  const normalized = normalizeLeoVoiceTranscript(text, { leoMode })
  if (!isUsableVoiceTranscript(normalized)) {
    return { ok: false, text: '', reason: 'junk' }
  }
  // 对讲:只喊名字不进气泡(行业 wake-word,避免「Leo Leo Leo」刷屏)
  if (handsFree && leoMode && isLeoNameOnlyCall(normalized)) {
    return { ok: false, text: normalized, reason: 'wake' }
  }
  return { ok: true, text: normalized }
}

/** 转写 vocabulary bias（Whisper/Qwen transcriptions 的 prompt 字段） */
export function leoAsrPromptHint() {
  return (
    'Leo Leo Leo. Ken. Transcribe in the spoken language only; do not translate. ' +
    '红灯. 绿灯. 黄灯. slow down. keep going. stop. aftercare. Come closer. Hold me.'
  )
}

/**
 * @param {Uint8Array} timeDomainData Analyser getByteTimeDomainData
 * @returns {number} 0..~1
 */
export function voiceRmsFromTimeDomain(timeDomainData) {
  if (!timeDomainData?.length) return 0
  let sum = 0
  for (let i = 0; i < timeDomainData.length; i++) {
    const v = (timeDomainData[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / timeDomainData.length)
}

/**
 * @param {{
 *   speechRms?: number,
 *   silenceMs?: number,
 *   silenceMsFloor?: number,
 *   silenceMsCeil?: number,
 *   silenceAdaptHeardMs?: number,
 *   minSpeechMs?: number,
 *   prerollMs?: number,
 *   tickMs?: number,
 *   fixedSilence?: boolean,
 * }} [opts]
 * @returns {{
 *   push: (rms: number, elapsedMs: number) => 'continue' | 'end',
 *   reset: () => void,
 *   snapshot: () => {
 *     heardMs: number,
 *     silentMs: number,
 *     ready: boolean,
 *     needSilenceMs: number,
 *   },
 * }}
 */
export function createVoiceEndDetector(opts = {}) {
  const speechRms = opts.speechRms ?? LEO_VOICE.speechRms
  const silenceMs = opts.silenceMs ?? LEO_VOICE.silenceMs
  const minSpeechMs = opts.minSpeechMs ?? LEO_VOICE.minSpeechMs
  const prerollMs = opts.prerollMs ?? LEO_VOICE.prerollMs
  const tickMs = opts.tickMs ?? 100
  const fixedSilence = Boolean(opts.fixedSilence)

  let heardMs = 0
  let silentMs = 0

  const needSilence = () =>
    fixedSilence
      ? silenceMs
      : adaptiveSilenceMs(heardMs, {
          silenceMs,
          silenceMsFloor: opts.silenceMsFloor,
          silenceMsCeil: opts.silenceMsCeil,
          silenceAdaptHeardMs: opts.silenceAdaptHeardMs,
        })

  return {
    reset() {
      heardMs = 0
      silentMs = 0
    },
    snapshot() {
      return {
        heardMs,
        silentMs,
        ready: heardMs >= minSpeechMs,
        needSilenceMs: needSilence(),
      }
    },
    push(rms, elapsedMs) {
      if (elapsedMs < prerollMs) return 'continue'
      if (rms >= speechRms) {
        heardMs += tickMs
        silentMs = 0
        return 'continue'
      }
      if (heardMs < minSpeechMs) return 'continue'
      silentMs += tickMs
      if (silentMs >= needSilence()) return 'end'
      return 'continue'
    },
  }
}

/**
 * 对讲 / 朗读状态 → i18n key 的单一来源。
 * Composer 对讲条、Message 朗读按钮各自持有状态机,但文案不该各写一份 ——
 * 这里只做集中映射,实际文案仍在 i18n messages(`chat.*`)里维护。
 */
export const LEO_VOICE_STATUS_KEYS = Object.freeze({
  listening: 'chat.leoListening',
  processing: 'chat.transcribing',
  speaking: 'chat.speaking',
  speechEnded: 'chat.speechEnded',
  micDenied: 'chat.leoVoiceMicDenied',
  unclear: 'chat.leoVoiceUnclear',
  tooShort: 'chat.leoVoiceTooShort',
  wakeIgnored: 'chat.leoVoiceHeardName',
  ttsFailed: 'chat.leoVoiceTtsFailed',
})

/**
 * @param {keyof typeof LEO_VOICE_STATUS_KEYS} state
 * @param {(key: string, vars?: Record<string, unknown>) => string} translate 项目里的 t()
 * @param {Record<string, unknown>} [vars]
 * @returns {string}
 */
export function leoVoiceStatusText(state, translate, vars) {
  const key = LEO_VOICE_STATUS_KEYS[state]
  if (!key || typeof translate !== 'function') return ''
  return translate(key, vars)
}

/**
 * 「安静模式」(公共场合一键):同时关闭 Leo 自动朗读 + 免键盘对讲。
 * 用会话级快照记录进入前两个开关的原值,退出时精确恢复,而不是无脑打开——
 * 避免用户本来就关着其中一项,一进一出安静模式后被意外打开。
 * @param {{ leoAutoSpeak?: boolean, leoHandsFree?: boolean } | null | undefined} settings
 * @returns {{
 *   snapshot: { leoAutoSpeak: boolean, leoHandsFree: boolean },
 *   patch: { leoAutoSpeak: false, leoHandsFree: false },
 * }}
 */
export function enterLeoQuietMode(settings) {
  return {
    snapshot: {
      leoAutoSpeak: settings?.leoAutoSpeak !== false,
      leoHandsFree: settings?.leoHandsFree !== false,
    },
    patch: { leoAutoSpeak: false, leoHandsFree: false },
  }
}

/**
 * @param {{ leoAutoSpeak?: boolean, leoHandsFree?: boolean } | null | undefined} snapshot
 * @returns {{ leoAutoSpeak: boolean, leoHandsFree: boolean }}
 */
export function exitLeoQuietMode(snapshot) {
  return {
    leoAutoSpeak: snapshot?.leoAutoSpeak !== false,
    leoHandsFree: snapshot?.leoHandsFree !== false,
  }
}

/**
 * 当前是否处于安静模式 —— 纯粹看两个开关是否同时为关,不管是怎么关的
 * (手动关掉两项 与 点了安静模式按钮,视觉上应该一致)。
 * @param {{ leoAutoSpeak?: boolean, leoHandsFree?: boolean } | null | undefined} settings
 * @returns {boolean}
 */
export function isLeoQuietModeOn(settings) {
  return settings?.leoAutoSpeak === false && settings?.leoHandsFree === false
}

/**
 * getUserMedia 约束:开回声消除/降噪(行业默认)。
 * @returns {MediaStreamConstraints}
 */
export function leoMicConstraints() {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  }
}
