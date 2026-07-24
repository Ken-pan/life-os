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
import {
  DEFAULT_GATEWAY,
  SAME_ORIGIN_GATEWAY,
  isBuiltinGatewayUrl,
  isLoopbackHost,
  resolveGatewayUrl,
  shouldUseSameOriginLocalAiProxy,
} from '$lib/localaiGateway.core.js'
import { isHeavyLocalModel } from '$lib/localaiHeavy.core.js'

export { isHeavyLocalModel }

/** 网关地址是**设备本地**配置(不进云同步)。
 *  Mac loopback → 127.0.0.1:18888；iPhone / Tailscale Daily Beta → 同域 `/__localai`
 *  （Mac 上 serve-static 反代到本机网关，LocalAI 仍只绑 loopback）。
 *  live binding:consumers 以 `${GATEWAY}/...` 在调用时读取最新值。 */
const GATEWAY_KEY = 'aios_gateway_url_v1'
export { DEFAULT_GATEWAY, SAME_ORIGIN_GATEWAY }
export { mapUiModelToKimi, resolveChatBackendKind }

function pageHostname() {
  if (!browser) return ''
  try {
    return String(window.location?.hostname || '')
  } catch {
    return ''
  }
}

/** 壳注入的 tailnet HTTPS 网关(iOS 壳 atDocumentStart 写入;非壳环境为空)。 */
function injectedGateway() {
  if (!browser) return ''
  try {
    return String(window.__KENOS_LOCALAI_GATEWAY__ || '')
  } catch {
    return ''
  }
}

function initGateway() {
  if (!browser) return DEFAULT_GATEWAY
  try {
    return resolveGatewayUrl({
      override: localStorage.getItem(GATEWAY_KEY),
      envGateway: import.meta.env.VITE_AIOS_GATEWAY,
      hostname: pageHostname(),
      injected: injectedGateway(),
    })
  } catch {
    return DEFAULT_GATEWAY
  }
}

export let GATEWAY = initGateway()

