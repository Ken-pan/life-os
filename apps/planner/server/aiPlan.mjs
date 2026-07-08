const KIMI_ENDPOINT = 'https://api.moonshot.ai/v1/chat/completions';
const MODEL = 'kimi-k2.5';
const MAX_PROMPT_CHARS = 24_000;
const MAX_OUTPUT_TOKENS = 1_200;
const UPSTREAM_TIMEOUT_MS = 60_000;

/**
 * @param {string|undefined} apiKey
 * @param {unknown} payload
 * @param {{ origin?: string|null, referer?: string|null }} [meta]
 */
export async function handleAiPlan(apiKey, payload, meta = {}) {
  if (!apiKey) {
    return { status: 501, body: { error: 'not_configured' } };
  }

  const allowed = (process.env.AI_ALLOWED_ORIGINS || 'localhost,127.0.0.1,netlify.app,kenos.space')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = meta.origin || meta.referer || '';
  if (origin && !allowed.some((host) => origin.includes(host))) {
    return { status: 403, body: { error: 'forbidden_origin' } };
  }
  const p = payload ?? {};
  const system = typeof p.system === 'string' ? p.system : '';
  const user = typeof p.user === 'string' ? p.user : '';
  if (!user.trim() || system.length + user.length > MAX_PROMPT_CHARS) {
    return { status: 400, body: { error: 'bad_prompt' } };
  }
  const maxTokens = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(64, typeof p.maxTokens === 'number' ? Math.floor(p.maxTokens) : 600)
  );

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(KIMI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        thinking: { type: 'disabled' },
        temperature: 0.6,
        max_tokens: maxTokens,
        stream: false
      }),
      signal: controller.signal
    });
    if (!upstream.ok) {
      return { status: 502, body: { error: 'upstream_error', upstreamStatus: upstream.status } };
    }
    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      return { status: 502, body: { error: 'empty_completion' } };
    }
    return { status: 200, body: { text: text.trim(), model: MODEL } };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { status: 504, body: { error: aborted ? 'upstream_timeout' : 'upstream_unreachable' } };
  } finally {
    clearTimeout(timer);
  }
}
