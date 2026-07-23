import { createMcpHandler } from '@life-os/mcp-server'
import {
  formatReadinessHint,
  formatRecentSessions,
  formatTodayTraining,
} from '../../server/mcpFitness.mjs'

/**
 * Fitness MCP —— AIOS 设置 → MCP → URL `https://training.kenos.space/api/mcp`
 * + Bearer = 用户 Life OS Supabase access_token。
 *
 * GYMS.MCP.1：今日训练 / 最近训练 / 恢复度粗提示。鉴权走 PLAT.MCP.0。
 */

export default createMcpHandler({
  name: 'fitness',
  auth: { appLabel: 'Fitness', schema: 'fitness' },
  tools: [
    {
      name: 'ping',
      description: '连通性自检，返回 Fitness MCP 标识',
      inputSchema: { type: 'object', properties: {} },
      handler() {
        return 'fitness MCP server ok'
      },
    },
    {
      name: 'today_training',
      description:
        '今日训练状态（是否开练、今日部位、最近一次）。用户问「今天练了吗」「今天练什么」时使用。',
      auth: true,
      inputSchema: { type: 'object', properties: {} },
      async handler(_args, { supabase }) {
        let data
        try {
          // RPC 在 public；client 默认 fitness schema 仍可调 public RPC
          const { data: row, error } = await supabase.rpc('portal_today_summary')
          if (error) throw new Error(error.message)
          data = row
        } catch (err) {
          return `读取今日训练失败：${err?.message ?? err}`
        }
        if (!data || data.ok === false) {
          return '读取今日训练失败：RPC 未返回有效数据。'
        }
        return formatTodayTraining(data.fitness)
      },
    },
    {
      name: 'recent_sessions',
      description:
        '最近若干次训练记录（日期 / 部位 / 是否完成）。用户问「这周练了几次」「最近练的什么」时使用。',
      auth: true,
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '条数，默认 7，最大 30',
          },
        },
      },
      async handler(args, { supabase }) {
        const limit = Math.min(Math.max(Number(args?.limit) || 7, 1), 30)
        let rows
        try {
          const { data, error } = await supabase
            .from('fitness_workout_sessions')
            .select('session_date, day_id, started_at, ended_at')
            .order('session_date', { ascending: false })
            .limit(limit)
          if (error) throw new Error(error.message)
          rows = data
        } catch (err) {
          return `读取训练记录失败：${err?.message ?? err}`
        }
        return formatRecentSessions(rows, { limit })
      },
    },
    {
      name: 'readiness_hint',
      description:
        '根据近窗带 RIR 的组，粗估今日恢复度（偏疲劳 / 正常 / 充分）。用户问「今天状态怎么样」「该减量吗」时使用。',
      auth: true,
      inputSchema: { type: 'object', properties: {} },
      async handler(_args, { supabase }) {
        let logs
        try {
          const since = new Date()
          since.setUTCDate(since.getUTCDate() - 10)
          const sinceIso = since.toISOString().slice(0, 10)
          const { data: sessions, error: sErr } = await supabase
            .from('fitness_workout_sessions')
            .select('id')
            .gte('session_date', sinceIso)
            .order('session_date', { ascending: false })
            .limit(20)
          if (sErr) throw new Error(sErr.message)
          const ids = (sessions ?? []).map((s) => s.id).filter(Boolean)
          if (!ids.length) return formatReadinessHint([])
          const { data, error } = await supabase
            .from('fitness_exercise_logs')
            .select('sets, done')
            .in('session_id', ids)
            .gt('done', 0)
          if (error) throw new Error(error.message)
          logs = data
        } catch (err) {
          return `读取恢复度失败：${err?.message ?? err}`
        }
        return formatReadinessHint(logs)
      },
    },
  ],
})

export const config = { path: '/api/mcp' }
