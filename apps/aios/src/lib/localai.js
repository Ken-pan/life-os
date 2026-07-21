/**
 * LocalAI 网关客户端(llama-swap · OpenAI 兼容)。
 * 网关按 model 字段自动拉起/卸载模型,首个请求会等到模型就绪。
 * 合同见 local-ai/docs/CONSUMING.md。
 */

import { browser } from '$app/environment'
import { CLOUD_BUILD } from '$lib/env.js'
import {
  mapUiModelToKimi,
  messagesHaveImageParts,
  resolveChatBackendKind,
} from '$lib/cloudChat.core.js'

/** 网关地址是**设备本地**配置(不进云同步):本地形态用 127.0.0.1,
 *  云端版可在设置里填你暴露出来的公网网关。改这里不会覆盖别的设备。
 *  live binding:consumers 以 `${GATEWAY}/...` 在调用时读取最新值。 */
const GATEWAY_KEY = 'aios_gateway_url_v1'
export const DEFAULT_GATEWAY = 'http://127.0.0.1:18888'
export { mapUiModelToKimi, resolveChatBackendKind }

function initGateway() {
  if (!browser) return DEFAULT_GATEWAY
  try {
    return (
      localStorage.getItem(GATEWAY_KEY) ||
      import.meta.env.VITE_AIOS_GATEWAY ||
      DEFAULT_GATEWAY
    )
  } catch {
    return DEFAULT_GATEWAY
  }
}

export let GATEWAY = initGateway()

/** 设置网关地址(设备本地持久化;空/等于默认则清掉覆盖) */
export function setGateway(url) {
  GATEWAY = (url || '').trim() || DEFAULT_GATEWAY
  if (!browser) return
  try {
    if (GATEWAY === DEFAULT_GATEWAY) localStorage.removeItem(GATEWAY_KEY)
    else localStorage.setItem(GATEWAY_KEY, GATEWAY)
  } catch {
    /* localStorage 不可用时仅本次会话生效 */
  }
}

export const MODELS = [
  {
    id: 'llm-fast',
    nameKey: 'model.fastName',
    descKey: 'model.fastDesc',
    // qwen3.6 支持思考模式,由 chat_template_kwargs.enable_thinking 控制
    thinkingSwitch: true,
  },
  {
    id: 'llm-quality',
    nameKey: 'model.qualityName',
    descKey: 'model.qualityDesc',
    thinkingSwitch: false, // instruct 模型,无思考开关
  },
]

export const DEFAULT_MODEL = 'llm-fast'

/** 视觉路由:对话里出现图片时改走 VLM(VLM 同样能纯文本对话) */
export const VISION_MODELS = { fast: 'vlm-fast', quality: 'vlm-quality' }

export const TRANSCRIBE_MODEL = 'mlx-community/Qwen3-ASR-1.7B-8bit'

export function modelById(id) {
  return MODELS.find((m) => m.id === id) ?? MODELS[0]
}

/** Short-lived ping cache — avoid a 3s stall on every message when the gateway is down. */
let pingCache = { at: 0, ok: false }
const PING_CACHE_MS = 5000

/** @returns {Promise<boolean>} 网关是否可达 */
export async function pingGateway() {
  const now = Date.now()
  if (now - pingCache.at < PING_CACHE_MS) return pingCache.ok
  try {
    const res = await fetch(`${GATEWAY}/v1/models`, {
      signal: AbortSignal.timeout(3000),
    })
    pingCache = { at: now, ok: res.ok }
    return pingCache.ok
  } catch {
    pingCache = { at: now, ok: false }
    return false
  }
}

/**
 * 解析本轮对话后端:云端构建且本机网关不可达 → Kimi 代理,否则 LocalAI。
 * @returns {Promise<{ kind: 'local'|'kimi', gatewayOk: boolean }>}
 */
export async function resolveChatBackend() {
  const gatewayOk = await pingGateway()
  const kind = resolveChatBackendKind({ cloudBuild: CLOUD_BUILD, gatewayOk })
  return { kind, gatewayOk }
}