/** 设置网关地址(设备本地持久化;空/内置值则清掉覆盖并恢复自动解析) */
export function setGateway(url) {
  const trimmed = (url || '').trim()
  if (!trimmed || isBuiltinGatewayUrl(trimmed)) {
    if (browser) {
      try {
        localStorage.removeItem(GATEWAY_KEY)
      } catch {
        /* ignore */
      }
    }
    GATEWAY = resolveGatewayUrl({
      envGateway: browser ? import.meta.env.VITE_AIOS_GATEWAY : '',
      hostname: pageHostname(),
      injected: injectedGateway(),
    })
    return
  }
  GATEWAY = trimmed.replace(/\/$/, '')
  if (!browser) return
  try {
    localStorage.setItem(GATEWAY_KEY, GATEWAY)
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

/**
 * Ping cache — success lasts longer (phone Today↔Ask remounts must not storm
 * /v1/models). Failures stay short so recovery is snappy.
 */
let pingCache = { at: 0, ok: false }
/** @type {Promise<boolean> | null} */
let pingInflight = null
const PING_OK_CACHE_MS = 45_000
const PING_FAIL_CACHE_MS = 8_000

/** @param {{ force?: boolean }} [opts] */
export async function pingGateway(opts = {}) {
  const force = Boolean(opts.force)
  const now = Date.now()
  const ttl = pingCache.ok ? PING_OK_CACHE_MS : PING_FAIL_CACHE_MS
  if (!force && now - pingCache.at < ttl) return pingCache.ok
  if (!force && pingInflight) return pingInflight

  pingInflight = (async () => {
    try {
      const res = await fetch(`${GATEWAY}/v1/models`, {
        signal: AbortSignal.timeout(3000),
      })
      pingCache = { at: Date.now(), ok: res.ok }
      return pingCache.ok
    } catch {
      pingCache = { at: Date.now(), ok: false }
      return false
    } finally {
      pingInflight = null
    }
  })()
  return pingInflight
}

/** True when GATEWAY is the Daily Beta same-origin LocalAI proxy. */
export function isPairedLocalAiGateway() {
  const g = String(GATEWAY || '')
  return g === SAME_ORIGIN_GATEWAY || g.includes('/__localai')
}

/** i18n key for gateway-down copy (loopback vs paired Mac). */
export function gatewayDownMessageKey() {
  return isPairedLocalAiGateway()
    ? 'chat.gatewayDownPaired'
    : 'chat.gatewayDown'
}

/**
 * 解析本轮对话后端:云端构建且本机网关不可达 → Kimi 代理,否则 LocalAI。
 * @returns {Promise<{ kind: 'local'|'kimi', gatewayOk: boolean }>}
 */
export async function resolveChatBackend() {
  // Hosted cloud shell cannot reach Mac loopback — skip the 3s dead ping.
  if (CLOUD_BUILD && browser) {
    const host = pageHostname()
    if (
      isBuiltinGatewayUrl(GATEWAY) &&
      !isPairedLocalAiGateway() &&
      host &&
      !shouldUseSameOriginLocalAiProxy(host) &&
      !isLoopbackHost(host)
    ) {
      return { kind: 'kimi', gatewayOk: false }
    }
  }
  const gatewayOk = await pingGateway()
  const kind = resolveChatBackendKind({ cloudBuild: CLOUD_BUILD, gatewayOk })
  return { kind, gatewayOk }
}

/** @type {Promise<unknown>} */
let heavyChatTail = Promise.resolve()
let heavyChatActive = 0

/** True while a heavy local chat/completions request owns the Mac worker. */
export function isHeavyChatBusy() {
  return heavyChatActive > 0
}

/**
 * Serialize heavy LocalAI chat so phone Ask / tools don't wedge mlx by stacking
 * llm-fast with titles/suggestions that fell back to the same model.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withHeavyChatSlot(fn) {
  const run = heavyChatTail.then(async () => {
    heavyChatActive += 1
    try {
      return await fn()
    } finally {
      heavyChatActive = Math.max(0, heavyChatActive - 1)
    }
  })
  heavyChatTail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
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

  const runLocal = async () => {
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

  // Serialize heavy models on the phone→Mac path (tiny stays free).
  if (isHeavyLocalModel(model)) return withHeavyChatSlot(runLocal)
  return runLocal()
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
 * @param {{ prompt?: string } | null | undefined} [opts]
 * @returns {Promise<string>}
 */
export async function transcribe(blob, opts = {}) {
  const form = new FormData()
  form.append('model', TRANSCRIBE_MODEL)
  const ext = blob.type.includes('mp4')
    ? 'mp4'
    : blob.type.includes('ogg')
      ? 'ogg'
      : 'webm'
  form.append('file', blob, `recording.${ext}`)
  const hint = typeof opts?.prompt === 'string' ? opts.prompt.trim() : ''
  if (hint) form.append('prompt', hint.slice(0, 224))
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
  { id: 'leo', nameKey: 'ttsVoice.leo' },
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

function ttsRequestBody(text, voice, instruct) {
  return {
    model: TTS_MODEL,
    input: text,
    voice,
    instruct: instruct || ttsInstruct(text),
  }
}

/**
 * 把一段文本切成"句",用于逐句合成 + 逐句高亮跟读。
 * 规则:中英句末标点/换行处断句(保留标点);过短碎片并入上一句(免闪烁);
 * 过长且无标点的按逗号或硬长度再切(单句音频不至于太久、跟读粒度更细)。
 * @param {string} text
 * @param {{ coalesceBreathBeats?: boolean }} [opts]
 * @returns {string[]}
 */
export function splitSentences(text, opts = {}) {
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
  if (opts.coalesceBreathBeats) return coalesceBreathBeats(out)
  return out
}

/**
 * Leo 亲密朗读:把 mmh…/短中文标签并回上一句,避免逐句合成时中英 lang 切换变声。
 * @param {string[]} parts
 */
function coalesceBreathBeats(parts) {
  /** @type {string[]} */
  const out = []
  for (const raw of parts) {
    const p = String(raw || '').trim()
    if (!p) continue
    const breathOnly =
      /^(?:mm+h*|nn+h*|a+h*|o+h*|h{2,}|嗯+|啊+|哈+|呼+)…?$/i.test(p) ||
      p.length < 12
    const zhTagOnly = /^[\u4e00-\u9fff….\s。！？!?]{1,10}$/.test(p)
    if (out.length && (breathOnly || zhTagOnly)) {
      out[out.length - 1] = `${out[out.length - 1]} ${p}`.replace(/\s+/g, ' ').trim()
    } else {
      out.push(p)
    }
  }
  return out
}

/** 检测近静音缓冲(冷启动偶发全零 PCM) */
function isNearSilentBuffer(buf) {
  if (!buf?.length || !buf.numberOfChannels) return true
  const data = buf.getChannelData(0)
  const n = data.length
  if (!n) return true
  let peak = 0
  const step = Math.max(1, Math.floor(n / 4000))
  for (let i = 0; i < n; i += step) {
    const a = Math.abs(data[i])
    if (a > peak) peak = a
    if (peak > 0.01) return false
  }
  return peak <= 0.01
}

/** 逐句合成时,把整句流式 PCM 累积成一个 AudioBuffer(顺序播,句界清晰、便于跟读高亮) */
/* ── 句级 TTS 音频缓存(手机本地内存 + CacheStorage)──
 * 出声慢的两大来源:模型被 llama-swap 换出后的冷载、以及首句合成本身。
 * 缓存直接消掉「重复句」(开场白/常用短句)的全部网络+合成时间;配合流式期间
 * 的首句预热(见 prewarmSpeechAudio),等 LLM 说完时首句音频往往已经就绪。 */
const speechMemCache = new Map() // key -> ArrayBuffer(wav bytes)
const SPEECH_MEM_MAX = 24
const SPEECH_CACHE_NAME = 'kenos-tts-v1'

/** djb2 → hex(缓存键用,非安全场景) */
function ttsHash(str) {
  let h = 5381
  const s = String(str || '')
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** 与 synth() 的语种推断保持同一逻辑,键才对得上 */
function effectiveLangCode(text, langCode) {
  if (langCode) return langCode
  if (/[一-鿿]/.test(text)) return 'z'
  if (/[A-Za-z]/.test(text)) return 'a'
  return ''
}

/** 缓存键(导出供单测锁定稳定性) */
export function speechCacheKey({ text, voice, instruct, langCode } = {}) {
  const t = String(text || '')
  return `v1|${voice || DEFAULT_TTS_VOICE}|${effectiveLangCode(t, langCode)}|${ttsHash(instruct || '')}|${ttsHash(t)}|${t.length}`
}

function speechCacheRequest(key) {
  return new Request(`https://kenos-tts.cache.local/${encodeURIComponent(key)}`)
}

/** @returns {Promise<ArrayBuffer|null>} */
async function speechCacheGet(key) {
  const mem = speechMemCache.get(key)
  if (mem) return mem
  try {
    // CacheStorage 需要安全上下文(https);Daily Beta http origin 自动降级为纯内存
    const cache = await caches.open(SPEECH_CACHE_NAME)
    const hit = await cache.match(speechCacheRequest(key))
    if (!hit) return null
    const bytes = await hit.arrayBuffer()
    speechMemCache.set(key, bytes)
    return bytes
  } catch {
    return null
  }
}

function speechCachePut(key, bytes) {
  if (!bytes || bytes.byteLength < 1600) return
  speechMemCache.set(key, bytes)
  while (speechMemCache.size > SPEECH_MEM_MAX) {
    const oldest = speechMemCache.keys().next().value
    speechMemCache.delete(oldest)
  }
  try {
    void caches
      .open(SPEECH_CACHE_NAME)
      .then((c) =>
        c.put(
          speechCacheRequest(key),
          new Response(bytes.slice(0), {
            headers: { 'Content-Type': 'audio/wav' },
          }),
        ),
      )
  } catch {
    /* 非安全上下文/隐私模式:仅内存 */
  }
}

/** 预热去重:全局最多一条在飞,绝不轰炸网关(网关被并发合成打挂过) */
let prewarmInflight = null

/**
 * 预热一句话的 TTS:流式回答期间先把**首句**合成好放进缓存,LLM 说完时
 * createSpeechSession 的 synth(0) 直接命中 → 几乎立即出声。
 * 同时天然完成 speech-tts 模型的按需加载(llama-swap 冷载也发生在等待期)。
 * @param {string} text
 * @param {{ voice?: string, instruct?: string, langCode?: string }} [opts]
 */
export async function prewarmSpeechAudio(text, opts = {}) {
  const t = String(text || '').trim()
  if (!browser || !t) return false
  const voice = opts.voice || DEFAULT_TTS_VOICE
  const key = speechCacheKey({ text: t, voice, instruct: opts.instruct, langCode: opts.langCode })
  if (speechMemCache.has(key)) return true
  if (prewarmInflight) return false
  prewarmInflight = (async () => {
    try {
      if (await speechCacheGet(key)) return true
      const body = { ...ttsRequestBody(t, voice, opts.instruct), stream: false }
      const lang = effectiveLangCode(t, opts.langCode)
      if (lang) body.lang_code = lang
      const res = await fetch(`${GATEWAY}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) return false
      speechCachePut(key, await res.arrayBuffer())
      return true
    } catch {
      return false
    } finally {
      prewarmInflight = null
    }
  })()
  return prewarmInflight
}

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

/** 跨会话复用 AudioContext:保持「已解锁」,Leo 流式结束后才能自动出声 */
let sharedSpeechCtx = null

/**
 * 在用户手势内调用(发送/点喇叭/点 Leo chip),解锁朗读用 AudioContext。
 * @returns {Promise<boolean>}
 */
export async function unlockSpeechAudio() {
  if (typeof window === 'undefined') return false
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return false
  if (!sharedSpeechCtx || sharedSpeechCtx.state === 'closed') {
    sharedSpeechCtx = new AC()
  }
  if (sharedSpeechCtx.state === 'suspended') {
    try {
      await sharedSpeechCtx.resume()
    } catch {
      /* 无手势时可能失败 */
    }
  }
  return sharedSpeechCtx.state === 'running'
}

function getSpeechAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!sharedSpeechCtx || sharedSpeechCtx.state === 'closed') {
    sharedSpeechCtx = new AC()
  }
  return sharedSpeechCtx
}

/**
 * 创建一个朗读会话:逐句合成、顺序播放,支持暂停/续播、变速、逐句跟读回调。
 *
 * 每句单独走流式 TTS(首句 ~数百 ms 出声),播放中预取下一句;暖机后 RTF≈0.2,
 * 合成远快于播放,句间基本无缝。暂停用 AudioContext.suspend(冻结播放时钟),
 * 变速改 playbackRate(实时生效)。旧后端返回整段 WAV 时自动回退解码。
 *
 * 建议先在用户手势内调用 {@link unlockSpeechAudio},以便 Leo 自动朗读可用。
 *
 * @param {string} text
 * @param {{
 *   voice?: string, rate?: number, instruct?: string,
 *   langCode?: string,
 *   coalesceBreathBeats?: boolean,
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
    instruct,
    langCode,
    coalesceBreathBeats = false,
    onStart,
    onSentence,
    onStateChange,
    onEnd,
    onError,
  } = opts
  const sentences = splitSentences(text, { coalesceBreathBeats })
  const ctx = getSpeechAudioContext()
  const buffers = new Map() // index -> Promise<AudioBuffer|null>
  const aborters = new Map() // index -> AbortController
  let idx = -1
  let curSource = null
  let curRate = rate
  let paused = false
  let started = false
  let ended = false
  /** 下一句在 AudioContext 时间线上的起始点(无缝衔接) */
  let nextStartAt = 0
  /** 防 timer/onended 双触发 */
  let nextToPlay = 0
  /** @type {ReturnType<typeof setTimeout> | null} */
  let advanceTimer = null

  const clearAdvanceTimer = () => {
    if (advanceTimer) {
      clearTimeout(advanceTimer)
      advanceTimer = null
    }
  }

  const scheduleAdvance = (fromIndex) => {
    clearAdvanceTimer()
    const leadMs = Math.max(0, (nextStartAt - ctx.currentTime) * 1000 - 40)
    advanceTimer = setTimeout(() => {
      advanceTimer = null
      if (!ended && !paused) playFrom(fromIndex + 1)
    }, leadMs)
  }

  const synth = (i) => {
    if (i < 0 || i >= sentences.length) return Promise.resolve(null)
    if (buffers.has(i)) return buffers.get(i)
    const ac = new AbortController()
    aborters.set(i, ac)
    const p = (async () => {
      const body = {
        ...ttsRequestBody(sentences[i], voice, instruct),
        stream: true,
      }
      // 固定 lang_code 避免句间中英切换「变声」;Leo/Aiden 整段钉英式
      if (langCode) body.lang_code = langCode
      else if (/[一-鿿]/.test(sentences[i])) body.lang_code = 'z'
      else if (/[A-Za-z]/.test(sentences[i])) body.lang_code = 'a'

      // 缓存直击:预热过的首句 / 重复句(开场白等)零网络零合成,立即可播
      const cacheKey = speechCacheKey({
        text: sentences[i],
        voice,
        instruct,
        langCode,
      })
      const cachedBytes = await speechCacheGet(cacheKey)
      if (cachedBytes) {
        try {
          return await ctx.decodeAudioData(cachedBytes.slice(0))
        } catch {
          /* 缓存损坏则照常走网络 */
        }
      }

      const fetchOnce = () =>
        fetch(`${GATEWAY}/v1/audio/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ac.signal,
        })

      let res = await fetchOnce()
      // 语音壳冷启动偶发 500/502
      if (res.status === 500 || res.status === 502) {
        await new Promise((r) => setTimeout(r, 2000))
        if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        res = await fetchOnce()
      }
      if (!res.ok || !res.body) throw new Error(`tts ${res.status}`)
      const ctype = res.headers.get('content-type') ?? ''
      let buf
      if (ctype.includes('audio/pcm')) buf = await pcmStreamToBuffer(res, ctx)
      else buf = await ctx.decodeAudioData(await (await res.blob()).arrayBuffer())

      // 冷启动偶发「全静音 PCM」:丢弃并非流式重试一次
      if (buf && isNearSilentBuffer(buf)) {
        const retry = await fetch(`${GATEWAY}/v1/audio/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, stream: false }),
          signal: ac.signal,
        })
        if (retry.ok) {
          buf = await ctx.decodeAudioData(await (await retry.blob()).arrayBuffer())
        }
      }
      return buf
    })().catch((e) => {
      if (e?.name !== 'AbortError') console.warn('tts synth', e)
      return null
    })
    buffers.set(i, p)
    return p
  }

  const prefetchAround = (i) => {
    synth(i + 1)
    synth(i + 2)
  }

  const playFrom = async (i) => {
    if (ended || paused) return
    if (i !== nextToPlay) return
    nextToPlay = i + 1
    idx = i
    if (i >= sentences.length) {
      terminate(true)
      return
    }
    onSentence?.(i, sentences[i])
    prefetchAround(i)
    const buf = await synth(i)
    if (ended || paused) return
    if (!buf) {
      playFrom(i + 1)
      return
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = curRate
    src.connect(ctx.destination)
    const duration = buf.duration / Math.max(curRate, 0.01)
    const startAt = Math.max(ctx.currentTime + 0.015, nextStartAt)
    nextStartAt = startAt + duration
    curSource = src
    if (!started) {
      started = true
      onStart?.()
    }
    try {
      src.start(startAt)
    } catch (e) {
      console.warn('tts start', e)
      playFrom(i + 1)
      return
    }
    scheduleAdvance(i)
    src.onended = () => {
      if (!ended && !paused && advanceTimer == null) playFrom(i + 1)
    }
  }

  const cleanup = () => {
    clearAdvanceTimer()
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
      curSource = null
    }
    // 不 close 共享 AudioContext,保留解锁状态供 Leo 自动朗读
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
      clearAdvanceTimer()
      ctx.suspend()
      onStateChange?.('paused')
    },
    resume() {
      if (!paused || ended) return
      paused = false
      ctx.resume().then(() => {
        if (ended) return
        onStateChange?.('playing')
        // AudioContext 时钟暂停期间 wall timer 会漂移,按音频时间重排下一句
        if (idx >= 0 && idx < sentences.length) scheduleAdvance(idx)
      })
    },
    togglePause() {
      paused ? this.resume() : this.pause()
    },
    isPaused: () => paused,
    setRate(r) {
      const prev = curRate
      curRate = r
      if (curSource) curSource.playbackRate.value = r
      // 按新速率重估剩余时间线
      if (started && !ended && nextStartAt > ctx.currentTime && prev > 0) {
        const remain = (nextStartAt - ctx.currentTime) * (prev / Math.max(r, 0.01))
        nextStartAt = ctx.currentTime + remain
        if (!paused && idx >= 0) scheduleAdvance(idx)
      }
    },
    getRate: () => curRate,
    currentIndex: () => idx,
    stop: () => terminate(true),
    /** 打断且不回调 onEnd(发送/开麦 barge-in,避免误续听) */
    discard: () => terminate(false),
  }

  if (activeSpeech) {
    if (typeof activeSpeech.discard === 'function') activeSpeech.discard()
    else activeSpeech.stop()
  }
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
        /* 自动播放策略 */
      }
    }
    if (ctx.state === 'suspended') {
      terminate(false)
      onError?.(new Error('audio_autoplay_blocked'))
      return
    }
    nextStartAt = ctx.currentTime
    // 立刻预热前两句,缩短首声等待
    prefetchAround(-1)
    playFrom(0)
  })()

  return controller
}

/**
 * 打断当前朗读。
 * @param {{ silent?: boolean }} [opts] silent=true 时不触发 onEnd(避免对讲误续听)
 */
export function stopActiveSpeech(opts = {}) {
  if (opts.silent) activeSpeech?.discard?.()
  else activeSpeech?.stop()
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
 * 网关里 llm-tiny 常驻,通常亚秒级返回;默认在 tiny 失败且主力空闲时回退 llm-fast。
 * 手机 Ask 进行中请传 `allowFastFallback: false`,避免和用户对话抢 35B。
 * @param {string} prompt
 * @param {{
 *   maxTokens?: number,
 *   temperature?: number,
 *   timeoutMs?: number,
 *   allowFastFallback?: boolean,
 * }} [opts]
 * @returns {Promise<string | null>}
 */
export async function tinyComplete(prompt, opts = {}) {
  const {
    maxTokens = 64,
    temperature = 0.3,
    timeoutMs = 20000,
    allowFastFallback = true,
  } = opts
  /** @type {string[]} */
  const models = [TINY_MODEL]
  if (allowFastFallback && !isHeavyChatBusy()) models.push('llm-fast')
  for (const model of models) {
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
 * Keep the always-on 4B worker warm after Ask opens (no heavy-model swap).
 * Fire-and-forget; safe to call on idle.
 */
export async function warmLocalAiAssist() {
  if (!browser) return
  if (!(await pingGateway())) return
  await tinyComplete('ok', {
    maxTokens: 1,
    temperature: 0,
    timeoutMs: 8000,
    allowFastFallback: false,
  })
}

/**
 * Optional idle ping for llm-fast after Ask opens — fights 35B TTL cold-start
 * without competing with an in-flight user turn (heavy slot + busy checks).
 */
export async function warmLocalAiHeavy() {
  if (!browser) return
  if (isHeavyChatBusy()) return
  if (!(await pingGateway())) return
  if (isHeavyChatBusy()) return
  try {
    await withHeavyChatSlot(async () => {
      const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llm-fast',
          messages: [{ role: 'user', content: 'ok' }],
          chat_template_kwargs: { enable_thinking: false },
          max_tokens: 1,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(25000),
      })
      if (!res.ok) throw new Error(`warm_heavy ${res.status}`)
      await res.json().catch(() => null)
    })
  } catch {
    /* cold-start warm is best-effort */
  }
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
    { maxTokens: 32, allowFastFallback: false },
  )
  if (!title) return null
  return title.replaceAll(/["'「」《》。,]/g, '').slice(0, 24) || null
}

/**
 * 语音转写后处理:较长且缺标点的转写用小模型补标点断句。
 * 只在必要时调用(已有标点直接返回),防呆失败一律退回原文。
 * 英文转写用英文指令,避免被润色成中文。
 * @returns {Promise<string>}
 */
export async function polishTranscript(text) {
  const trimmed = text.trim()
  if (trimmed.length < 16 || /[。,.!?;；]/.test(trimmed)) return trimmed
  const zh = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length
  const en = (trimmed.match(/[A-Za-z]/g) || []).length
  const mostlyEn = en >= 8 && en >= zh
  const prompt = mostlyEn
    ? `Add punctuation and sentence breaks to this speech transcript. Do not change words, do not translate, output only the polished text:\n\n${trimmed.slice(0, 1000)}`
    : `给这段语音转写加上标点并合理断句。不要改动用字,不要翻译,不要增删内容,只输出处理后的文本:\n\n${trimmed.slice(0, 1000)}`
  const polished = await tinyComplete(prompt, {
    maxTokens: 1024,
    temperature: 0.1,
  })
  // 长度偏差过大说明模型自由发挥了,退回原文
  if (
    !polished ||
    Math.abs(polished.length - trimmed.length) > trimmed.length * 0.3
  ) {
    return trimmed
  }
  return polished
}
