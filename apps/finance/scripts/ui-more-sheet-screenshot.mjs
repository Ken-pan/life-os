/**
 * 移动端「更多」sheet 截图
 * 用法：npm run dev -- --port 5180 && node scripts/ui-more-sheet-screenshot.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shotDir = resolve(root, "docs/ui-qa-screenshots/more-sheet");
const baseUrl = process.env.UI_QA_URL ?? "http://localhost:5180";

mkdirSync(shotDir, { recursive: true });

const env = Object.fromEntries(
  readFileSync(resolve(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { storageKey: "life_os_auth", persistSession: false },
});

const { data: auth, error } = await sb.auth.signInWithPassword({
  email: process.env.UI_QA_EMAIL ?? "p1a-rls-test-b@example.test",
  password: process.env.UI_QA_PASSWORD ?? "P1aTestPass!2026",
});
if (error) {
  console.error("Auth failed:", error.message);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.evaluate((session) => {
  localStorage.setItem("life_os_auth", JSON.stringify(session));
}, auth.session);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);

async function setTheme(theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("fos-theme", t);
  }, theme);
  await page.waitForTimeout(250);
}

async function openMore() {
  await page.locator('nav.mobile-tabbar button[aria-label="更多"]').click();
  await page.waitForSelector(".mobile-more-sheet", { state: "visible" });
  await page.waitForTimeout(350);
}

async function closeMore() {
  await page.locator(".mobile-more-close").click();
  await page.waitForSelector(".mobile-more-sheet", { state: "hidden" });
  await page.waitForTimeout(200);
}

await setTheme("light");
await openMore();
await page.screenshot({ path: resolve(shotDir, "01_more_light.png") });
await closeMore();

await setTheme("dark");
await openMore();
await page.screenshot({ path: resolve(shotDir, "02_more_dark.png") });
const sheet = page.locator(".mobile-more-sheet");
const box = await sheet.boundingBox();
if (box) {
  await page.screenshot({
    path: resolve(shotDir, "02b_more_dark_bottom_crop.png"),
    clip: {
      x: 0,
      y: Math.max(0, box.y - 48),
      width: 402,
      height: 874 - Math.max(0, box.y - 48),
    },
  });
}
await closeMore();

await openMore();
await page.locator(".mobile-more-row").filter({ hasText: "审查" }).click();
await page.waitForTimeout(600);
await openMore();
await page.screenshot({ path: resolve(shotDir, "03_more_active_item_dark.png") });

console.log("Screenshots saved to", shotDir);
await browser.close();
