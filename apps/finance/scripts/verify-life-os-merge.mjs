#!/usr/bin/env node
/**
 * 验证 Life OS 合并状态：Finance public + Fitness fitness schema + PostgREST 暴露。
 */
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const LIFE_REF = "iueozzuctstwvzbcxcyh";
const LIFE_USER = "c2831538-94b0-4a57-b034-5e873a53c42e";

function serviceRole(ref) {
  const raw = execSync(`supabase projects api-keys --project-ref ${ref} -o json`, {
    encoding: "utf8",
  });
  return JSON.parse(raw).find((x) => x.name === "service_role")?.api_key;
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

async function main() {
  const token = execSync('security find-generic-password -s "Supabase CLI" -w', {
    encoding: "utf8",
  }).trim();
  const project = JSON.parse(
    execSync(`curl -s "https://api.supabase.com/v1/projects/${LIFE_REF}" -H "Authorization: Bearer ${token}"`, {
      encoding: "utf8",
    })
  );
  if (project.name !== "Life OS") fail(`项目名应为 Life OS，当前: ${project.name}`);
  else ok(`项目名: ${project.name} (${LIFE_REF})`);

  const pg = JSON.parse(
    execSync(
      `curl -s "https://api.supabase.com/v1/projects/${LIFE_REF}/postgrest" -H "Authorization: Bearer ${token}"`,
      { encoding: "utf8" }
    )
  );
  if (!pg.db_schema?.includes("fitness")) fail(`PostgREST 未暴露 fitness schema: ${pg.db_schema}`);
  else ok(`PostgREST schemas: ${pg.db_schema}`);

  const sr = serviceRole(LIFE_REF);
  const life = createClient(`https://${LIFE_REF}.supabase.co`, sr, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const fitness = createClient(`https://${LIFE_REF}.supabase.co`, sr, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "fitness" },
  });

  const financeChecks = [
    ["finance_accounts", life.from("finance_accounts").select("id", { count: "exact", head: true }).eq("user_id", LIFE_USER)],
    ["finance_transactions", life.from("finance_transactions").select("id", { count: "exact", head: true }).eq("user_id", LIFE_USER)],
    ["finance_user_settings", life.from("finance_user_settings").select("user_id", { count: "exact", head: true }).eq("user_id", LIFE_USER)],
  ];
  for (const [name, q] of financeChecks) {
    const { count, error } = await q;
    if (error) fail(`public.${name}: ${error.message}`);
    else ok(`public.${name}: ${count ?? 0} rows (user)`);
  }

  const fitChecks = [
    ["fitness_profiles", fitness.from("fitness_profiles").select("id", { count: "exact", head: true }).eq("id", LIFE_USER)],
    ["fitness_user_state", fitness.from("fitness_user_state").select("user_id", { count: "exact", head: true }).eq("user_id", LIFE_USER)],
    ["fitness_exercise_weights", fitness.from("fitness_exercise_weights").select("exercise_id", { count: "exact", head: true }).eq("user_id", LIFE_USER)],
    ["fitness_workout_sessions", fitness.from("fitness_workout_sessions").select("id", { count: "exact", head: true }).eq("user_id", LIFE_USER)],
    ["fitness_exercise_logs", fitness.from("fitness_exercise_logs").select("id", { count: "exact", head: true }).eq("user_id", LIFE_USER)],
  ];
  for (const [name, q] of fitChecks) {
    const { count, error } = await q;
    if (error) fail(`fitness.${name}: ${error.message}`);
    else ok(`fitness.${name}: ${count ?? 0} rows (user)`);
  }

  const expected = { fitness_exercise_weights: 8, fitness_workout_sessions: 2, fitness_exercise_logs: 10 };
  for (const [table, min] of Object.entries(expected)) {
    const { count, error } = await fitness
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", LIFE_USER);
    if (error || (count ?? 0) < min) fail(`fitness.${table} 期望 ≥${min}，实际 ${count ?? "?"}`);
    else ok(`fitness.${table} 迁移数量 OK (${count})`);
  }

  for (const table of ["planner_user_state", "planner_tasks", "planner_lists"]) {
    const { error } = await life.from(table).select("*", { count: "exact", head: true }).limit(1);
    if (error) fail(`public.${table} 不可访问: ${error.message}`);
    else ok(`public.${table} 表已就绪`);
  }

  if (process.exitCode) {
    console.error("\n验证失败");
    process.exit(1);
  }
  console.log("\n全部验证通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
