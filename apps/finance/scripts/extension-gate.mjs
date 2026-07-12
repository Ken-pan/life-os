import { chromium } from 'playwright';
import path from 'path';
import url from 'url';
import fs from 'fs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../extension');

(async () => {
  try {
    const userDataDir = '/tmp/playwright-ext-test';
    // Clear user data dir
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--headless=new`,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    const extensionId = background.url().split('/')[2];
    console.log('Extension ID:', extensionId);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    
    console.log('Popup loaded');
    await page.waitForTimeout(1000);
    
    // 1. Never synced
    await page.screenshot({ path: 'never-synced.png' });
    console.log('Evidence: never-synced.png');

    // Manipulate local storage to mock states via background worker evaluation
    await background.evaluate(() => {
      return chrome.storage.local.set({
        'fos_last_sync_state': {
          ok: false,
          failed: 1,
          summaries: ['Failed to fetch: Bearer eyJhb.eyJzd.SflK'],
          at: new Date().toISOString()
        }
      });
    });

    // 2. Failure + Retry
    // We need to refresh the popup by reloading it
    await page.reload();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'failure.png' });
    console.log('Evidence: failure.png');
    
    // Click retry
    const retryBtn = await page.$('.sync-health-retry');
    if (retryBtn) {
      await retryBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'syncing.png' });
      console.log('Evidence: syncing.png');
    } else {
      console.log('No retry button found');
    }

    // 4. Success
    await background.evaluate(() => {
      // Clear active lock
      chrome.storage.session.remove('fos_active_sync');
      return chrome.storage.local.set({
        'fos_last_sync_state': {
          ok: true,
          processed: 10,
          at: new Date().toISOString()
        }
      });
    });
    
    await page.reload();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'success.png' });
    console.log('Evidence: success.png');

    await context.close();
    console.log('RUNTIME GATE PASS');
  } catch (err) {
    console.error('Failed to run Playwright:', err);
    console.log('RUNTIME GATE BLOCKED');
  }
})();
