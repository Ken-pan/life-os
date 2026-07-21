const KIMI_ENDPOINT = 'https://api.moonshot.ai/v1/chat/completions'
const MAX_MESSAGES = 80
const MAX_PROMPT_CHARS = 120_000
const MAX_OUTPUT_TOKENS = 8192
const UPSTREAM_TIMEOUT_MS = 180_000

/** UI / local model ids → Moonshot model ids */
export const KIMI_MODEL_MAP = {
  'llm-fast': 'kimi-k2.5',
  'llm-quality': 'kimi-k2.6',
  'vlm-fast': 'kimi-k2.5',
  'vlm-quality': 'kimi-k2.6',
  'kimi-k2.5': 'kimi-k2.5',
  'kimi-k2.6': 'kimi-k2.6',
}

const ALLOWED_KIMI_MODELS = new Set(['kimi-k2.5', 'kimi-k2.6'])

/**
 * @param {string|undefined} model
 * @returns {string|null}
 */
export function mapToKimiModel(model) {
  const id = typeof model === 'string' ? model.trim() : ''
  const mapped = KIMI_MODEL_MAP[id] ?? null
  if (!mapped || !ALLOWED_KIMI_MODELS.has(mapped)) return null
  return mapped
}

/**
 * @param {string} origin
 * @param {string} [allowedCsv]
 */
export function isAllowedOrigin(origin, allowedCsv) {
  const allowed = (allowedCsv || 'localhost,127.0.0.1,netlify.app,kenos.space')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!origin) return true
  return allowed.some((host) => origin.includes(host))
}

/**
 * Sanitize client payload into a Moonshot chat/completions body (stream).
 * @param {unknown} payload
 * @returns {{ ok: true, body: object } | { ok: false, status: number, error: string }}
 */
export function buildKimiUpstreamBody(payload) {
  const p = payload && typeof payload === 'object' ? payload : {}
  const model = mapToKimiModel(/** @type {{ model?: string }} */ (p).model)
  if (!model) {
    return { ok: false, status: 400, error: 'bad_model' }
  }

  const messages = Array.isArray(
    /** @type {{ messages?: unknown }} */ (p).messages,
  )
    ? /** @type {{ messages: unknown[] }} */ (p).messages
    : null
  if (!messages?.length || messages.length > MAX_MESSAGES) {
    return { ok: false, status: 400, error: 'bad_messages' }
  }

  let charCount = 0
  for (const m of messages) {
    if (!m || typeof m !== 'object') {
      return { ok: false, status: 400, error: 'bad_messages' }
    }
    const role = /** @type {{ role?: string }} */ (m).role
    if (!['system', 'user', 'assistant', 'tool'].includes(String(role))) {
      return { ok: false, status: 400, error: 'bad_messages' }
    }
    const content = /** @type {{ content?: unknown }} */ (m).content
    if (typeof content === 'string') charCount += content.length
    else if (Array.isArray(content)) {
      for (const part of content) {
        if (part && typeof part === 'object' && part.type === 'image_url') {
          return { ok: false, status: 400, error: 'vision_unsupported' }
        }
        if (part && typeof part === 'object' && typeof part.text === 'string') {
          charCount += part.text.length
        }
      }
    } else if (content != null) {
      return { ok: false, status: 400, error: 'bad_messages' }
    }
  }
  if (charCount > MAX_PROMPT_CHARS) {
    return { ok: false, status: 400, error: 'bad_prompt' }
  }

  const rawMax = /** @type {{ max_tokens?: unknown, maxTokens?: unknown }} */ (
    p
  )
  const maxTokens = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(
      64,
      typeof rawMax.max_tokens === 'number'
        ? Math.floor(rawMax.max_tokens)
        : typeof rawMax.maxTokens === 'number'
          ? Math.floor(rawMax.maxTokens)
          : 4096,
    ),
  )

  // kimi-k2.5 / k2.6 currently reject non-0.6 temperature ("only 0.6 is allowed").
  const temperature = 0.6

  const thinkingEnabled = Boolean(
    /** @type {{ thinking?: unknown }} */ (p).thinking === true ||
    /** @type {{ thinking?: { type?: string } }} */ (p).thinking?.type ===
      'enabled',
  )

  /** @type {Record<string, unknown>} */
  const body = {
    model,
    messages,
    stream: true,
    temperature,
    max_tokens: maxTokens,
    thinking: { type: thinkingEnabled ? 'enabled' : 'disabled' },
  }

  const tools = /** @type {{ tools?: unknown }} */ (p).tools
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools.slice(0, 32)
  }

  return { ok: true, body }
}

/**
 * @param {string|undefined} apiKey
 * @param {unknown} payload
 * @param {{ origin?: string|null, referer?: string|null, fetchImpl?: typeof fetch }} [meta]
 * @returns {Promise<
 *   | { kind: 'json', status: number, body: object }
 *   | { kind: 'stream', status: number, headers: Record<string, string>, body: ReadableStream }
 * >}
 */
export async function handleAiChat(apiKey, payload, meta = {}) {
  if (!apiKey) {
    return { kind: 'json', status: 501, body: { error: 'not_configured' } }
  }

  const origin = meta.origin || meta.referer || ''
  if (!isAllowedOrigin(origin, globalThis.process?.env?.AI_ALLOWED_ORIGINS)) {
    return { kind: 'json', status: 403, body: { error: 'forbidden_origin' } }
  }

  const built = buildKimiUpstreamBody(payload)
  if (!built.ok) {
    return { kind: 'json', status: built.status, body: { error: built.error } }
  }

  const fetchImpl = meta.fetchImpl ?? globalThis.fetch
  const controller = new AbortController()
  // Bound time-to-first-byte only — long streams must not be killed mid-token.
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const upstream = await fetchImpl(KIMI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(built.body),
      signal: controller.signal,
    })

    // Headers/body arrived — release TTFB timer so generation can continue.
    clearTimeout(timer)

    if (!upstream.ok || !upstream.body) {
      let upstreamMessage = ''
      try {
        const errText = await upstream.text()
        try {
          const errJson = JSON.parse(errText)
          upstreamMessage = String(
            errJson?.error?.message || errJson?.message || '',
          ).slice(0, 200)
        } catch {
          upstreamMessage = errText.slice(0, 200)
        }
      } catch {
        /* ignore */
      }
      return {
        kind: 'json',
        status: 502,
        body: {
          error: 'upstream_error',
          upstreamStatus: upstream.status,
          upstreamMessage: upstreamMessage || undefined,
        },
      }
    }

    const contentType = upstream.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream')) {
      const data = await upstream.json()
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          c.enqueue(encoder.encode('data: [DONE]\n\n'))
          c.close()
        },
      })
      return {
        kind: 'stream',
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        body: stream,
      }
    }

    return {
      kind: 'stream',
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: upstream.body,
    }
  } catch (e) {
    clearTimeout(timer)
    const aborted = e instanceof Error && e.name === 'AbortError'
    return {
      kind: 'json',
      status: 504,
      body: { error: aborted ? 'upstream_timeout' : 'upstream_unreachable' },
    }
  }
}
