import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../docs/ui-qa-screenshots/cards-2026-07-05');
const baseUrl = 'http://127.0.0.1:5188';
const STORAGE_KEY = 'planos_v1';

function localDateOffset(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function richSeedState() {
  const today = localDateOffset(0);
  const yesterday = localDateOffset(-1);
  const now = Date.now();

  return {
    schemaVersion: 2,
    tasks: [
      {
        id: 'card_t1',
        title: '设计评审',
        notes: '',
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
        id: 'card_t2',
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
        id: 'card_t3',
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

async function seedState(page) {
  await page.goto(`${baseUrl}/`);
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: STORAGE_KEY, data: richSeedState() }
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.quick-add input', { timeout: 15000 });
}

const targets = [
  {
    name: 'planner-home-cards-mobile',
    url: `${baseUrl}/`,
    seed: true,
    viewport: devices['Pixel 7'].viewport,
    waitFor: '.task-row'
  },
  {
    name: 'planner-home-cards-desktop',
    url: `${baseUrl}/`,
    seed: true,
    viewport: { width: 1280, height: 800 },
    waitFor: '.task-row'
  },
  {
    name: 'planner-settings-cards-mobile',
    url: `${baseUrl}/settings`,
    viewport: devices['Pixel 7'].viewport,
    waitFor: '.settings-block'
  },
  {
    name: 'planner-settings-cards-desktop',
    url: `${baseUrl}/settings`,
    viewport: { width: 1280, height: 800 },
    waitFor: '.settings-block'
  },
  {
    name: 'planner-home-cards-dark-mobile',
    url: `${baseUrl}/settings`,
    seed: true,
    dark: true,
    thenUrl: `${baseUrl}/`,
    viewport: devices['Pixel 7'].viewport,
    waitFor: '.task-row'
  }
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

for (const target of targets) {
  await page.setViewportSize(target.viewport);
  try {
    if (target.seed) await seedState(page);

    if (target.dark) {
      await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.getByRole('button', { name: '深色', exact: true }).click();
      await page.waitForTimeout(300);
      await page.goto(target.thenUrl, { waitUntil: 'networkidle', timeout: 30000 });
    } else {
      await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 });
    }

    if (target.waitFor) {
      await page.locator(target.waitFor).first().waitFor({ state: 'visible', timeout: 15000 });
    }
    await page.locator('.insight-card').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(outDir, `${target.name}.png`),
      fullPage: true
    });
    console.log(`ok ${target.name}`);
  } catch (err) {
    console.error(`fail ${target.name}:`, err.message);
    process.exitCode = 1;
  }
}

await browser.close();
console.log(`screenshots -> ${outDir}`);
