export interface McpToolContext {
  request: Request
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
  handler: McpToolHandler
}

export interface CreateMcpHandlerOptions {
  name?: string
  version?: string
  tools?: McpTool[]
}

/** 返回一个 Web Fetch 处理器：(Request) => Promise<Response>，可直接作 Netlify Function v2 default export。 */
export function createMcpHandler(
  options: CreateMcpHandlerOptions,
): (request: Request) => Promise<Response>
