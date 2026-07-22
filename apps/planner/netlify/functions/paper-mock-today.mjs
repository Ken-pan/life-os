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

  const todayStr = new Date().toISOString().split('T')[0];
  const nowMs = Date.now();

  const mockTasks = [
    {
      id: "task-mock-focus",
      title: "Build Pro Move Integration Mock API",
      notes: "Implement and test PR-1 mock layer endpoints",
      listId: "inbox",
      priority: "P0",
      urgency: "urgent",
      size: "medium",
      area: "work",
      effortMin: 120,
      nextAction: "Write netlify functions and tests",
      aiContext: "Integration phase 0/1",
      projectId: "proj-1",
      dueDate: todayStr,
      dueTime: "12:00",
      scheduledDate: todayStr,
      scheduledStart: "10:00",
      durationMinutes: 120,
      reminderMinutes: 15,
      recurrence: null,
      tags: ["remarkable", "api"],
      subtasks: [],
      completed: false,
      completedAt: null,
      createdAt: nowMs - 3600000,
      updatedAt: nowMs - 3600000,
      deletedAt: null,
      sortOrder: 1,
      meta: { kind: "focus" }
    },
    {
      id: "task-mock-block-1",
      title: "Morning Alignment & Standup",
      notes: "Sync up on daily priorities and system metrics",
      listId: "inbox",
      priority: "P1",
      urgency: "normal",
      size: "small",
      area: "work",
      effortMin: 30,
      nextAction: "Talk to team",
      aiContext: "Daily routine",
      projectId: null,
      dueDate: todayStr,
      dueTime: "09:30",
      scheduledDate: todayStr,
      scheduledStart: "09:00",
      durationMinutes: 30,
      reminderMinutes: null,
      recurrence: null,
      tags: ["sync"],
      subtasks: [],
      completed: true,
      completedAt: nowMs - 7200000,
      createdAt: nowMs - 8000000,
      updatedAt: nowMs - 7200000,
      deletedAt: null,
      sortOrder: 2,
      meta: { kind: "standard" }
    },
    {
      id: "task-mock-block-3",
      title: "Code Review & PR Review",
      notes: "Review pending pull requests on the repository",
      listId: "inbox",
      priority: "P2",
      urgency: "normal",
      size: "medium",
      area: "work",
      effortMin: 60,
      nextAction: "Look at github notifications",
      aiContext: null,
      projectId: null,
      dueDate: todayStr,
      dueTime: "14:00",
      scheduledDate: todayStr,
      scheduledStart: "13:00",
      durationMinutes: 60,
      reminderMinutes: null,
      recurrence: null,
      tags: ["review"],
      subtasks: [],
      completed: false,
      completedAt: null,
      createdAt: nowMs - 20000000,
      updatedAt: nowMs - 18000000,
      deletedAt: null,
      sortOrder: 3,
      meta: { kind: "standard" }
    },
    {
      id: "task-mock-block-4",
      title: "Exercise & Workout Session",
      notes: "Daily cardio / strength training block",
      listId: "inbox",
      priority: "P3",
      urgency: "low",
      size: "medium",
      area: "fitness",
      effortMin: 45,
      nextAction: null,
      aiContext: null,
      projectId: null,
      dueDate: todayStr,
      dueTime: "18:00",
      scheduledDate: todayStr,
      scheduledStart: "17:00",
      durationMinutes: 45,
      reminderMinutes: null,
      recurrence: null,
      tags: ["health"],
      subtasks: [],
      completed: false,
      completedAt: null,
      createdAt: nowMs - 30000000,
      updatedAt: nowMs - 25000000,
      deletedAt: null,
      sortOrder: 4,
      meta: { kind: "habit" }
    },
    {
      id: "task-mock-task-5",
      title: "Verify build and typecheck",
      notes: "Run check:lifeos-boundaries and local build commands",
      listId: "inbox",
      priority: "P1",
      urgency: "normal",
      size: "small",
      area: "work",
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
      createdAt: nowMs - 5000000,
      updatedAt: nowMs - 5000000,
      deletedAt: null,
      sortOrder: 5,
      meta: { kind: "standard" }
    },
    {
      id: "task-mock-task-6",
      title: "Clean desk and organizing workspace",
      notes: "Remove paper clutter",
      listId: "inbox",
      priority: "P3",
      urgency: "low",
      size: "small",
      area: "life",
      effortMin: null,
      nextAction: null,
      aiContext: null,
      projectId: null,
      dueDate: null,
      dueTime: null,
      scheduledDate: null,
      scheduledStart: null,
      durationMinutes: null,
      reminderMinutes: null,
      recurrence: null,
      tags: ["chore"],
      subtasks: [],
      completed: false,
      completedAt: null,
      createdAt: nowMs - 15000000,
      updatedAt: nowMs - 15000000,
      deletedAt: null,
      sortOrder: 6,
      meta: { kind: "micro" }
    },
    {
      id: "task-mock-task-7",
      title: "Submit finance reimbursement",
      notes: "Log travel expenses in finance tool",
      listId: "inbox",
      priority: "P2",
      urgency: "normal",
      size: "small",
      area: "finance",
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
      createdAt: nowMs - 12000000,
      updatedAt: nowMs - 12000000,
      deletedAt: null,
      sortOrder: 7,
      meta: { kind: "standard" }
    },
    {
      id: "task-mock-task-8",
      title: "Read remarkable Codex release notes",
      notes: "Check software updates for scarthgap support",
      listId: "inbox",
      priority: "P2",
      urgency: "low",
      size: "medium",
      area: "planner",
      effortMin: null,
      nextAction: null,
      aiContext: null,
      projectId: null,
      dueDate: null,
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
      createdAt: nowMs - 18000000,
      updatedAt: nowMs - 18000000,
      deletedAt: null,
      sortOrder: 8,
      meta: { kind: "standard" }
    }
  ];

  const responseBody = {
    serverTime: new Date().toISOString(),
    cursor: String(nowMs),
    user: {
      id: "mock-user-id-001",
      name: "Ken Pan",
      locale: "zh-CN",
      timezone: "America/Los_Angeles"
    },
    today: {
      date: todayStr,
      currentFocus: mockTasks[0], // Focus block is the first task (kind: focus)
      scheduleBlocks: [
        {
          id: "task-mock-block-1",
          title: "Morning Alignment & Standup",
          start: "09:00",
          durationMinutes: 30,
          completed: true
        },
        {
          id: "task-mock-focus",
          title: "Build Pro Move Integration Mock API",
          start: "10:00",
          durationMinutes: 120,
          completed: false
        },
        {
          id: "task-mock-block-3",
          title: "Code Review & PR Review",
          start: "13:00",
          durationMinutes: 60,
          completed: false
        },
        {
          id: "task-mock-block-4",
          title: "Exercise & Workout Session",
          start: "17:00",
          durationMinutes: 45,
          completed: false
        }
      ]
    },
    tasks: mockTasks,
    inbox: {
      count: 3
    },
    devicePolicy: {
      activePollSeconds: 300,
      idlePollSeconds: 900,
      heartbeatSeconds: 900
    }
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers
  });
};

export const config = { path: '/api/paper/mock/today' };
