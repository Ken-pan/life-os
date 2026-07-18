import { createMcpHandler } from '@life-os/mcp-server'
import {
  formatLiquidCash,
  formatMonthSummary,
  isTimezone,
  summarizeLiquidCash,
} from '../../server/mcpFinance.mjs'

/**
 * Finance MCP —— AIOS 设置 → MCP → URL `https://finance.kenos.space/api/mcp`
 * + Bearer = 用户 Life OS Supabase access_token（与云同步同一 JWT）。
 *
 * FINC.MCP.1：查本月支出/结余 + 流动现金。鉴权走 @life-os/mcp-server（PLAT.MCP.0）。
 * STS（放心花）仍以客户端引擎为准，本面不冒充。
 */

export default createMcpHandler({
  name: 'finance',
  auth: { appLabel: 'Finance' },
  tools: [
    {
      name: 'ping',
      description: '连通性自检，返回 Finance MCP 标识',
      inputSchema: { type: 'object', properties: {} },
      handler() {
        return 'finance MCP server ok'
      },
    },
    {
      name: 'month_summary',
      description:
        '本月财务汇总：支出、收入、结余（与 Portal 今日摘要同源）。用户问「这个月花了多少」「本月结余多少」时使用。',
      auth: true,
      inputSchema: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description:
              'IANA 时区（可选，如 America/Los_Angeles），校正「本月」边界；默认服务器/RPC 默认时区',
          },
        },
      },
      async handler(args, { supabase }) {
        const tz = isTimezone(args?.timezone) ? String(args.timezone).trim() : null
        let data
        try {
          const rpc = tz
            ? supabase.rpc('portal_today_summary', { p_timezone: tz })
            : supabase.rpc('portal_today_summary')
          const { data: row, error } = await rpc
          if (error) throw new Error(error.message)
          data = row
        } catch (err) {
          return `读取本月汇总失败：${err?.message ?? err}`
        }
        if (!data || data.ok === false) {
          return '读取本月汇总失败：RPC 未返回有效数据。'
        }
        return formatMonthSummary(data.finance, {
          label: tz || undefined,
        })
      },
    },
    {
      name: 'liquid_cash',
      description:
        '流动现金合计（checking/savings 账户余额）。用户问「手头有多少现金」「活期余额」时使用。不是「放心花/STS」。',
      auth: true,
      inputSchema: { type: 'object', properties: {} },
      async handler(_args, { supabase }) {
        let rows
        try {
          const { data, error } = await supabase
            .from('finance_accounts')
            .select('name, type, balance, liquid')
          if (error) throw new Error(error.message)
          rows = data
        } catch (err) {
          return `读取账户失败：${err?.message ?? err}`
        }
        return formatLiquidCash(summarizeLiquidCash(rows))
      },
    },
  ],
})

export const config = { path: '/api/mcp' }
