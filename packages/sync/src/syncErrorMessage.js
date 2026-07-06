/**
 * 将 Supabase / fetch 等原始错误映射为可展示的本地化文案。
 * 各 app 传入已翻译的 labels；未知短句保留原文，空串走 fallback。
 *
 * @param {unknown} err
 * @param {{ network: string, rateLimit: string, fallback: string, schemaCache?: string }} labels
 */
export function formatSyncErrorMessage(err, labels) {
  const msg = (typeof err === 'string' ? err : err?.message || '').trim();
  if (!msg) return labels.fallback;
  if (/rate limit|too many requests/i.test(msg)) return labels.rateLimit;
  if (/network|fetch|failed to fetch|networkerror/i.test(msg)) return labels.network;
  if (labels.schemaCache && /schema cache|PGRST002/i.test(msg)) return labels.schemaCache;
  return msg;
}