/**
 * 流式对话(支持工具调用 / 视觉消息 / 思考模式)。
 *
 * @param {{
 *   model: string,
 *   messages: Array<object>,
 *   signal?: AbortSignal,
 *   temperature?: number,
 *   maxTokens?: number,
 *   tools?: Array<object>,
 *   thinking?: boolean,
 *   backend?: { kind?: 'local'|'kimi' },
 *   onDelta?: (chunk: { content?: string, reasoning?: string }) => void,
 * }} options
 * @returns {Promise<{
 *   toolCalls: Array<{ id: string, name: string, arguments: string }>,
 *   finishReason: string | null,
 * }>}
 */
export async function streamChat({
  model,
  messages,
  signal,
  temperature = 0.7,
  maxTokens = 4096,
  tools,
  thinking = false,
  backend,
  onDelta,
}) {
  const kind = backend?.kind === 'kimi' ? 'kimi' : 'local'

  if (kind === 'kimi') {
    if (messagesHaveImageParts(messages)) {
      throw new Error('kimi_vision_unsupported')
    }
    /** @type {Record<string, unknown>} */
    const body = {
      model: mapUiModelToKimi(model),
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      thinking: Boolean(thinking),
    }
    if (tools?.length) body.tools = tools

    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok || !res.body) {
      let code = `kimi_${res.status}`
      try {
        const errBody = await res.json()
        if (errBody?.error === 'not_configured') code = 'kimi_not_configured'
        else if (typeof errBody?.error === 'string') code = errBody.error
      } catch {
        /* keep status code */
      }
      throw new Error(code)
    }
    return parseChatCompletionStream(res, onDelta)
  }

  const spec = modelById(model)
  const body = {
    model,
    messages,
    stream: true,
    temperature,
    max_tokens: maxTokens,
    // Qwen 官方采样建议(mlx_lm 忽略不认识的字段):非思考 top_p 0.8 / top_k 20
    top_p: 0.8,
    top_k: 20,
    // 轻度重复惩罚兜底所有通道:该模型(思考与非思考都)偶发整句/整词复读循环直到烧光 token,
    // 1.05 很轻不伤质量,实测显著降低发生率。原先只加在思考通道,快速模式复读因此漏网。
    repetition_penalty: 1.05,
    repetition_context_size: 512,
  }
  if (spec.thinkingSwitch) {
    body.chat_template_kwargs = { enable_thinking: Boolean(thinking) }
    if (thinking) {
      // 思考模式按官方推荐锁定采样(temp 0.6 / top_p 0.95)
      body.temperature = Math.min(temperature, 0.6)
      body.top_p = 0.95
    }
  }
  if (tools?.length) body.tools = tools

  const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`gateway ${res.status}`)
  }
  return parseChatCompletionStream(res, onDelta)
}

/**
 * Shared SSE / JSON completion parser for LocalAI and Kimi proxy.
 * @param {Response} res
 * @param {((chunk: { content?: string, reasoning?: string }) => void) | undefined} onDelta
 */
