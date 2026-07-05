// Kimi (Moonshot) 聊天补全代理的共享实现。
// 被两个入口复用：Vite 开发中间件（vite.config.ts）与 Netlify Function（netlify/functions/ai-brief.mts）。
// API key 只存在于服务端环境变量，永远不进前端 bundle。

const KIMI_ENDPOINT = "https://api.moonshot.ai/v1/chat/completions";
const MODEL = "kimi-k2.5";
// 单次请求的 prompt 总长度上限（防滥用/防误传大 payload）。
const MAX_PROMPT_CHARS = 24_000;
const MAX_OUTPUT_TOKENS = 1_200;
const UPSTREAM_TIMEOUT_MS = 60_000;

export interface KimiBriefResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * 处理一次简报生成请求。payload 期望形如 { system?: string, user: string, maxTokens?: number }。
 * 返回 { status, body }，由各入口自行序列化为 HTTP 响应。
 */
export async function handleKimiBrief(
  apiKey: string | undefined,
  payload: unknown
): Promise<KimiBriefResult> {
  if (!apiKey) {
    return { status: 501, body: { error: "not_configured" } };
  }
  const p = (payload ?? {}) as { system?: unknown; user?: unknown; maxTokens?: unknown };
  const system = typeof p.system === "string" ? p.system : "";
  const user = typeof p.user === "string" ? p.user : "";
  if (!user.trim() || system.length + user.length > MAX_PROMPT_CHARS) {
    return { status: 400, body: { error: "bad_prompt" } };
  }
  const maxTokens = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(64, typeof p.maxTokens === "number" ? Math.floor(p.maxTokens) : 600)
  );

  const messages: Array<{ role: string; content: string }> = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(KIMI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        // kimi-k2.5 非思考模式的固定推荐参数：temperature 0.6 / top_p 0.95。
        thinking: { type: "disabled" },
        temperature: 0.6,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      return { status: 502, body: { error: "upstream_error", upstreamStatus: upstream.status } };
    }
    const data = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      return { status: 502, body: { error: "empty_completion" } };
    }
    return { status: 200, body: { text: text.trim(), model: MODEL } };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { status: 504, body: { error: aborted ? "upstream_timeout" : "upstream_unreachable" } };
  } finally {
    clearTimeout(timer);
  }
}
