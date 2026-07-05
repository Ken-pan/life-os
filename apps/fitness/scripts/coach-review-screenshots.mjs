/**
 * 截图复查：Coach / 重量推荐可疑场景
 * 运行: node scripts/coach-review-screenshots.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../screenshots/coach-review');
const BASE = process.env.BASE_URL || 'http://localhost:5173';

function dateKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function seed(page, data = {}) {
  await page.goto(BASE + '/');
  await page.evaluate((d) => {
    const today = new Date();
    const todayK = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const s = JSON.parse(localStorage.getItem('fitos_v2') || '{}');
    s.settings = {
      unit: 'lbs',
      logDetail: 'quick',
      theme: 'dark',
      sound: true,
      notifyRest: false,
      plateCollarLbs: 0,
      plateCollarKg: 0,
      ...d.settings
    };
    s.weights = { c_bench: 185, c_incline: 135, c_fly: 0, b_row: 135, ...(d.weights || {}) };
    s.logs = d.logs ?? s.logs ?? {};
    s.rotation = { next: 0, history: [], lastDeload: null, ...(d.rotation || {}) };
    s.sessionMeta = d.sessionMeta ?? s.sessionMeta ?? {};
    delete s.focusCursor;

    for (const key of Object.keys(s.logs)) {
      const [date, dayId] = key.split('|');
      if (!date || !dayId || date >= todayK) continue;
      const ts = new Date(`${date}T12:00:00`).toISOString();
      if (!s.sessionMeta[key]) s.sessionMeta[key] = { startedAt: ts, endedAt: ts };
      s.rotation.history = s.rotation.history || [];
      if (!s.rotation.history.some((h) => h.date === date && h.dayId === dayId)) {
        s.rotation.history.push({ date, dayId });
      }
    }
    localStorage.setItem('fitos_v2', JSON.stringify(s));
  }, data);
  await page.reload();
  await page.waitForLoadState('networkidle');
}

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  if (opts.locator) {
    await opts.locator.scrollIntoViewIfNeeded();
    await opts.locator.screenshot({ path: file });
  } else if (opts.fullPage) {
    await page.screenshot({ path: file, fullPage: true });
  } else {
    await page.screenshot({ path: file });
  }
  console.log('  ✓', name);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2
  });
  const page = await ctx.newPage();
  const yesterday = dateKey(-1);
  const twoDaysAgo = dateKey(-2);
  const fiveDaysAgo = dateKey(-5);

  console.log('Coach review screenshots →', OUT);

  // 1. 对照：完整 4 组打满 → 正常加重
  await seed(page, {
    logs: {
      [`${yesterday}|chest`]: {
        c_bench: {
          sets: [
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 1 },
            { weight: 185, reps: 8, rir: 1 }
          ],
          done: 4
        }
      }
    }
  });
  await page.goto(`${BASE}/day/chest/focus`);
  await page.waitForSelector('.focus-advice.increase', { timeout: 8000 });
  await shot(page, '01-focus-full-topped-increase', { locator: page.locator('.focus-sheet-top') });
  await page.goto(BASE + '/');
  await page.waitForSelector('.coach-card, [class*="coach"]', { timeout: 5000 }).catch(() => {});
  await shot(page, '02-home-lbs-coach-progression', { fullPage: true });

  // 2. 可疑：只练 2/4 组但次数打满
  await seed(page, {
    logs: {
      [`${yesterday}|chest`]: {
        c_bench: {
          sets: [
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 2 },
            null,
            null
          ],
          done: 2
        }
      }
    }
  });
  await page.goto(`${BASE}/day/chest/focus`);
  const partialAdvice = page.locator('.focus-advice.increase');
  const hasPartialIncrease = await partialAdvice.isVisible().catch(() => false);
  await shot(page, '03-focus-partial-sets-2of4', { locator: page.locator('.focus-header, .focus-weight-col').first().or(page.locator('.focus-session')).first() });
  if (hasPartialIncrease) {
    await shot(page, '03b-focus-partial-shows-increase-bug', { locator: partialAdvice });
  }

  // 3. 可疑：无 RIR，连续两次达标
  await seed(page, {
    logs: {
      [`${twoDaysAgo}|chest`]: {
        c_bench: {
          sets: [
            { weight: 185, reps: 7 },
            { weight: 185, reps: 7 },
            { weight: 185, reps: 7 },
            { weight: 185, reps: 7 }
          ],
          done: 4
        }
      },
      [`${yesterday}|chest`]: {
        c_bench: {
          sets: [
            { weight: 185, reps: 7 },
            { weight: 185, reps: 7 },
            { weight: 185, reps: 7 },
            { weight: 185, reps: 7 }
          ],
          done: 4
        }
      }
    }
  });
  await page.goto(`${BASE}/day/chest/focus`);
  await page.waitForTimeout(500);
  await shot(page, '04-focus-no-rir-two-sessions', { locator: page.locator('.focus-sheet-top') });

  // 4. 可疑：KG 模式首页 Coach 文案
  await seed(page, {
    settings: { unit: 'kg' },
    logs: {
      [`${yesterday}|chest`]: {
        c_bench: {
          sets: [
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 1 },
            { weight: 185, reps: 8, rir: 1 }
          ],
          done: 4
        }
      }
    }
  });
  await page.goto(BASE + '/');
  await page.waitForTimeout(800);
  await shot(page, '05-home-kg-coach-raw-lbs', { fullPage: true });
  await page.goto(`${BASE}/day/chest/focus`);
  await shot(page, '06-focus-kg-increase-badge', { locator: page.locator('.focus-weight-col') });

  // 5. 可疑：减载期 + 上次打满 → 应降重，Coach 文案
  const hist = Array.from({ length: 12 }, (_, i) => ({
    date: dateKey(-14 + i),
    dayId: i % 2 === 0 ? 'chest' : 'back'
  }));
  await seed(page, {
    rotation: { next: 0, history: hist, lastDeload: dateKey(-60) },
    logs: {
      [`${yesterday}|chest`]: {
        c_bench: {
          sets: [
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 1 },
            { weight: 185, reps: 8, rir: 1 }
          ],
          done: 4
        }
      }
    }
  });
  await page.goto(BASE + '/');
  await page.waitForTimeout(800);
  await shot(page, '07-home-deload-coach-tips', { fullPage: true });
  await page.goto(`${BASE}/day/chest/focus`);
  await shot(page, '08-focus-deload-decrease', { locator: page.locator('.focus-sheet-top') });

  // 6. 可疑：停练 5 天 + 可加重 → 双提示冲突
  await seed(page, {
    logs: {
      [`${fiveDaysAgo}|chest`]: {
        c_bench: {
          sets: [
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 1 },
            { weight: 185, reps: 8, rir: 1 }
          ],
          done: 4
        }
      }
    }
  });
  await page.goto(BASE + '/');
  await page.waitForTimeout(800);
  await shot(page, '09-home-gap-plus-increase-conflict', { fullPage: true });

  // 7. Summary 页 KG 模式 delta 显示
  await seed(page, {
    settings: { unit: 'kg' },
    logs: {
      [`${dateKey(0)}|chest`]: {
        c_bench: {
          sets: [
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 1 },
            { weight: 185, reps: 8, rir: 1 }
          ],
          done: 4
        },
        c_incdb: { sets: [null, null, null], done: 0 }
      },
      [`${yesterday}|chest`]: {
        c_bench: {
          sets: [
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 2 },
            { weight: 185, reps: 8, rir: 1 },
            { weight: 185, reps: 8, rir: 1 }
          ],
          done: 4
        }
      }
    }
  });
  await page.goto(`${BASE}/day/chest/summary`);
  await page.waitForTimeout(800);
  await shot(page, '10-summary-kg-advice-delta', { fullPage: true });

  // 8. 重量弹窗 KG 建议（应对照已换算）
  await page.goto(`${BASE}/day/chest/focus`);
  await page.locator('.focus-weight').click();
  await page.waitForSelector('.modal.wtm');
  await shot(page, '11-weight-modal-kg-advice', { locator: page.locator('.modal.wtm') });

  await browser.close();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