async function parseChatCompletionStream(res, onDelta) {
  // 部分后端(VLM 服务壳)忽略 stream 参数直接返回整块 JSON
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    const json = await res.json()
    const message = json.choices?.[0]?.message
    // 思考内容字段:mlx-lm 用 reasoning,部分后端用 reasoning_content
    const reasoning = message?.reasoning_content || message?.reasoning
    if (reasoning) onDelta?.({ reasoning })
    if (message?.content) onDelta?.({ content: message.content })
    return {
      toolCalls: (message?.tool_calls ?? []).map((tc) => ({
        id: tc.id ?? '',
        name: tc.function?.name ?? '',
        arguments: tc.function?.arguments ?? '',
      })),
      finishReason: json.choices?.[0]?.finish_reason ?? null,
    }
  }

  /** @type {Map<number, { id: string, name: string, arguments: string }>} */
  const toolCallsByIndex = new Map()
  let finishReason = null

  // 复读熔断:该模型偶发退化循环(同一句话无限重复直到烧光 max_tokens)。
  // 检测到就地终止流,把 token 和时间还给上层重试(finishReason='loop')。
  let generated = ''
  let lastCheckedAt = 0
  const isLooping = () => {
    if (generated.length - lastCheckedAt < 400) return false
    lastCheckedAt = generated.length
    const tail = generated.slice(-1600)
    const lines = tail.split('\n').filter((l) => l.trim().length > 3)
    if (lines.length >= 9) {
      const ref = lines.at(-2) // 末行可能未流完,用倒数第二行作参照
      if (ref && lines.slice(-9, -1).every((l) => l === ref)) return true
    }
    const unit = tail.slice(-32)
    if (unit.trim().length >= 8) {
      let count = 0
      for (let i = 0; (i = tail.indexOf(unit, i)) !== -1; i += 1) count++
      if (count >= 10) return true
    }
    return false
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let aborted = false
  // 上游模型可能在流式中途被网关换出(并发请求另一档模型):连接不关但数据
  // 永远不来,不设超时会无限挂起。180s 覆盖大模型最慢的首 token。
  const readWithTimeout = () => {
    let timer
    return Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('生成流中断(上游模型可能被卸载),请重试')),
          180000,
        )
      }),
    ]).finally(() => clearTimeout(timer))
  }
  try {
    read: while (true) {
      const { done, value } = await readWithTimeout()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const data = line.startsWith('data:') ? line.slice(5).trim() : null
        if (!data || data === '[DONE]') continue
        let json
        try {
          json = JSON.parse(data)
        } catch {
          continue
        }
        const choice = json.choices?.[0]
        if (!choice) continue
        if (choice.finish_reason) finishReason = choice.finish_reason
        const delta = choice.delta
        if (!delta) continue
        if (delta.content || delta.reasoning_content || delta.reasoning) {
          generated +=
            (delta.reasoning_content || delta.reasoning || '') +
            (delta.content || '')
          if (isLooping()) {
            finishReason = 'loop'
            aborted = true
            break read
          }
          onDelta?.({
            content: delta.content || undefined,
            reasoning: delta.reasoning_content || delta.reasoning || undefined,
          })
        }
        // 工具调用增量:按 index 聚合(mlx-lm 通常整块到达,此处防御分片)
        for (const tc of delta.tool_calls ?? []) {
          const idx = tc.index ?? 0
          const cur = toolCallsByIndex.get(idx) ?? {
            id: '',
            name: '',
            arguments: '',
          }
          if (tc.id) cur.id = tc.id
          if (tc.function?.name) cur.name = tc.function.name
          if (tc.function?.arguments) cur.arguments += tc.function.arguments
          toolCallsByIndex.set(idx, cur)
        }
      }
    }
  } finally {
    if (aborted) {
      try {
        await reader.cancel()
      } catch {
        /* 连接已断时忽略 */
      }
    }
    reader.releaseLock()
  }

  return {
    toolCalls: [...toolCallsByIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v)
      .filter((v) => v.name),
    finishReason,
  }
}

/**
 * 文本向量化(Qwen3-Embedding-8B,4096 维)。
 * Matryoshka 截断到 keepDims 维并重新归一,便于 localStorage 存储。
 * @returns {Promise<number[][]>}
 */
