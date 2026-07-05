import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const shotDir = resolve(root, "docs/pto-audit-export/screenshots/p1a-live");
const csvPath = resolve(root, "src/test-fixtures/p1a/small-valid.csv");
const storageKey = "life_os_auth";

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
  auth: { storageKey, persistSession: false },
});
const { data: auth, error } = await sb.auth.signInWithPassword({
  email: "p1a-rls-test-b@example.test",
  password: "P1aTestPass!2026",
});
if (error || !auth.session) {
  console.error("Auth failed:", error?.message);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const baseUrl = process.env.UI_QA_URL ?? "http://localhost:5180";
await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
await page.evaluate(
  ({ key, session }) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      })
    );
  },
  { key: storageKey, session: auth.session }
);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(4000);
const bodyText = await page.locator("body").innerText();
if (!bodyText.includes("审查")) {
  await page.screenshot({ path: `${shotDir}/qa_p1a_debug_after_session.png`, fullPage: true });
  console.error("Unexpected page state:", bodyText.slice(0, 600));
  await browser.close();
  process.exit(1);
}
await page.getByRole("button", { name: "审查" }).click();
await page.waitForTimeout(1000);
await page.locator('input[type="file"]').setInputFiles(csvPath);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shotDir}/qa_p1a_import_mapping.png`, fullPage: true });
await page.getByRole("button", { name: "继续预览" }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${shotDir}/qa_p1a_import_preview.png`, fullPage: true });
await page.getByRole("button", { name: "审查高价值问题" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${shotDir}/qa_p1a_import_review_buckets.png`, fullPage: true });
await page.getByRole("button", { name: "继续确认" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${shotDir}/qa_p1a_import_confirmation.png`, fullPage: true });
await page.getByRole("button", { name: "导入已接受的交易" }).click();
await page.waitForTimeout(8000);
await page.screenshot({ path: `${shotDir}/qa_p1a_import_complete.png`, fullPage: true });
await page.getByRole("button", { name: "审查队列" }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shotDir}/qa_p1a_review_queue_desktop.png`, fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shotDir}/qa_p1a_review_queue_mobile_390.png`, fullPage: true });
await page.setViewportSize({ width: 1440, height: 900 });
await page.getByRole("button", { name: "消费基线" }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${shotDir}/qa_p1a_baseline_3_6_12.png`, fullPage: true });
await page.screenshot({ path: `${shotDir}/qa_p1a_baseline_confidence.png`, fullPage: true });
await page.getByRole("button", { name: "更新计划", exact: true }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${shotDir}/qa_p1a_plan_calibration_diff.png`, fullPage: true });
await page.screenshot({ path: `${shotDir}/qa_p1a_plan_calibration_forecast_preview.png`, fullPage: true });
await browser.close();
console.log("P1A browser QA screenshots captured");
