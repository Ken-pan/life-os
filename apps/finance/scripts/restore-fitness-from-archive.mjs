#!/usr/bin/env node
/**
 * 从本地归档恢复 Fitness 训练记录到 Life OS（覆盖指定账号）。
 * 用法: node scripts/restore-fitness-from-archive.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const LIFE_REF = "iueozzuctstwvzbcxcyh";
const TARGET_USER = "c2831538-94b0-4a57-b034-5e873a53c42e";
const OLD_USER = "a5fcb055-fff2-4e58-90de-0eeaf749793c";
const ARCHIVE = join(
  process.cwd(),
  "docs/supabase-archive/fitnessos-2026-07-05/data.json"
);

function serviceRole() {
  const raw = execSync(`supabase projects api-keys --project-ref ${LIFE_REF} -o json`, {
    encoding: "utf8",
  });
  const key = JSON.parse(raw).find((x) => x.name === "service_role")?.api_key;
  if (!key) throw new Error("service_role not found");
  return key;
}

function remap(row) {
  if (!row) return row;
  const next = { ...row };
  if (next.user_id === OLD_USER) next.user_id = TARGET_USER;
  if (next.id === OLD_USER) next.id = TARGET_USER;
  return next;
}

const FITNESS_TARGET = {
  profiles: "fitness_profiles",
  user_state: "fitness_user_state",
  exercise_weights: "fitness_exercise_weights",
  workout_sessions: "fitness_workout_sessions",
  exercise_logs: "fitness_exercise_logs",
};

async function main() {
  const archive = JSON.parse(readFileSync(ARCHIVE, "utf8"));
  const db = createClient(`https://${LIFE_REF}.supabase.co`, serviceRole(), {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "fitness" },
  });

  const payload = {
    profiles: archive.tables.profiles.map(remap),
    user_state: archive.tables.user_state.map(remap),
    exercise_weights: archive.tables.exercise_weights.map(remap),
    workout_sessions: archive.tables.workout_sessions.map(remap),
    exercise_logs: archive.tables.exercise_logs.map(remap),
  };

  console.log("[restore] archive snapshot:");
  console.log(
    "  sessions:",
    payload.workout_sessions.map((s) => `${s.session_date} ${s.day_id}`).join(", ")
  );
  console.log("  logs:", payload.exercise_logs.length);

  // 清掉该用户现有 fitness 数据后全量写入
  for (const [key, table] of Object.entries(FITNESS_TARGET)) {
    if (key === "profiles") continue;
    const { error } = await db.from(table).delete().eq("user_id", TARGET_USER);
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  }
  {
    const { error } = await db.from(FITNESS_TARGET.profiles).delete().eq("id", TARGET_USER);
    if (error) throw new Error(`clear ${FITNESS_TARGET.profiles}: ${error.message}`);
  }

  for (const [key, rows] of Object.entries(payload)) {
    if (!rows.length) continue;
    const table = FITNESS_TARGET[key];
    const { error } = await db.from(table).upsert(rows);
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    console.log(`[restore] ✓ ${table}: ${rows.length}`);
  }

  // 验证
  const { data: sessions, error } = await db
    .from(FITNESS_TARGET.workout_sessions)
    .select("session_date, day_id")
    .eq("user_id", TARGET_USER)
    .order("session_date");
  if (error) throw error;
  console.log("[restore] verified sessions:", sessions);
  console.log("[restore] done — 请在 Fitness app 里执行「从云端下载/覆盖本地」");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
