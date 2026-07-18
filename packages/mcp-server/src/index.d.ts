import type { SupabaseClient } from '@supabase/supabase-js'

export interface McpToolContext {
  request: Request
  /** 仅 auth 工具：请求里的用户 JWT。 */
  jwt?: string
  /** 仅 auth 工具：作用于该 JWT 的 Supabase 客户端（RLS 逐用户）。 */
  supabase?: SupabaseClient
}

export type McpToolHandler = (
  args: Record<string, unknown>,
  ctx: McpToolContext,
) => string | object | Promise<string | object>

export interface McpTool {
  /** 工具名，仅 [a-zA-Z0-9_-]（会拼进 AIOS 的桥接函数名） */
  name: string
  description?: string
  /** JSON Schema，描述 arguments */
  inputSchema?: object
  /** true = 调用前要求 Bearer JWT；无则回统一「未登录」提示，有则注入 ctx.supabase。 */
  auth?: boolean
  handler: McpToolHandler
}

export interface McpAuthOptions {
  /** 展示用 app 名，用于「未登录」提示（如 'Home' / 'Planner'）。 */
  appLabel?: string
  /** 默认 schema，定到某个 app 库（如 Home 的 'home'）；缺省走 public。 */
  schema?: string
}

export interface CreateMcpHandlerOptions {
  name?: string
  version?: string
  tools?: McpTool[]
  /** 声明式鉴权配置；工具打 auth:true 即启用。 */
  auth?: McpAuthOptions
}

/** 返回一个 Web Fetch 处理器：(Request) => Promise<Response>，可直接作 Netlify Function v2 default export。 */
export function createMcpHandler(
  options: CreateMcpHandlerOptions,
): (request: Request) => Promise<Response>
