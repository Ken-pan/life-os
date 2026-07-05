// AI 简报客户端：对 /api/ai/brief 的封装。
// 设计目标 —— 永远不让用户等待：
// - stale-while-revalidate：有缓存先用缓存，过期或数据变化时在后台静默重新生成；
// - 单飞（single-flight）：同一 kind 并发只发一次请求；
// - 失败退避：失败后一段时间内不自动重试（手动刷新不受限）；
// - 只缓存校验过的成功结果，不缓存错误/空响应；
// - 服务端未配置 key（501）时记为禁用，UI 整体隐藏。

import { getActiveLocale } from "../i18n/translate";

export interface AiText {
  text: string;
  generatedAt: number;
  fingerprint: string;
}

interface CacheEntry extends AiText {
  v: 1;
}

const CACHE_PREFIX = "finance_os_ai_v1:";
const FAIL_PREFIX = "finance_os_ai_fail_v1:";
const DISABLED_KEY = "finance_os_ai_disabled_v1";

/** 内容仍新鲜、无需重新生成的窗口。 */
export const SOFT_TTL_MS = 6 * 60 * 60 * 1000;
/** 数据指纹变化时允许重新生成的最小间隔（防止每记一笔就打一次模型）。 */
export const MIN_REGEN_INTERVAL_MS = 30 * 60 * 1000;
/** 失败后的自动重试冷却。 */
export const FAIL_COOLDOWN_MS = 10 * 60 * 1000;

const inflight = new Map<string, Promise<AiText | null>>();

function cacheKind(kind: string): string {
  return `${getActiveLocale()}:${kind}`;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 存储满/隐私模式时静默降级 */
  }
}

export function getCachedAiText(kind: string): AiText | null {
  const raw = safeGet(CACHE_PREFIX + cacheKind(kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed.v !== 1 || typeof parsed.text !== "string" || !parsed.text.trim()) return null;
    return { text: parsed.text, generatedAt: parsed.generatedAt, fingerprint: parsed.fingerprint };
  } catch {
    return null;
  }
}

/** 清除 AI 简报缓存（切换语言或手动刷新时使用）。 */
export function clearAiTextCache(kind?: string): void {
  try {
    if (kind) {
      for (const loc of ["zh-CN", "en-US"]) {
        localStorage.removeItem(CACHE_PREFIX + `${loc}:${kind}`);
        localStorage.removeItem(FAIL_PREFIX + `${loc}:${kind}`);
      }
      localStorage.removeItem(CACHE_PREFIX + kind);
      localStorage.removeItem(FAIL_PREFIX + kind);
      return;
    }
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX) || key?.startsWith(FAIL_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function isAiDisabled(): boolean {
  return safeGet(DISABLED_KEY) === "1";
}

/** 判断是否需要后台重新生成（纯函数，便于测试）。 */
export function shouldRegenerate(
  cached: AiText | null,
  fingerprint: string,
  now: number,
  lastFailAt: number | null
): boolean {
  if (lastFailAt != null && now - lastFailAt < FAIL_COOLDOWN_MS) return false;
  if (!cached) return true;
  const age = now - cached.generatedAt;
  if (cached.fingerprint !== fingerprint) return age >= MIN_REGEN_INTERVAL_MS;
  return age >= SOFT_TTL_MS;
}

function lastFailAt(kind: string): number | null {
  const raw = safeGet(FAIL_PREFIX + cacheKind(kind));
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

async function callProxy(system: string, user: string, maxTokens?: number): Promise<
  { ok: true; text: string } | { ok: false; disabled: boolean }
> {
  try {
    const res = await fetch("/api/ai/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user, maxTokens }),
    });
    if (res.status === 501) return { ok: false, disabled: true };
    if (!res.ok) return { ok: false, disabled: false };
    const data = (await res.json()) as { text?: unknown };
    if (typeof data.text !== "string" || !data.text.trim()) return { ok: false, disabled: false };
    return { ok: true, text: data.text.trim() };
  } catch {
    return { ok: false, disabled: false };
  }
}

export interface EnsureAiTextOptions {
  kind: string;
  system: string;
  user: string;
  fingerprint: string;
  maxTokens?: number;
  /** 手动刷新：跳过 TTL 与失败冷却（但仍单飞）。 */
  force?: boolean;
}

/**
 * 确保某类 AI 文本是（足够）新鲜的。
 * 返回最新可用的文本；无需重新生成时直接返回缓存；生成失败时回退到旧缓存（可能为 null）。
 */
export async function ensureAiText(opts: EnsureAiTextOptions): Promise<AiText | null> {
  const ck = cacheKind(opts.kind);
  const cached = getCachedAiText(opts.kind);
  if (isAiDisabled()) return cached;
  const now = Date.now();
  if (!opts.force && !shouldRegenerate(cached, opts.fingerprint, now, lastFailAt(opts.kind))) {
    return cached;
  }

  const existing = inflight.get(ck);
  if (existing) return existing;

  const task = (async (): Promise<AiText | null> => {
    const result = await callProxy(opts.system, opts.user, opts.maxTokens);
    if (!result.ok) {
      if (result.disabled) safeSet(DISABLED_KEY, "1");
      else safeSet(FAIL_PREFIX + ck, String(Date.now()));
      return cached;
    }
    const entry: CacheEntry = {
      v: 1,
      text: result.text,
      generatedAt: Date.now(),
      fingerprint: opts.fingerprint,
    };
    safeSet(CACHE_PREFIX + ck, JSON.stringify(entry));
    try {
      localStorage.removeItem(FAIL_PREFIX + ck);
    } catch {
      /* ignore */
    }
    return { text: entry.text, generatedAt: entry.generatedAt, fingerprint: entry.fingerprint };
  })();

  inflight.set(ck, task);
  try {
    return await task;
  } finally {
    inflight.delete(ck);
  }
}

/** 把模型输出的要点文本解析为条目（容忍 "- " "• " "1. " 等前缀）。 */
export function parseBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^[-•*]\s+|^\d+[.、)]\s*/, "").trim())
    .filter(Boolean);
}

