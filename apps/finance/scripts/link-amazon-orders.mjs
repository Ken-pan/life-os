#!/usr/bin/env node
/**
 * @deprecated Use link-purchase-orders.mjs (--source amazon). Kept for backward compatibility.
 *
 * Match Amazon order export JSON to finance_transactions and optionally write purchase_enrichment.
 *
 * Usage:
 *   node scripts/link-amazon-orders.mjs [--orders path] [--dry-run] [--apply] [--replace] [--year 2026]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (!args.includes("--source")) {
  args.unshift("--source", "amazon");
}

// link-purchase-orders 引用 finance-core 的无扩展名 TS 导入，须经 vite-node 运行。
const viteNode = path.resolve(__dirname, "../../../node_modules/.bin/vite-node");
const result = spawnSync(viteNode, [path.join(__dirname, "link-purchase-orders.mjs"), "--", ...args], {
  stdio: "inherit",
  cwd: path.resolve(__dirname, ".."),
});
process.exit(result.status ?? 1);
