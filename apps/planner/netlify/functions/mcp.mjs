import { createClient } from '@supabase/supabase-js';
import { createMcpHandler } from '@life-os/mcp-server';
import { LIFE_OS_SUPABASE_URL, LIFE_OS_SUPABASE_PUBLISHABLE_KEY } from '@life-os/sync';
import {
  buildTask,
  selectTasks,
  completeTask,
  findTaskToComplete,
  formatTaskLine,
  isToday,
  isIsoDate,
  newTaskId,
} from '../../server/mcpTasks.mjs';

/**
 * Planner MCP —— AIOS 设置 → MCP → URL `https://planner.kenos.space/api/mcp`
 * + Bearer = 用户 Life OS Supabase access_token（与云同步同一 JWT）。
 *
 * 让 AIOS（推理内核）能看/建/完成你的任务。写的是你自己的 `planner_tasks`
 * （经你的 JWT + RLS），行形状与客户端 LWW 同步一致 → 就像另一台设备的改动，
 * Planner 下次同步自然合并（见 apps/planner/src/lib/repo.js buildTaskSyncRows）。
 */

const NEED_LOGIN =
  '需要登录：请在 AIOS 设置 → MCP 为 Planner server 配置 Life OS access token。';

function jwtFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function plannerClient(jwt) {
  return createClient(LIFE_OS_SUPABASE_URL, LIFE_OS_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadTasks(sb) {
  const { data, error } = await sb.from('planner_tasks').select('data');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.data).filter(Boolean);
}

async function userIdOf(sb) {
  const { data, error } = await sb.auth.getUser();
  if (error) throw new Error(error.message);
  return data?.user?.id || '';
}

/** UTC 今天（YYYY-MM-DD）——AIOS 可用 `today` 入参覆盖为本地日期以校正时区边界。 */
function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function renderList(tasks, empty) {
  if (!tasks.length) return empty;
  return tasks.map((t) => `• ${formatTaskLine(t)}`).join('\n');
}

async function upsertTask(sb, userId, task) {
  const { error } = await sb.from('planner_tasks').upsert({
    user_id: userId,
    id: task.id,
    data: task,
    updated_at: new Date(task.updatedAt).toISOString(),
  });
  if (error) throw new Error(error.message);
}

export default createMcpHandler({
  name: 'planner',
  tools: [
    {
      name: 'ping',
      description: '连通性自检，返回 Planner MCP 标识',
      inputSchema: { type: 'object', properties: {} },
      handler() {
        return 'planner MCP server ok';
      },
    },
    {
      name: 'today_agenda',
      description:
        '列出今天该做的任务（已逾期 / 今天截止 / 今天排程，未完成）。用户问「我今天要做什么」「今天有什么安排」时使用。',
      inputSchema: {
        type: 'object',
        properties: {
          today: {
            type: 'string',
            description: '本地今天 YYYY-MM-DD（可选，覆盖服务器 UTC 日期以校正时区）',
          },
        },
      },
      async handler(args, { request }) {
        const jwt = jwtFromRequest(request);
        if (!jwt) return NEED_LOGIN;
        const today = isIsoDate(args?.today) ? args.today : utcToday();
        let tasks;
        try {
          tasks = await loadTasks(plannerClient(jwt));
        } catch (err) {
          return `读取任务失败：${err?.message ?? err}`;
        }
        const list = tasks.filter((t) => isToday(t, today)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        return `${today} 今日待办（${list.length}）：\n${renderList(list, '今天没有待办 🎉')}`;
      },
    },
    {
      name: 'list_tasks',
      description:
        '列出任务，可按范围与关键词过滤。scope: open=未完成(默认) / all=全部 / today=今天该做。',
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['open', 'all', 'today'], description: '过滤范围，默认 open' },
          query: { type: 'string', description: '标题/备注关键词（可选）' },
          today: { type: 'string', description: 'scope=today 时的本地今天 YYYY-MM-DD（可选）' },
        },
      },
      async handler(args, { request }) {
        const jwt = jwtFromRequest(request);
        if (!jwt) return NEED_LOGIN;
        let tasks;
        try {
          tasks = await loadTasks(plannerClient(jwt));
        } catch (err) {
          return `读取任务失败：${err?.message ?? err}`;
        }
        const list = selectTasks(tasks, {
          scope: args?.scope || 'open',
          query: args?.query || '',
          today: isIsoDate(args?.today) ? args.today : utcToday(),
          limit: 50,
        });
        return `共 ${list.length} 条：\n${renderList(list, '没有匹配的任务')}`;
      },
    },
    {
      name: 'add_task',
      description:
        '新建一条任务。用户说「提醒我 XX」「加个任务 XX」「记一下 XX」时使用。默认进收件箱。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题（必填）' },
          notes: { type: 'string', description: '备注（可选）' },
          dueDate: { type: 'string', description: '截止日期 YYYY-MM-DD（可选）' },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], description: '优先级，默认 P3' },
        },
        required: ['title'],
      },
      async handler(args, { request }) {
        const jwt = jwtFromRequest(request);
        if (!jwt) return NEED_LOGIN;
        const title = String(args?.title ?? '').trim();
        if (!title) return '任务标题不能为空。';
        const sb = plannerClient(jwt);
        let userId;
        try {
          userId = await userIdOf(sb);
        } catch (err) {
          return `无法确认身份：${err?.message ?? err}`;
        }
        if (!userId) return NEED_LOGIN;
        const task = buildTask({ ...args, title }, { id: newTaskId(), now: Date.now() });
        try {
          await upsertTask(sb, userId, task);
        } catch (err) {
          return `创建任务失败：${err?.message ?? err}`;
        }
        return `已创建任务：${formatTaskLine(task)}`;
      },
    },
    {
      name: 'complete_task',
      description:
        '把一条任务标记为完成。传 id 精确定位，或传 title 按标题匹配（未完成任务里精确优先、其次包含）。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 id（可选，最精确）' },
          title: { type: 'string', description: '任务标题或关键词（可选）' },
        },
      },
      async handler(args, { request }) {
        const jwt = jwtFromRequest(request);
        if (!jwt) return NEED_LOGIN;
        if (!args?.id && !String(args?.title ?? '').trim()) return '请提供 id 或 title 指定要完成的任务。';
        const sb = plannerClient(jwt);
        let tasks;
        try {
          tasks = await loadTasks(sb);
        } catch (err) {
          return `读取任务失败：${err?.message ?? err}`;
        }
        const target = findTaskToComplete(tasks, { id: args?.id || '', title: args?.title || '' });
        if (!target) return `没找到匹配的未完成任务${args?.title ? `：「${args.title}」` : ''}。`;
        const done = completeTask(target, Date.now());
        let userId;
        try {
          userId = await userIdOf(sb);
          await upsertTask(sb, userId, done);
        } catch (err) {
          return `更新任务失败：${err?.message ?? err}`;
        }
        return `已完成任务：${done.title || '(无标题)'}`;
      },
    },
  ],
});

export const config = { path: '/api/mcp' };