export interface BriefSections {
  risk?: string;
  suggest?: string;
  anomaly?: string;
}

const SECTION_KEYS: Array<{ key: keyof BriefSections; prefix: RegExp }> = [
  { key: "risk", prefix: /^风险[：:]\s*(.*)$/ },
  { key: "suggest", prefix: /^建议[：:]\s*(.*)$/ },
  { key: "anomaly", prefix: /^异常[：:]\s*(.*)$/ },
  { key: "risk", prefix: /^Risk[：:]\s*(.*)$/i },
  { key: "suggest", prefix: /^Suggestion[：:]\s*(.*)$/i },
  { key: "anomaly", prefix: /^Anomaly[：:]\s*(.*)$/i },
];

function isEmptySection(value: string): boolean {
  const v = value.trim();
  return (
    !v ||
    v === "无" ||
    v === "暂无" ||
    v === "无明显异常" ||
    /^none$/i.test(v) ||
    /^no notable anomaly$/i.test(v)
  );
}

/** 解析三段式简报；无法识别时回退为 bullet 列表填入「建议」。 */
export function parseBriefSections(text: string): BriefSections {
  const sections: BriefSections = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const { key, prefix } of SECTION_KEYS) {
      const match = trimmed.match(prefix);
      if (match) {
        const body = match[1]?.trim() ?? "";
        if (!isEmptySection(body)) sections[key] = body;
        break;
      }
    }
  }

  const hasStructured = Boolean(sections.risk || sections.suggest || sections.anomaly);
  if (hasStructured) return sections;

  const bullets = parseBullets(text);
  if (bullets.length > 0) {
    return { suggest: bullets.slice(0, 3).join("；") };
  }
  return sections;
}

export interface AdvisorBriefData {
  heroConclusion?: {
    title?: string;
    reason?: string;
    riskLevel?: "低" | "中" | "中高" | "高" | string;
    suggestedAction?: string;
  };
  signals?: Array<{
    ticker: string;
    signal: "偏正面" | "偏负面" | "谨慎" | "动量强" | "不确定" | "中性" | string;
    reason: string;
    action: string;
  }>;
  suggestedActions?: Array<{
    type: "执行" | "等待" | "观察" | string;
    text: string;
  }>;
  confidenceScore?: number;
}

/**
 * 解析投资简报 JSON。容忍模型输出中混入的代码块围栏或前后缀文字：
 * 只取首个 "{" 到最后一个 "}" 之间的内容，并校验最小结构。
 */
export function parseAdvisorBriefData(text: string): AdvisorBriefData | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) return null;
    const data = parsed as AdvisorBriefData;
    const hasContent =
      data.heroConclusion != null ||
      (Array.isArray(data.signals) && data.signals.length > 0) ||
      (Array.isArray(data.suggestedActions) && data.suggestedActions.length > 0);
    return hasContent ? data : null;
  } catch {
    return null;
  }
}
