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

const result = spawnSync(process.execPath, [path.join(__dirname, "link-purchase-orders.mjs"), ...args], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
