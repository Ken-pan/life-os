/**
 * LocalAI 网关客户端(llama-swap · OpenAI 兼容)。
 * 网关按 model 字段自动拉起/卸载模型,首个请求会等到模型就绪。
 * 合同见 local-ai/docs/CONSUMING.md。
 */

export const GATEWAY = 'http://127.0.0.1:18888'

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

/** @returns {Promise<boolean>} 网关是否可达 */
export async function pingGateway() {
  try {
    const res = await fetch(`${GATEWAY}/v1/models`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
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
  onDelta,
}) {
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
  }
  if (spec.thinkingSwitch) {
    body.chat_template_kwargs = { enable_thinking: Boolean(thinking) }
    if (thinking) {
      // 思考模式按官方推荐锁定采样(temp 0.6 / top_p 0.95),并加轻度重复惩罚:
      // 实测该模型思考通道会陷入整句复读循环直到烧光 token,这组参数显著降低发生率
      body.temperature = Math.min(temperature, 0.6)
      body.top_p = 0.95
      body.repetition_penalty = 1.05
      body.repetition_context_size = 512
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
          generated += (delta.reasoning_content || delta.reasoning || '') + (delta.content || '')
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
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
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

/**
 * 文本转语音(Qwen3-TTS CustomVoice,本地)。返回 wav Blob。
 * instruct 是自然语言风格指令,决定语气/情绪/语速——按文本语言选中英文指令。
 * @param {string} text
 * @param {string} [voice]
 * @returns {Promise<Blob>}
 */
export async function speak(text, voice = DEFAULT_TTS_VOICE) {
  // 语音壳单推理线程:超长文本会阻塞队列,朗读取前 600 字
  const input = text.slice(0, 600)
  const zh = /[一-鿿]/.test(input)
  const res = await fetchWithColdRetry(() =>
    fetch(`${GATEWAY}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TTS_MODEL,
        input,
        voice,
        instruct: zh
          ? '用轻松自然的语气说话,像朋友之间日常聊天,语速适中。'
          : 'Speak in a relaxed, natural conversational tone, like chatting with a friend.',
      }),
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
  if (!polished || Math.abs(polished.length - trimmed.length) > trimmed.length * 0.3) {
    return trimmed
  }
  return polished
}
