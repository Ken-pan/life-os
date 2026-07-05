// One-off: read src/data/transactions.json and emit batched INSERT SQL files
// for the public.finance_transactions table (run via Supabase MCP execute_sql).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const argUserId = process.argv.find((arg) => arg.startsWith("--user-id="))?.split("=")[1];
const USER_ID = argUserId || process.env.FINANCE_OS_USER_ID;
if (!USER_ID) {
  console.error(
    "Missing user id. Provide --user-id=<uuid> or FINANCE_OS_USER_ID env."
  );
  process.exit(1);
}
const BATCH = 600;

const raw = JSON.parse(readFileSync(join(root, "src/data/transactions.json"), "utf8"));
const { categories, accounts, flowTypes, txns } = raw;

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const qn = (v) => (v === null || v === undefined ? "null" : q(v));
const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "0" : String(Number(v)));
const bool = (v) => (v === 1 ? "true" : "false");

const outDir = join(root, "scripts/.txn-sql");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const cols =
  "(user_id,txn_date,merchant,category,account,flow,amount,budget_impact,in_spending,in_cash_flow,exclude_reason,source)";

let batchIdx = 0;
const files = [];
for (let i = 0; i < txns.length; i += BATCH) {
  const slice = txns.slice(i, i + BATCH);
  const values = slice
    .map((t) => {
      const category = categories[t.c] ?? "Uncategorized";
      const account = accounts[t.a]?.name ?? "Unknown";
      const flow = flowTypes[t.f] ?? "expense";
      return `(${q(USER_ID)},${q(t.d)}::date,${q(t.m ?? "")},${q(category)},${q(account)},${q(flow)},${num(t.amt)},${num(t.bi)},${bool(t.sa)},${bool(t.cf)},${qn(t.x)},'import')`;
    })
    .join(",\n");
  const sql = `insert into public.finance_transactions ${cols} values\n${values};\n`;
  const fname = `batch_${String(batchIdx).padStart(3, "0")}.sql`;
  writeFileSync(join(outDir, fname), sql, "utf8");
  files.push(fname);
  batchIdx += 1;
}

writeFileSync(join(outDir, "index.json"), JSON.stringify({ count: txns.length, batches: files }, null, 2));
console.log(`rows=${txns.length} batches=${files.length} -> scripts/.txn-sql/`);