export async function embed(texts, keepDims = 512) {
  const res = await fetch(`${GATEWAY}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddings', input: texts }),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`embeddings ${res.status}`)
  const json = await res.json()
  return json.data.map((d) => {
    const v = d.embedding.slice(0, keepDims)
    const norm = Math.hypot(...v) || 1
    return v.map((x) => Math.round((x / norm) * 1e4) / 1e4)
  })
}

/** @returns {number} 余弦相似度(输入已归一时即点积) */
export function cosine(a, b) {
  const n = Math.min(a.length, b.length)
  let dot = 0
  for (let i = 0; i < n; i++) dot += a[i] * b[i]
  return dot
}

/**
 * 语音转写(Qwen3-ASR,中文最准)。
 * @param {Blob} blob 录音数据
 * @returns {Promise<string>}
 */
export async function transcribe(blob) {
  const form = new FormData()
  form.append('model', TRANSCRIBE_MODEL)
  const ext = blob.type.includes('mp4')
    ? 'mp4'
    : blob.type.includes('ogg')
      ? 'ogg'
      : 'webm'
  form.append('file', blob, `recording.${ext}`)
  const res = await fetchWithColdRetry(() =>
    fetch(`${GATEWAY}/v1/audio/transcriptions`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120000),
    }),
  )
  if (!res.ok) throw new Error(`transcribe ${res.status}`)
  const json = await res.json()
  return (json.text ?? '').trim()
}

export const TTS_MODEL = 'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit'

/** 朗读音色(Qwen3-TTS 内置 9 声),设置页可选,名字文案在 i18n ttsVoice.* */
export const TTS_VOICES = [
  { id: 'dylan', nameKey: 'ttsVoice.dylan' },
  { id: 'ryan', nameKey: 'ttsVoice.ryan' },
  { id: 'aiden', nameKey: 'ttsVoice.aiden' },
  { id: 'eric', nameKey: 'ttsVoice.eric' },
  { id: 'uncle_fu', nameKey: 'ttsVoice.uncle_fu' },
  { id: 'vivian', nameKey: 'ttsVoice.vivian' },
  { id: 'serena', nameKey: 'ttsVoice.serena' },
  { id: 'ono_anna', nameKey: 'ttsVoice.ono_anna' },
  { id: 'sohee', nameKey: 'ttsVoice.sohee' },
]

export const DEFAULT_TTS_VOICE = 'dylan'

/** 语音壳冷启动偶发 500/502(mlx_audio 首载竞态),等 2s 重试一次 */
async function fetchWithColdRetry(doFetch) {
  let res = await doFetch()
  if (res.status === 500 || res.status === 502) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    res = await doFetch()
  }
  return res
}

/** 朗读风格指令(按文本语言选中/英),决定语气·情绪·语速 */
function ttsInstruct(text) {
  return /[一-鿿]/.test(text)
    ? '用轻松自然的语气说话,像朋友之间日常聊天,语速适中。'
    : 'Speak in a relaxed, natural conversational tone, like chatting with a friend.'
}

function ttsRequestBody(text, voice) {
  return {
    model: TTS_MODEL,
    input: text,
    voice,
    instruct: ttsInstruct(text),
  }
}

/**
 * 把一段文本切成"句",用于逐句合成 + 逐句高亮跟读。
 * 规则:中英句末标点/换行处断句(保留标点);过短碎片并入上一句(免闪烁);
 * 过长且无标点的按逗号或硬长度再切(单句音频不至于太久、跟读粒度更细)。
 * @param {string} text
 * @returns {string[]}
 */
export function splitSentences(text) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return []
  // 句末标点后断开:中(。!?;…)或 英(.!? 后需空白,避免切断小数/缩写)
  const raw = clean.split(/(?<=[。!?!?;;…])|(?<=[.!?])\s+/)
  const out = []
  for (let seg of raw) {
    seg = seg.trim()
    if (!seg) continue
    while (seg.length > 120) {
      // 优先在逗号处切,退而求其次硬切
      let cut = Math.max(seg.lastIndexOf('，', 120), seg.lastIndexOf(',', 120))
      if (cut < 40) cut = 120
      out.push(seg.slice(0, cut + 1).trim())
      seg = seg.slice(cut + 1).trim()
    }
    if (!seg) continue
    // 只并入极短碎片(如落单的标点/"OK.");中文短句本身是一句,保留以细化跟读粒度
    if (out.length && seg.length < 4) out[out.length - 1] += ' ' + seg
    else out.push(seg)
  }
  return out
}

/** 逐句合成时,把整句流式 PCM 累积成一个 AudioBuffer(顺序播,句界清晰、便于跟读高亮) */
async function pcmStreamToBuffer(res, ctx) {
  const sr = Number(res.headers.get('x-sample-rate')) || 24000
  const reader = res.body.getReader()
  const chunks = []
  let total = 0
  let carry = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    let bytes = value
    if (carry) {
      const m = new Uint8Array(carry.length + value.length)
      m.set(carry)
      m.set(value, carry.length)
      bytes = m
      carry = null
    }
    const usable = bytes.length - (bytes.length % 2)
    if (usable < bytes.length) carry = bytes.slice(usable)
    if (usable > 0) {
      const aligned =
        bytes.byteOffset === 0 && bytes.buffer.byteLength === usable
          ? bytes.buffer
          : bytes.slice(0, usable).buffer
      chunks.push(new Int16Array(aligned, 0, usable / 2))
      total += usable / 2
    }
  }
  const buf = ctx.createBuffer(1, total || 1, sr)
  const ch = buf.getChannelData(0)
  let o = 0
  for (const c of chunks)
    for (let k = 0; k < c.length; k++) ch[o++] = c[k] / 32768
  return buf
}

/** 全局仅一个朗读会话在放:新会话开始前停掉上一个,避免两条人声叠着响 */
let activeSpeech = null

/**
 * 创建一个朗读会话:逐句合成、顺序播放,支持暂停/续播、变速、逐句跟读回调。
 *
 * 每句单独走流式 TTS(首句 ~数百 ms 出声),播放中预取下一句;暖机后 RTF≈0.2,
 * 合成远快于播放,句间基本无缝。暂停用 AudioContext.suspend(冻结播放时钟),
 * 变速改 playbackRate(实时生效)。旧后端返回整段 WAV 时自动回退解码。
 *
 * 必须在用户手势(点击)内调用:AudioContext 的创建/恢复受自动播放策略约束。
 *
 * @param {string} text
 * @param {{
 *   voice?: string, rate?: number,
 *   onStart?: () => void,                       // 首句开始出声(加载→播放)
 *   onSentence?: (index: number, text: string) => void, // 每句开播时(驱动高亮/滚动)
 *   onStateChange?: (state: 'playing'|'paused') => void,
 *   onEnd?: () => void,                          // 自然播完 / 被停止 都会回调一次
 *   onError?: (err: Error) => void,
 * }} [opts]
 * @returns {{
 *   sentences: string[],
 *   pause: () => void, resume: () => void, togglePause: () => void, isPaused: () => boolean,
 *   setRate: (r: number) => void, getRate: () => number,
 *   currentIndex: () => number, stop: () => void,
 * }}
 */
export function createSpeechSession(text, opts = {}) {
  const {
    voice = DEFAULT_TTS_VOICE,
    rate = 1,
    onStart,
    onSentence,
    onStateChange,
    onEnd,
    onError,
  } = opts
  const sentences = splitSentences(text)
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const buffers = new Map() // index -> Promise<AudioBuffer|null>
  const aborters = new Map() // index -> AbortController
  let idx = -1
  let curSource = null
  let curRate = rate
  let paused = false
  let started = false
  let ended = false

  const synth = (i) => {
    if (i < 0 || i >= sentences.length) return Promise.resolve(null)
    if (buffers.has(i)) return buffers.get(i)
    const ac = new AbortController()
    aborters.set(i, ac)
    const p = (async () => {
      const res = await fetch(`${GATEWAY}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ttsRequestBody(sentences[i], voice),
          stream: true,
        }),
        signal: ac.signal,
      })
      if (!res.ok || !res.body) throw new Error(`tts ${res.status}`)
      const ctype = res.headers.get('content-type') ?? ''
      if (ctype.includes('audio/pcm')) return await pcmStreamToBuffer(res, ctx)
      // 旧后端:整段 WAV
      return await ctx.decodeAudioData(await (await res.blob()).arrayBuffer())
    })().catch((e) => {
      if (e?.name !== 'AbortError') console.warn('tts synth', e)
      return null
    })
    buffers.set(i, p)
    return p
  }

  const playFrom = async (i) => {
    if (ended) return
    idx = i
    if (i >= sentences.length) {
      terminate(true)
      return
    }
    onSentence?.(i, sentences[i])
    synth(i + 1) // 预取下一句,句间不断
    const buf = await synth(i)
    if (ended) return
    if (!buf) {
      playFrom(i + 1) // 这句合成失败,跳过继续
      return
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = curRate
    src.connect(ctx.destination)
    src.onended = () => {
      if (!ended && src === curSource) playFrom(i + 1)
    }
    curSource = src
    if (!started) {
      started = true
      onStart?.()
    }
    src.start()
  }

  const cleanup = () => {
    for (const ac of aborters.values()) {
      try {
        ac.abort()
      } catch {
        /* noop */
      }
    }
    if (curSource) {
      try {
        curSource.onended = null
        curSource.stop()
      } catch {
        /* 已结束 */
      }
    }
    ctx.close().catch(() => {})
  }

  // 唯一收尾出口:自然播完 / 用户停止 / 被新会话顶掉 都经此,onEnd 只回调一次
  const terminate = (notify) => {
    if (ended) return
    ended = true
    cleanup()
    if (activeSpeech === controller) activeSpeech = null
    if (notify) onEnd?.()
  }

  const controller = {
    sentences,
    pause() {
      if (paused || ended) return
      paused = true
      ctx.suspend()
      onStateChange?.('paused')
    },
    resume() {
      if (!paused || ended) return
      paused = false
      ctx.resume()
      onStateChange?.('playing')
    },
    togglePause() {
      paused ? this.resume() : this.pause()
    },
    isPaused: () => paused,
    setRate(r) {
      curRate = r
      if (curSource) curSource.playbackRate.value = r
    },
    getRate: () => curRate,
    currentIndex: () => idx,
    stop: () => terminate(true),
  }

  activeSpeech?.stop()
  activeSpeech = controller
  ;(async () => {
    if (!sentences.length) {
      terminate(false)
      onError?.(new Error('empty tts input'))
      return
    }
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        /* 自动播放策略:点击手势内一般无碍 */
      }
    }
    playFrom(0)
  })()

  return controller
}

