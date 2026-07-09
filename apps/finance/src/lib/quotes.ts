export type { LiveQuote } from '@life-os/finance-core/quotes/types';
import type { LiveQuote } from '@life-os/finance-core/quotes/types';

function parseStooqLine(line: string): LiveQuote | null {
  const parts = line.split(",");
  if (parts.length < 7) return null;
  const [rawSymbol, date, time, _open, _high, _low, close] = parts;
  if (!date?.includes("20")) return null;
  const price = Number(close);
  if (!Number.isFinite(price)) return null;
  return {
    symbol: rawSymbol.replace(".US", "").toUpperCase(),
    price,
    date,
    time,
  };
}

function parseStooqCsv(csv: string): LiveQuote | null {
  const line = csv
    .trim()
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .find((x) => x.includes(",20"));
  if (!line) return null;
  return parseStooqLine(line);
}

export async function fetchLiveQuote(symbol: string): Promise<LiveQuote | null> {
  const ticker = symbol.trim().toLowerCase();
  if (!ticker) return null;
  const endpoint = `/api/stooq/q/l/?s=${encodeURIComponent(`${ticker}.us`)}&i=d`;
  const response = await fetch(endpoint, { method: "GET" });
  if (!response.ok) return null;
  const body = await response.text();
  return parseStooqCsv(body);
}

const BATCH_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** 浏览器侧一次请求；开发服务器会合并为限并发 Stooq 拉取。 */
export async function fetchLiveQuotes(symbols: string[]): Promise<Record<string, LiveQuote>> {
  const uniq = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (uniq.length === 0) return {};
  if (uniq.length === 1) {
    const quote = await fetchLiveQuote(uniq[0]);
    return quote ? { [quote.symbol]: quote } : {};
  }

  try {
    const endpoint = `/api/stooq-batch?symbols=${encodeURIComponent(uniq.join(","))}`;
    const response = await fetch(endpoint, { method: "GET" });
    if (response.ok) {
      const payload = (await response.json()) as Record<string, LiveQuote>;
      if (payload && typeof payload === "object") return payload;
    }
  } catch {
    // 生产构建无 batch 中间层时回退逐只拉取。
  }

  const quotes = await mapWithConcurrency(uniq, BATCH_CONCURRENCY, async (symbol) => {
    try {
      return await fetchLiveQuote(symbol);
    } catch {
      return null;
    }
  });
  const out: Record<string, LiveQuote> = {};
  for (const q of quotes) {
    if (q) out[q.symbol] = q;
  }
  return out;
}
