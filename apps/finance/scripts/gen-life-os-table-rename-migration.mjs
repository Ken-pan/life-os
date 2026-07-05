#!/usr/bin/env node
/**
 * 生成 Life OS 表重命名 migration 中的 RPC/触发器补丁 SQL。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));

const PUBLIC_RENAMES = [
  ["extension_processed_captures", "finance_extension_processed_captures"],
  ["expected_occurrences", "finance_expected_occurrences"],
  ["balance_assertions", "finance_balance_assertions"],
  ["transaction_imports", "finance_transaction_imports"],
  ["holding_daily_candles", "finance_holding_daily_candles"],
  ["holding_price_trails", "finance_holding_price_trails"],
  ["holding_positions", "finance_holding_positions"],
  ["holdings_snapshots", "finance_holdings_snapshots"],
  ["scenario_apply_audits", "finance_scenario_apply_audits"],
  ["scenario_snapshots", "finance_scenario_snapshots"],
  ["scenario_events", "finance_scenario_events"],
  ["decision_records", "finance_decision_records"],
  ["merchant_rules", "finance_merchant_rules"],
  ["recurring_items", "finance_recurring_items"],
  ["review_items", "finance_review_items"],
  ["user_settings", "finance_user_settings"],
  ["transactions", "finance_transactions"],
  ["scenarios", "finance_scenarios"],
  ["cash_flows", "finance_cash_flows"],
  ["accounts", "finance_accounts"],
  ["goals", "finance_goals"],
  ["allowed_devices", "core_allowed_devices"],
];

const FITNESS_RENAMES = [
  ["exercise_weights", "fitness_exercise_weights"],
  ["workout_sessions", "fitness_workout_sessions"],
  ["exercise_logs", "fitness_exercise_logs"],
  ["user_state", "fitness_user_state"],
  ["profiles", "fitness_profiles"],
];

function patchSql(sql) {
  let out = sql;
  for (const [from, to] of PUBLIC_RENAMES) {
    out = out.replaceAll(`public.${from}`, `public.${to}`);
  }
  for (const [from, to] of FITNESS_RENAMES) {
    out = out.replaceAll(`fitness.${from}`, `fitness.${to}`);
  }
  return out;
}

function extractFunctions(sql, names) {
  const chunks = [];
  for (const name of names) {
    const re = new RegExp(
      `create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`,
      "i"
    );
    const m = sql.match(re);
    if (m) chunks.push(patchSql(m[0]));
  }
  return chunks.join("\n\n");
}

const sources = [
  ["supabase/migration_backup_restore_v2.sql", ["delete_all_financial_data_v2", "restore_finance_backup_v2"]],
  ["supabase/migration_p2b_decision_studio.sql", ["apply_scenario_to_plan_v1", "undo_latest_scenario_apply_v1"]],
  ["supabase/migration_extension_sync_durable.sql", ["finalize_extension_sync_v1"]],
  ["supabase/migration_p1a_reality_loop.sql", ["finalize_transaction_import_v1"]],
  ["supabase/migration_atomic_restore.sql", ["delete_all_financial_data_v1", "restore_finance_backup_v1"]],
];

const renameSql = `-- 1) 重命名 public / fitness 业务表（模块前缀）
${PUBLIC_RENAMES.map(([from, to]) => `alter table if exists public.${from} rename to ${to};`).join("\n")}

${FITNESS_RENAMES.map(([from, to]) => `alter table if exists fitness.${from} rename to ${to};`).join("\n")}
`;

const fitnessTrigger = patchSql(readFileSync(join(root, "supabase/migrations/20260705140000_fitness_schema.sql"), "utf8"));
const fitnessFn = fitnessTrigger.match(
  /create or replace function private\.fitness_handle_new_user[\s\S]*?\$\$;/i
)?.[0];
if (fitnessFn) {
  sources.push(["inline", []]);
}

let rpcSql = "";
for (const [file, names] of sources) {
  if (file === "inline") continue;
  rpcSql += extractFunctions(readFileSync(join(root, file), "utf8"), names);
  rpcSql += "\n\n";
}

const enforceLimit = readFileSync(join(root, "supabase/schema.sql"), "utf8").match(
  /create or replace function public\.enforce_device_limit[\s\S]*?\$\$;/i
)?.[0];
if (enforceLimit) rpcSql += patchSql(enforceLimit) + "\n\n";

if (fitnessFn) rpcSql += patchSql(fitnessFn) + "\n\n";

const catalogSql = readFileSync(
  join(root, "supabase/migrations/20260705211305_life_os_module_tagging.sql"),
  "utf8"
);
const catalogView = catalogSql.match(
  /create or replace view public\.life_os_table_catalog[\s\S]*?grant select on public\.life_os_table_catalog[\s\S]*?;/i
)?.[0];

const viewPatch = catalogView
  ? patchSql(catalogView)
      .replace(
        "when c.relname like 'planner_%' then 'planner'",
        "when c.relname like 'planner_%' then 'planner'"
      )
      .replace(
        "when c.relname = 'allowed_devices' then 'core'",
        "when c.relname like 'core_%' then 'core'"
      )
      .replace(
        `when n.nspname = 'fitness' then 'fitness'`,
        `when n.nspname = 'fitness' then 'fitness'`
      )
      .replace(
        `when n.nspname = 'public'
      and c.relname not in ('life_os_modules', 'life_os_table_catalog')
      and c.relkind = 'r' then 'finance'`,
        `when n.nspname = 'public'
      and c.relname like 'finance_%' then 'finance'`
      )
  : "";

const outPath = join(root, "supabase/migrations/20260705212000_life_os_table_prefixes.sql");
writeFileSync(
  outPath,
  `-- Life OS: 表名加模块前缀（finance_ / core_ / fitness_），便于 Supabase Table Editor 识别
-- planner_* 与 life_os_* 保持不变

${renameSql}

-- 2) 更新 RPC / 触发器函数中的表引用
${rpcSql}

-- 3) 更新表级对照视图
${viewPatch}
`
);

console.log("wrote", outPath);
