#!/usr/bin/env node
/**
 * 一次性脚本：把 FitnessOS 项目数据迁入 Life OS 的 fitness schema。
 * 用法（在项目根目录）：
 *   node scripts/migrate-fitness-to-life-os.mjs
 *
 * 依赖 supabase CLI 已 login；脚本会通过 CLI 读取 service role key。
 */
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

const LIFE_REF = "iueozzuctstwvzbcxcyh";
const FITNESS_REF = "drtqnhtlpjbwrpyqlrjk";
const OLD_USER = "a5fcb055-fff2-4e58-90de-0eeaf749793c";
const NEW_USER = "c2831538-94b0-4a57-b034-5e873a53c42e";

function serviceRole(ref) {
  const raw = execSync(`supabase projects api-keys --project-ref ${ref} -o json`, {
    encoding: "utf8",
  });
  const key = JSON.parse(raw).find((x) => x.name === "service_role")?.api_key;
  if (!key) throw new Error(`service_role not found for ${ref}`);
  return key;
}

const lifeUrl = `https://${LIFE_REF}.supabase.co`;
const fitnessUrl = `https://${FITNESS_REF}.supabase.co`;

const life = createClient(lifeUrl, serviceRole(LIFE_REF), {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "fitness" },
});

const fitness = createClient(fitnessUrl, serviceRole(FITNESS_REF), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function remapUser(row) {
  if (!row) return row;
  const next = { ...row };
  if (next.user_id === OLD_USER) next.user_id = NEW_USER;
  if (next.id === OLD_USER) next.id = NEW_USER;
  return next;
}

async function fetchAll(table, client = fitness) {
  const { data, error } = await client.from(table).select("*");
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

const FITNESS_TARGET = {
  profiles: "fitness_profiles",
  user_state: "fitness_user_state",
  exercise_weights: "fitness_exercise_weights",
  workout_sessions: "fitness_workout_sessions",
  exercise_logs: "fitness_exercise_logs",
};

async function main() {
  console.log("[migrate] reading FitnessOS public tables…");
  const [profiles, userState, weights, sessions, logs] = await Promise.all([
    fetchAll("profiles"),
    fetchAll("user_state"),
    fetchAll("exercise_weights"),
    fetchAll("workout_sessions"),
    fetchAll("exercise_logs"),
  ]);

  const payload = {
    profiles: profiles.map(remapUser),
    user_state: userState.map(remapUser),
    exercise_weights: weights.map(remapUser),
    workout_sessions: sessions.map(remapUser),
    exercise_logs: logs.map(remapUser),
  };

  console.log("[migrate] counts", {
    profiles: payload.profiles.length,
    user_state: payload.user_state.length,
    exercise_weights: payload.exercise_weights.length,
    workout_sessions: payload.workout_sessions.length,
    exercise_logs: payload.exercise_logs.length,
  });

  console.log("[migrate] clearing target fitness tables (if re-run)…");
  for (const [key, table] of Object.entries(FITNESS_TARGET)) {
    if (key === "profiles") continue;
    const { error } = await life.from(table).delete().eq("user_id", NEW_USER);
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  }
  {
    const { error } = await life.from(FITNESS_TARGET.profiles).delete().eq("id", NEW_USER);
    if (error) throw new Error(`clear ${FITNESS_TARGET.profiles}: ${error.message}`);
  }

  console.log("[migrate] inserting into Life OS fitness schema…");
  for (const [key, rows] of Object.entries(payload)) {
    if (!rows.length) continue;
    const table = FITNESS_TARGET[key];
    const { error } = await life.from(table).upsert(rows);
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    console.log(`  ✓ ${table}: ${rows.length}`);
  }

  console.log("[migrate] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
