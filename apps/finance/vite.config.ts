import { defineConfig, type Plugin } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { handleKimiBrief } from "./server/kimiBrief";

const STOOQ_BATCH_CONCURRENCY = 4;

function symbolsFromReqUrl(url: string | undefined): string[] {
  if (!url) return [];
  const q = url.indexOf("?");
  if (q < 0) return [];
  for (const part of url.slice(q + 1).split("&")) {
    if (!part.startsWith("symbols=")) continue;
    return decodeURIComponent(part.slice("symbols=".length).replace(/\+/g, " "))
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
  return [];
}

function stooqBatchPlugin(): Plugin {
  return {
    name: "stooq-batch",
    configureServer(server) {
      server.middlewares.use("/api/stooq-batch", async (req, res) => {
        try {
          const symbols = symbolsFromReqUrl((req as { url?: string }).url);
          const out: Record<string, { symbol: string; price: number; date: string; time: string }> =
            {};
          let i = 0;
          const workers = Array.from(
            { length: Math.min(STOOQ_BATCH_CONCURRENCY, Math.max(symbols.length, 1)) },
            async () => {
              while (i < symbols.length) {
                const sym = symbols[i++];
                const ticker = sym.toLowerCase();
                const endpoint = `https://stooq.com/q/l/?s=${encodeURIComponent(`${ticker}.us`)}&i=d`;
                const response = await fetch(endpoint);
                if (!response.ok) continue;
                const body = await response.text();
                const line = body
                  .trim()
                  .split("\n")
                  .map((x: string) => x.trim())
                  .find((x: string) => x.includes(",20"));
                if (!line) continue;
                const parts = line.split(",");
                if (parts.length < 7) continue;
                const price = Number(parts[6]);
                if (!Number.isFinite(price)) continue;
                out[sym] = {
                  symbol: sym,
                  price,
                  date: parts[1],
                  time: parts[2],
                };
              }
            }
          );
          await Promise.all(workers);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(out));
        } catch {
          res.statusCode = 502;
          res.end(JSON.stringify({}));
        }
      });
    },
  };
}

// 开发环境的 Kimi AI 代理（生产由 netlify/functions/ai-brief.mts 承接同一路径）。
function kimiBriefPlugin(apiKey: string | undefined): Plugin {
  return {
    name: "kimi-ai-brief",
    configureServer(server) {
      server.middlewares.use("/api/ai/brief", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }
        let raw = "";
        req.on("data", (chunk: Buffer) => {
          raw += chunk.toString("utf8");
        });
        req.on("end", () => {
          void (async () => {
            let payload: unknown;
            try {
              payload = JSON.parse(raw || "{}");
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "bad_json" }));
              return;
            }
            const result = await handleKimiBrief(apiKey, payload);
            res.statusCode = result.status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result.body));
          })();
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    stooqBatchPlugin(),
    // 第三参传 "" 以读取不带 VITE_ 前缀的服务端变量（不会注入到客户端代码）。
    kimiBriefPlugin(loadEnv(mode, process.cwd(), "").KIMI_API_KEY),
  ],
  server: {
    proxy: {
      "/api/stooq": {
        target: "https://stooq.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/stooq/, ""),
      },
      "/api/news": {
        target: "https://news.google.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/news/, ""),
      },
      "/api/ychart": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ychart/, ""),
        // Yahoo 对常见 Headless/完整 Chrome UA 返回 429，固定为简短 UA。
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
}));
