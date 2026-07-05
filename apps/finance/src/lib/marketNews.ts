// 个股新闻：Google News 公开 RSS（无需 API key），经 /api/news 代理绕过 CORS。
// 结果缓存 30 分钟；拉取失败时静默降级为空列表（UI 显示搜索链接兜底）。

export interface NewsItem {
  symbol: string;
  title: string;
  link: string;
  source?: string;
  /** 毫秒时间戳；解析失败为 0。 */
  publishedTs: number;
}

const CACHE_PREFIX = "finance_os_market_news_v1:";
const CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  items: NewsItem[];
}

function readCache(symbol: string): NewsItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + symbol);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return Array.isArray(entry.items) ? entry.items : null;
  } catch {
    return null;
  }
}

function writeCache(symbol: string, items: NewsItem[]): void {
  try {
    localStorage.setItem(CACHE_PREFIX + symbol, JSON.stringify({ fetchedAt: Date.now(), items }));
  } catch {
    // 忽略存储异常。
  }
}

export function parseRssItems(xml: string, symbol: string, limit: number): NewsItem[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) return [];
  const items: NewsItem[] = [];
  for (const node of doc.querySelectorAll("item")) {
    const title = node.querySelector("title")?.textContent?.trim();
    const link = node.querySelector("link")?.textContent?.trim();
    if (!title || !link) continue;
    const pub = node.querySelector("pubDate")?.textContent?.trim();
    const ts = pub ? Date.parse(pub) : NaN;
    items.push({
      symbol,
      title,
      link,
      source: node.querySelector("source")?.textContent?.trim() || undefined,
      publishedTs: Number.isFinite(ts) ? ts : 0,
    });
    if (items.length >= limit) break;
  }
  return items;
}

async function fetchSymbolNews(symbol: string, limit: number): Promise<NewsItem[]> {
  const cached = readCache(symbol);
  if (cached) return cached.slice(0, limit);
  try {
    const endpoint = `/api/news/rss/search?q=${encodeURIComponent(`${symbol} stock`)}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(endpoint);
    if (!response.ok) return [];
    const items = parseRssItems(await response.text(), symbol, limit);
    writeCache(symbol, items);
    return items;
  } catch {
    return [];
  }
}

/** 拉取多只标的的新闻，按发布时间倒序合并去重。 */
export async function fetchNewsForSymbols(
  symbols: string[],
  perSymbol = 4
): Promise<NewsItem[]> {
  const uniq = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 6);
  const lists = await Promise.all(uniq.map((s) => fetchSymbolNews(s, perSymbol)));
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const item of lists.flat()) {
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    merged.push(item);
  }
  return merged.sort((a, b) => b.publishedTs - a.publishedTs);
}

/** 兜底：某标的的新闻搜索链接（拉取失败时仍给用户一条出路）。 */
export function newsSearchUrl(symbol: string): string {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/news`;
}
