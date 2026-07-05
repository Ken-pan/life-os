/**
 * 主链路 UI/UX 截图 QA（桌面 + 移动端）
 * 用法：npm run dev -- --port 5180
 *       UI_QA_URL=http://localhost:5180 node scripts/ui-main-flows-screenshot-qa.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync, cpSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dateTag = process.env.UI_QA_DATE ?? "2026-07-04";
const shotRoot = resolve(root, `docs/ui-qa-screenshots/${dateTag}`);
const storageKey = "life_os_auth";
const baseUrl = process.env.UI_QA_URL ?? "http://localhost:5180";

const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "mobile", width: 402, height: 874 },
];

const SUB_TABS = {
  history: [
    { slug: "insights", label: "洞察" },
    { slug: "fixed", label: "固定收支" },
    { slug: "oneoff", label: "大额收支" },
  ],
  forecast: [
    { slug: "forecast", label: "预测曲线" },
    { slug: "scenarios", label: "长期规划" },
  ],
  review: [
    { slug: "import", label: "导入交易" },
    { slug: "queue", label: "审查队列" },
    { slug: "baseline", label: "消费基线" },
    { slug: "calibrate", label: "更新计划" },
    { slug: "reconcile", label: "账户对账" },
  ],
  decision: [
    { slug: "compare", label: "对比" },
    { slug: "saved", label: "已保存方案" },
    { slug: "log", label: "决策日志" },
  ],
  settings: [
    { slug: "accounts", label: "账户" },
    { slug: "assumptions", label: "预测参数" },
    { slug: "app", label: "应用偏好" },
  ],
};

const MAIN_TABS = [
  { id: "today", label: "今日", mobile: "primary" },
  { id: "overview", label: "总览", mobile: "primary" },
  { id: "stocks", label: "资产配置", mobile: "more" },
  { id: "history", label: "记录", mobile: "primary" },
  { id: "review", label: "审查", mobile: "more" },
  { id: "forecast", label: "预测", mobile: "primary" },
  { id: "decision", label: "决策", mobile: "more" },
  { id: "settings", label: "设置", mobile: "more" },
];

mkdirSync(resolve(shotRoot, "desktop"), { recursive: true });
mkdirSync(resolve(shotRoot, "mobile"), { recursive: true });
mkdirSync(resolve(shotRoot, "drawers"), { recursive: true });

function loadEnv() {
  return Object.fromEntries(
    readFileSync(resolve(root, ".env.local"), "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

function overflowReport() {
  const el = document.documentElement;
  const viewportWidth = el.clientWidth;
  const scrollWidth = el.scrollWidth;
  const overflowPx = scrollWidth - viewportWidth;
  const offenders = [];
  if (overflowPx > 1) {
    for (const node of document.querySelectorAll("body *")) {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.left >= -1 && rect.right <= viewportWidth + 1) continue;
      offenders.push({
        tag: node.tagName.toLowerCase(),
        className: String(node.className ?? "").slice(0, 80),
        right: Math.round(rect.right),
      });
      if (offenders.length >= 6) break;
    }
  }
  return { viewportWidth, scrollWidth, overflowPx, offenders };
}

const env = loadEnv();
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error("Missing .env.local Supabase credentials");
  process.exit(1);
}

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { storageKey, persistSession: false },
});

const email = process.env.UI_QA_EMAIL ?? "p1a-rls-test-b@example.test";
const password = process.env.UI_QA_PASSWORD ?? "P1aTestPass!2026";

const { data: auth, error } = await sb.auth.signInWithPassword({ email, password });
if (error || !auth.session) {
  console.error("Auth failed:", error?.message);
  process.exit(1);
}

const results = [];

async function injectSession(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
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
}

async function assertReady(page) {
  const text = await page.locator("body").innerText();
  if (
    text.includes("请使用你的账户登录") ||
    text.includes("需要配置 Supabase") ||
    text.includes("设备数量已达上限")
  ) {
    throw new Error(`App not ready: ${text.slice(0, 300)}`);
  }
  if (!text.includes("Finance") && !text.includes("今日")) {
    throw new Error(`Wrong app or unexpected state: ${text.slice(0, 200)}`);
  }
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("fos-theme", t);
  }, theme);
  await page.waitForTimeout(250);
}

async function clickMainTab(page, viewportId, label, mobileKind) {
  if (viewportId === "desktop") {
    await page.locator(".sidebar").getByRole("button", { name: label }).click();
  } else if (mobileKind === "primary") {
    await page.locator(".mobile-tabbar").getByRole("button", { name: label }).first().click();
  } else {
    await page.locator('.mobile-tabbar button[aria-label="更多"]').click();
    await page.waitForSelector(".mobile-more-sheet", { state: "visible" });
    await page.locator(".mobile-more-row").filter({ hasText: label }).click();
    await page.waitForSelector(".mobile-more-sheet", { state: "hidden" });
  }
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

async function clickSubTab(page, label) {
  const tab = page.locator(".horizontal-tabs").getByRole("button", { name: label });
  if (await tab.count()) {
    await tab.first().click();
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
  }
}

async function capture(page, viewportId, name, checks = {}) {
  const dir = resolve(shotRoot, viewportId);
  const path = resolve(dir, `${name}.png`);
  const fullPage = viewportId === "desktop";
  await page.screenshot({ path, fullPage });
  const overflow = await page.evaluate(overflowReport);
  const text = await page.locator("body").innerText();
  const failedChecks = [];
  for (const [label, fn] of Object.entries(checks)) {
    if (!fn(text, overflow)) failedChecks.push(label);
  }
  const entry = { viewport: viewportId, name, path, overflow, failedChecks };
  results.push(entry);
  const ok = failedChecks.length === 0 && overflow.overflowPx <= 1;
  console.log(`${ok ? "PASS" : "FAIL"} [${viewportId}] ${name}`);
  if (!ok) {
    if (overflow.overflowPx > 1) console.log(`  overflow: ${overflow.overflowPx}px`);
    if (failedChecks.length) console.log(`  checks: ${failedChecks.join(", ")}`);
  }
  return entry;
}

async function closeDrawer(page) {
  const closeBtn = page.locator(".drawer").getByRole("button", { name: "关闭" });
  if (await closeBtn.count()) {
    await closeBtn.first().click();
    await page.waitForTimeout(400);
  }
}

async function captureDrawer(page, viewportId, name) {
  const path = resolve(shotRoot, "drawers", `${viewportId}-${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`INFO [${viewportId}] drawer ${name}`);
}

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await injectSession(page);

  try {
    await assertReady(page);
  } catch (e) {
    await page.screenshot({
      path: resolve(shotRoot, vp.id, "00_auth_failed.png"),
      fullPage: true,
    });
    console.error(`[${vp.id}] ${e.message}`);
    await page.close();
    continue;
  }

  await capture(page, vp.id, "00_after_login");

  for (const tab of MAIN_TABS) {
    await clickMainTab(page, vp.id, tab.label, tab.mobile);
    const subs = SUB_TABS[tab.id];
    if (subs) {
      for (const sub of subs) {
        await clickSubTab(page, sub.label);
        await capture(page, vp.id, `${tab.id}-${sub.slug}`, {
          noOverflow: (_t, r) => r.overflowPx <= 1,
          ...(sub.slug === "baseline"
            ? {
                positiveIncome: (t) => !/月收入[\s\S]{0,12}-\$/.test(t),
                mergedBaseline: (t) =>
                  t.includes("消费基线（数据尚不足）") || t.includes("个月基线"),
              }
            : {}),
        });
      }
    } else {
      await capture(page, vp.id, tab.id, {
        noOverflow: (_t, r) => r.overflowPx <= 1,
        ...(tab.id === "today"
          ? {
              stsLabel: (t) => t.includes("现在可放心花"),
              noOldSts: (t) => !t.includes("未来低谷余量可花"),
              stsExplainer: (t) => {
                const hasSave = t.includes("本月预计能存");
                const hasZero = /现在可放心花[\s\S]{0,30}\$0/.test(t);
                if (hasZero && hasSave) return t.includes("不矛盾");
                return true;
              },
            }
          : {}),
      });
    }
  }

  if (vp.id === "mobile") {
    await clickMainTab(page, vp.id, "今日", "primary");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    await page.screenshot({
      path: resolve(shotRoot, "mobile", "today-scrolled-bottom.png"),
      fullPage: false,
    });

    await page.locator('.mobile-tabbar button[aria-label="更多"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(shotRoot, "mobile", "more-sheet-light.png"),
      fullPage: false,
    });
    await page.locator(".mobile-more-close").click();
    await page.waitForTimeout(300);

    await setTheme(page, "dark");
    await page.locator('.mobile-tabbar button[aria-label="更多"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(shotRoot, "mobile", "more-sheet-dark.png"),
      fullPage: false,
    });
    await page.locator(".mobile-more-close").click();
    await setTheme(page, "light");
  }

  await clickMainTab(page, vp.id, "今日", vp.id === "desktop" ? undefined : "primary");

  const fab = page.getByRole("button", { name: "记一笔" });
  if (await fab.count()) {
    await fab.first().click();
    await page.waitForTimeout(600);
    await captureDrawer(page, vp.id, "txn-drawer-empty");
    await closeDrawer(page);
  }

  const spendBtn = page.getByRole("button", { name: "算一笔消费的影响" });
  if (await spendBtn.count()) {
    await spendBtn.click();
    await page.waitForTimeout(600);
    await captureDrawer(page, vp.id, "spend-drawer");
    await closeDrawer(page);
  }

  await clickMainTab(page, vp.id, "设置", vp.id === "desktop" ? undefined : "more");
  await clickSubTab(page, "账户");
  const firstAccount = page.locator(".account-card .flow-head").first();
  if (await firstAccount.count()) {
    await firstAccount.click();
    await page.waitForTimeout(500);
    await capture(page, vp.id, "settings-accounts-expanded");
  }

  await clickSubTab(page, "应用偏好");
  await setTheme(page, "dark");
  await clickMainTab(page, vp.id, "今日", vp.id === "desktop" ? undefined : "primary");
  await page.waitForTimeout(800);
  await capture(page, vp.id, "today-dark-theme");

  await page.close();
}

await browser.close();

writeFileSync(
  resolve(shotRoot, "report.json"),
  JSON.stringify(
    {
      date: dateTag,
      baseUrl,
      email,
      viewports: VIEWPORTS,
      results,
      summary: {
        total: results.length,
        failed: results.filter(
          (r) => r.failedChecks.length > 0 || r.overflow.overflowPx > 1
        ).length,
      },
    },
    null,
    2
  )
);

console.log(`\n=== Main flows QA complete ===`);
console.log(`Screenshots: ${shotRoot}`);
console.log(
  `Summary: ${results.length} captures, ${results.filter((r) => r.failedChecks.length > 0 || r.overflow.overflowPx > 1).length} with issues`
);
process.exit(
  results.some((r) => r.failedChecks.length > 0 || r.overflow.overflowPx > 1) ? 1 : 0
);
