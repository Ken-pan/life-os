import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const STORAGE_KEY = 'planos_v1';
const OUT_DIR = path.join(process.cwd(), 'tests', 'screenshots');

function localDateOffset(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function richSeedState() {
  const today = localDateOffset(0);
  const yesterday = localDateOffset(-1);
  const tomorrow = localDateOffset(1);
  const week = localDateOffset(5);
  const later = localDateOffset(14);
  const workListId = 'list_work_audit';
  const now = Date.now();

  return {
    schemaVersion: 2,
    tasks: [
      {
        id: 'audit_t1',
        title: '设计评审',
        notes: '与产品对齐 Q3 路线图',
        listId: 'inbox',
        priority: 1,
        dueDate: today,
        dueTime: '09:30',
        reminderMinutes: 15,
        recurrence: { rule: 'daily', interval: 1, until: null, seriesId: 'series_1' },
        tags: ['work'],
        subtasks: [{ id: 'sub_1', title: '准备幻灯片', done: false }],
        completed: false,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'audit_t2',
        title: '迟到的周报',
        notes: '',
        listId: 'inbox',
        priority: 0,
        dueDate: yesterday,
        dueTime: '17:00',
        reminderMinutes: null,
        recurrence: null,
        tags: ['work'],
        subtasks: [],
        completed: false,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'audit_t3',
        title: '明日站会',
        notes: '',
        listId: 'inbox',
        priority: 2,
        dueDate: tomorrow,
        dueTime: null,
        reminderMinutes: null,
        recurrence: null,
        tags: [],
        subtasks: [],
        completed: false,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'audit_t4',
        title: '版本发布',
        notes: '',
        listId: workListId,
        priority: 1,
        dueDate: week,
        dueTime: '14:00',
        reminderMinutes: 60,
        recurrence: null,
        tags: ['work', 'release'],
        subtasks: [],
        completed: false,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'audit_t5',
        title: '长期规划',
        notes: '',
        listId: 'inbox',
        priority: 3,
        dueDate: later,
        dueTime: null,
        reminderMinutes: null,
        recurrence: null,
        tags: [],
        subtasks: [],
        completed: false,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'audit_t6',
        title: '收件箱灵感',
        notes: '',
        listId: 'inbox',
        priority: 4,
        dueDate: null,
        dueTime: null,
        reminderMinutes: null,
        recurrence: null,
        tags: [],
        subtasks: [],
        completed: false,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'audit_t7',
        title: '无截止待排期',
        notes: '',
        listId: 'inbox',
        priority: 4,
        dueDate: null,
        dueTime: null,
        reminderMinutes: null,
        recurrence: null,
        tags: [],
        subtasks: [],
        completed: false,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'audit_t8',
        title: '另一个无日期',
        notes: '',
        listId: 'inbox',
        priority: 4,
        dueDate: null,
        dueTime: null,
        reminderMinutes: null,
        recurrence: null,
        tags: [],
        subtasks: [],
        completed: false,
        createdAt: now,
        updatedAt: now
      }
    ],
    lists: [
      {
        id: 'inbox',
        title: 'inbox',
        icon: 'inbox',
        color: '#F5A623',
        sortOrder: 0,
        system: 'inbox'
      },
      {
        id: workListId,
        title: '工作项目',
        icon: 'list',
        color: '#0F66AE',
        sortOrder: 1,
        system: null
      }
    ],
    settings: {
      theme: 'light',
      locale: 'zh',
      defaultListId: 'inbox',
      notificationsEnabled: false,
      syncAuto: true
    }
  };
}

async function seedState(page, state) {
  await page.goto('/');
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: STORAGE_KEY, data: state }
  );
  await page.reload();
  await page.waitForSelector('[data-testid="fab-add"]', { timeout: 15_000 });
}

async function clearAppState(page) {
  await page.goto('/');
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
  await page.waitForSelector('[data-testid="fab-add"]', { timeout: 15_000 });
}

async function snap(page, name) {
  const dir = path.join(OUT_DIR, test.info().project.name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function waitForInsights(page) {
  await page
    .locator('.insight-card')
    .first()
    .waitFor({ state: 'visible', timeout: 8000 })
    .catch(() => {});
}

test.describe('PlannerOS 全页面截图审计', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  test('空态与认证', async ({ page }, testInfo) => {
    await clearAppState(page);

    await page.goto('/');
    await expect(page.locator('h1.page-title')).toBeVisible();
    await snap(page, '01-home-empty');

    await page.goto('/inbox');
    await snap(page, '02-inbox-empty');

    await page.goto('/upcoming');
    await snap(page, '03-upcoming-empty');

    await page.goto('/calendar');
    await snap(page, '04-calendar-empty');

    await page.goto('/search');
    await snap(page, '05-search-empty');

    await page.goto('/settings');
    await snap(page, '06-settings-empty');

    await page.goto('/auth');
    await snap(page, '07-auth-signin');

    testInfo.annotations.push({
      type: 'screenshots',
      description: path.join(OUT_DIR, testInfo.project.name)
    });
  });

  test('丰富数据 — 主导航与编辑器', async ({ page }, testInfo) => {
    await seedState(page, richSeedState());

    await page.goto('/');
    await waitForInsights(page);
    await snap(page, '10-home-rich');

    await page.getByTestId('fab-add').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await snap(page, '11-editor-new');

    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();

    await page.locator('.task-title', { hasText: '设计评审' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await snap(page, '12-editor-edit');

    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();

    const routes = [
      { path: '/inbox', name: '13-inbox-rich' },
      { path: '/upcoming', name: '14-upcoming-rich' },
      { path: '/calendar', name: '15-calendar-rich' },
      { path: '/search', name: '16-search-rich' },
      { path: '/settings', name: '17-settings-rich' }
    ];
    for (const r of routes) {
      await page.goto(r.path);
      await page.waitForLoadState('networkidle');
      await snap(page, r.name);
    }

    await page.goto('/search');
    await page.locator('.field input').fill('发布');
    await snap(page, '18-search-query');

    await page.goto('/lists/list_work_audit');
    await snap(page, '19-list-work');

    testInfo.annotations.push({
      type: 'screenshots',
      description: path.join(OUT_DIR, testInfo.project.name)
    });
  });

  test('深色主题与英文', async ({ page }, testInfo) => {
    await seedState(page, richSeedState());

    await page.goto('/settings');
    await page.getByRole('button', { name: '深色', exact: true }).click();
    await snap(page, '20-settings-dark');

    await page.goto('/');
    await waitForInsights(page);
    await snap(page, '21-home-dark');

    await page.goto('/upcoming');
    await snap(page, '22-upcoming-dark');

    await page.goto('/settings');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await snap(page, '23-settings-en');

    await page.goto('/');
    await snap(page, '24-home-en');

    await page.goto('/calendar');
    await snap(page, '25-calendar-en');

    await page.getByTestId('fab-add').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await snap(page, '26-editor-en');

    testInfo.annotations.push({
      type: 'screenshots',
      description: path.join(OUT_DIR, testInfo.project.name)
    });
  });
});
