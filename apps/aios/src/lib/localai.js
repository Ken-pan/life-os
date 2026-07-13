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
  }
  if (spec.thinkingSwitch) {
    body.chat_template_kwargs = { enable_thinking: Boolean(thinking) }
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
    if (message?.reasoning_content) onDelta?.({ reasoning: message.reasoning_content })
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

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
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
        if (delta.content || delta.reasoning_content) {
          onDelta?.({
            content: delta.content || undefined,
            reasoning: delta.reasoning_content || undefined,
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

export const TTS_MODEL = 'mlx-community/Kokoro-82M-bf16'

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
 * 文本转语音(Kokoro,本地)。返回 wav Blob。
 * @param {string} text
 * @returns {Promise<Blob>}
 */
export async function speak(text) {
  // Kokoro 单线程壳:长文本合成分钟级且会阻塞队列,朗读取前 400 字
  const input = text.slice(0, 400)
  const langCode = /[一-鿿]/.test(input) ? 'z' : 'a'
  const res = await fetchWithColdRetry(() =>
    fetch(`${GATEWAY}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TTS_MODEL, input, lang_code: langCode }),
      signal: AbortSignal.timeout(180000),
    }),
  )
  if (!res.ok) throw new Error(`tts ${res.status}`)
  return await res.blob()
}

/**
 * 用 llm-fast 给对话起一个短标题(fire-and-forget,失败静默)。
 * @returns {Promise<string | null>}
 */
export async function generateTitle(userText, assistantText, locale = 'zh') {
  const instruction =
    locale === 'zh'
      ? '用不超过 12 个字概括这段对话的主题,只输出标题本身,不要标点和引号。'
      : 'Summarize the topic of this conversation in at most 6 words. Output only the title, no quotes or punctuation.'
  try {
    const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llm-fast',
        messages: [
          {
            role: 'user',
            content: `${instruction}\n\n用户: ${userText.slice(0, 500)}\n助手: ${assistantText.slice(0, 500)}`,
          },
        ],
        chat_template_kwargs: { enable_thinking: false },
        max_tokens: 32,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const title = json.choices?.[0]?.message?.content?.trim()
    if (!title) return null
    return title.replaceAll(/["'「」《》。,]/g, '').slice(0, 24) || null
  } catch {
    return null
  }
}
