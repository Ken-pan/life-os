#!/usr/bin/env node
/**
 * Match Amazon order export JSON to finance_transactions and optionally write purchase_enrichment.
 *
 * Usage:
 *   node scripts/link-amazon-orders.mjs [--orders path] [--dry-run] [--apply] [--year 2026]
 *
 * Requires Supabase Management API token (same as ../../scripts/supabase-sql.sh).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { matchAmazonOrdersToTxns } from "../src/engine/amazonOrderMatch.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "iueozzuctstwvzbcxcyh";
const DEFAULT_ORDERS = path.resolve(
  __dirname,
  "../../../tools/web-state-devtools/bridge/data/amazon-export/amazon-orders-2026-raw.json"
);

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  try {
    return execSync('security find-generic-password -s "Supabase CLI" -w', {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

async function runSql(query) {
  const token = getToken();
  if (!token) throw new Error("Missing Supabase access token. Run: supabase login");
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function escSql(s) {
  return String(s).replace(/'/g, "''");
}

async function main() {
  const ordersPath = arg("--orders", DEFAULT_ORDERS);
  const year = arg("--year", "2026");
  const dryRun = hasFlag("--dry-run") || !hasFlag("--apply");

  if (!fs.existsSync(ordersPath)) {
    console.error("[link-amazon] orders file not found:", ordersPath);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(ordersPath, "utf8"));
  const orders = raw.orders ?? raw.items ?? [];
  console.log("[link-amazon] loaded", orders.length, "orders from", ordersPath);

  const txnRows = await runSql(`
    select id, txn_date, coalesce(source_amount, amount) as amount, merchant_name, purchase_enrichment
    from finance_transactions
    where (merchant_name ilike '%amazon%' or merchant ilike '%amazon%')
      and txn_date >= '${escSql(year)}-01-01'
      and txn_date <= '${escSql(year)}-12-31'
    order by txn_date desc;
  `);

  const txns = (txnRows ?? []).map((r) => ({
    id: String(r.id),
    date: String(r.txn_date).slice(0, 10),
    amount: Number(r.amount),
    merchant: String(r.merchant_name ?? ""),
    purchaseEnrichment: r.purchase_enrichment,
  }));

  console.log("[link-amazon] amazon txns in", year + ":", txns.length);

  const matches = matchAmazonOrdersToTxns(orders, txns);
  const already = txns.filter((t) => t.purchaseEnrichment?.source === "amazon").length;

  console.log("[link-amazon] matches:", matches.length, "(already enriched:", already + ")");
  console.log(
    "[link-amazon] confidence:",
    matches.reduce(
      (acc, m) => {
        acc[m.confidence] = (acc[m.confidence] ?? 0) + 1;
        return acc;
      },
      /** @type {Record<string, number>} */ ({})
    )
  );

  for (const m of matches.slice(0, 8)) {
    const txn = txns.find((t) => t.id === m.txnId);
    console.log(
      " ",
      txn?.date,
      "$" + txn?.amount,
      "→",
      m.orderId,
      `(${m.confidence}, Δ${m.dayDiff.toFixed(1)}d)`
    );
  }
  if (matches.length > 8) console.log("  …", matches.length - 8, "more");

  if (dryRun) {
    console.log("\n[link-amazon] dry-run — pass --apply to write purchase_enrichment");
    return;
  }

  let updated = 0;
  for (const m of matches) {
    const json = escSql(JSON.stringify(m.enrichment));
    await runSql(`
      update finance_transactions
      set purchase_enrichment = '${json}'::jsonb,
          updated_at = now()
      where id = '${escSql(m.txnId)}';
    `);
    updated++;
  }
  console.log("\n[link-amazon] updated", updated, "transactions");
}

main().catch((e) => {
  console.error("[link-amazon] FATAL", e.message);
  process.exit(1);
});
