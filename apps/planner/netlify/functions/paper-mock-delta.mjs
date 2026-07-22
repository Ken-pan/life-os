import { paperMockDisabledResponse } from './_paperMockGuard.mjs'

export default async (req) => {
  const _disabled = paperMockDisabledResponse()
  if (_disabled) return _disabled
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers
    });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor') || '0';
  const todayStr = new Date().toISOString().split('T')[0];
  const nowMs = Date.now();

  const responseBody = {
    cursor: String(nowMs),
    hasMore: false,
    changes: {
      upserted: [
        {
          id: "task-mock-task-new-3",
          title: "Verify delta response on device",
          notes: "Added via virtual delta update mock path",
          listId: "inbox",
          priority: "P3",
          urgency: "normal",
          size: "small",
          area: "planner",
          effortMin: null,
          nextAction: null,
          aiContext: null,
          projectId: null,
          dueDate: todayStr,
          dueTime: null,
          scheduledDate: null,
          scheduledStart: null,
          durationMinutes: null,
          reminderMinutes: null,
          recurrence: null,
          tags: [],
          subtasks: [],
          completed: false,
          completedAt: null,
          createdAt: nowMs,
          updatedAt: nowMs,
          deletedAt: null,
          sortOrder: 9,
          meta: { kind: "standard" }
        }
      ],
      deleted: [
        "task-mock-deleted-99"
      ]
    }
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers
  });
};

export const config = { path: '/api/paper/mock/delta' };
