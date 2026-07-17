/**
 * 本地工具执行器（无网络 / 无 $lib）。STABLE.26 tool-loop smoke。
 */

/** webAccess=false 时应隐藏的内置工具 */
export const WEB_GATED_TOOL_KEYS = ['fetch_url', 'web_search']

/** 始终本地可跑、不依赖网关/记忆/Life OS 的工具 */
export const LOCAL_PURE_TOOL_KEYS = ['get_time', 'calculate', 'run_javascript']

/**
 * @param {Array<{ key: string, web?: boolean }>} entries
 * @param {{ webAccess?: boolean }} opts
 */
export function filterBuiltinToolEntries(entries, { webAccess = true } = {}) {
  return entries.filter((t) => (t.web ? webAccess : true))
}

/**
 * 安全计算数学表达式（白名单字符 + 大整数 BigInt）。
 * @param {string} expression
 */
export function safeCalculate(expression) {
  const expr = String(expression).trim().slice(0, 500)
  const stripped = expr.replaceAll(/Math\.[a-zA-Z]+/g, '')
  if (!/^[\d\s+\-*/%().,eE]*$/.test(stripped)) {
    throw new Error('表达式包含不允许的字符')
  }
  if (/^[\d\s+\-*()]+$/.test(expr)) {
    try {
      const bigExpr = expr.replaceAll(/\d+/g, (n) => `${n}n`)
      const value = new Function(`"use strict"; return (${bigExpr})`)()
      if (typeof value === 'bigint') return value
    } catch {
      /* 溢出/语法问题时退回 float */
    }
  }
  const value = new Function('Math', `"use strict"; return (${expr})`)(Math)
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw new Error('结果不是数字')
  }
  return value
}

/** @param {string} expression @param {string | number | bigint} value */
export function formatCalculateResult(expression, value) {
  return `${expression} = ${value}`
}