/**
 * 文本转语音(整段,非流式)。返回 wav Blob。保留给需要完整音频文件的场景。
 * 交互朗读请用 {@link createSpeechSession}(逐句流式,首声 ~数百 ms,可暂停/变速)。
 * @param {string} text
 * @param {string} [voice]
 * @returns {Promise<Blob>}
 */
export async function speak(text, voice = DEFAULT_TTS_VOICE) {
  const input = text.slice(0, 2000)
  const res = await fetchWithColdRetry(() =>
    fetch(`${GATEWAY}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ttsRequestBody(input, voice)),
      signal: AbortSignal.timeout(180000),
    }),
  )
  if (!res.ok) throw new Error(`tts ${res.status}`)
  return await res.blob()
}

/** 辅助小模型:常驻 Qwen3.5-4B,标题/建议/摘要等短任务专用(不占主力模型队列) */
export const TINY_MODEL = 'llm-tiny'

/**
 * 小模型短任务通用入口(非流式,思考关闭,失败静默返回 null)。
 * 网关里 llm-tiny 常驻,通常亚秒级返回;若不可用(旧网关配置)自动回退主力模型。
 * @param {string} prompt
 * @param {{ maxTokens?: number, temperature?: number, timeoutMs?: number }} [opts]
 * @returns {Promise<string | null>}
 */
export async function tinyComplete(prompt, opts = {}) {
  const { maxTokens = 64, temperature = 0.3, timeoutMs = 20000 } = opts
  for (const model of [TINY_MODEL, 'llm-fast']) {
    try {
      const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          chat_template_kwargs: { enable_thinking: false },
          max_tokens: maxTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) continue
      const json = await res.json()
      const text = json.choices?.[0]?.message?.content?.trim()
      if (text) return text
    } catch {
      /* 尝试下一档 */
    }
  }
  return null
}

/**
 * 用常驻小模型给对话起一个短标题(fire-and-forget,失败静默)。
 * @returns {Promise<string | null>}
 */
export async function generateTitle(userText, assistantText, locale = 'zh') {
  const instruction =
    locale === 'zh'
      ? '用不超过 12 个字概括这段对话的主题,只输出标题本身,不要标点和引号。'
      : 'Summarize the topic of this conversation in at most 6 words. Output only the title, no quotes or punctuation.'
  const title = await tinyComplete(
    `${instruction}\n\n用户: ${userText.slice(0, 500)}\n助手: ${assistantText.slice(0, 500)}`,
    { maxTokens: 32 },
  )
  if (!title) return null
  return title.replaceAll(/["'「」《》。,]/g, '').slice(0, 24) || null
}

/**
 * 语音转写后处理:较长且缺标点的转写用小模型补标点断句。
 * 只在必要时调用(已有标点直接返回),防呆失败一律退回原文。
 * @returns {Promise<string>}
 */
export async function polishTranscript(text) {
  const trimmed = text.trim()
  if (trimmed.length < 16 || /[。,,.!?!?;;]/.test(trimmed)) return trimmed
  const polished = await tinyComplete(
    `给这段语音转写加上标点并合理断句。不要改动用字,不要增删内容,只输出处理后的文本:\n\n${trimmed.slice(0, 1000)}`,
    { maxTokens: 1024, temperature: 0.1 },
  )
  // 长度偏差过大说明模型自由发挥了,退回原文
  if (
    !polished ||
    Math.abs(polished.length - trimmed.length) > trimmed.length * 0.3
  ) {
    return trimmed
  }
  return polished
}
