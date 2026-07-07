// Netlify Function：Kimi (Moonshot) AI 简报代理。
// 生产环境需在 Netlify 站点环境变量里配置 KIMI_API_KEY。
// 自定义路径 /api/ai/brief 与本地 Vite 开发中间件保持一致（见 vite.config.ts）。

import { handleKimiBrief } from "../../server/kimiBrief";
import { readKimiApiKey } from "../../server/runtimeEnv";

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const result = await handleKimiBrief(readKimiApiKey(), payload);
  return Response.json(result.body, { status: result.status });
};

export const config = { path: "/api/ai/brief" };
