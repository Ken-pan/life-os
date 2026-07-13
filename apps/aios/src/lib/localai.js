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
    // 低延迟对话必须关思考,否则先输出数百 token 推理
    chatTemplateKwargs: { enable_thinking: false },
  },
  {
    id: 'llm-quality',
    nameKey: 'model.qualityName',
    descKey: 'model.qualityDesc',
    chatTemplateKwargs: null,
  },
]

export const DEFAULT_MODEL = 'llm-fast'

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
 * 流式对话。逐段 yield {content?, reasoning?}。
 * @param {{
 *   model: string,
 *   messages: Array<{role: string, content: string}>,
 *   signal?: AbortSignal,
 * }} options
 */
export async function* streamChat({ model, messages, signal }) {
  const spec = modelById(model)
  const body = {
    model: spec.id,
    messages,
    stream: true,
    max_tokens: 4096,
  }
  if (spec.chatTemplateKwargs) body.chat_template_kwargs = spec.chatTemplateKwargs

  const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`gateway ${res.status}`)
  }

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
        const delta = json.choices?.[0]?.delta
        if (!delta) continue
        const chunk = {}
        if (delta.content) chunk.content = delta.content
        if (delta.reasoning_content) chunk.reasoning = delta.reasoning_content
        if (chunk.content || chunk.reasoning) yield chunk
      }
    }
  } finally {
    reader.releaseLock()
  }
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
