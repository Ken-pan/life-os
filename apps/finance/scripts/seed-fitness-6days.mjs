#!/usr/bin/env node
/**
 * 根据用户截图模拟 Jun 30 – Jul 5 共 6 天训练，写入 Life OS fitness schema。
 * 轮换: 胸 → 背 → 腿 → 臂 → 胸 → 背（bro-split）
 *
 * 用法: node scripts/seed-fitness-6days.mjs
 */
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const LIFE_REF = "iueozzuctstwvzbcxcyh";
const USER_ID = "c2831538-94b0-4a57-b034-5e873a53c42e";
const PROGRAM_ID = "bro-split";
const SCHEMA_VERSION = 6;

function serviceRole() {
  const raw = execSync(`supabase projects api-keys --project-ref ${LIFE_REF} -o json`, {
    encoding: "utf8",
  });
  const key = JSON.parse(raw).find((x) => x.name === "service_role")?.api_key;
  if (!key) throw new Error("service_role not found");
  return key;
}

/** @param {string} date YYYY-MM-DD @param {number} hourLocal PT hour */
function sessionStartIso(date, hourLocal = 10, minute = 30) {
  // America/Los_Angeles in July = UTC-7
  const d = new Date(`${date}T${String(hourLocal).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-07:00`);
  return d.toISOString();
}

function addMinutes(iso, mins) {
  return new Date(new Date(iso).getTime() + mins * 60_000).toISOString();
}

/** @param {{ exerciseId: string, sets: { reps: number, rir: number, weight: number }[], startIso: string, restMin?: number }} cfg */
function buildLog({ exerciseId, sets, startIso, restMin = 3 }) {
  let t = new Date(startIso).getTime();
  const setRows = sets.map((s) => {
    const row = {
      ts: new Date(t).toISOString(),
      reps: s.reps,
      rir: s.rir,
      weight: s.weight,
    };
    t += restMin * 60_000 + 90_000;
    return row;
  });
  return {
    exercise_id: exerciseId,
    done: setRows.length,
    sets: setRows,
    skipped: null,
    started_at: setRows[0]?.ts ?? startIso,
  };
}

/** @param {{ date: string, dayId: string, hour?: number, exercises: ReturnType<typeof buildLog>[] }} session */
function buildSession({ date, dayId, hour = 10, exercises }) {
  const sessionId = randomUUID();
  const startedAt = sessionStartIso(date, hour);
  let cursor = startedAt;
  const logs = exercises.map((spec) => {
    const log = buildLog({ ...spec, startIso: cursor });
    cursor = addMinutes(log.started_at, spec.sets.length * (spec.restMin ?? 3) + 2);
    return {
      id: randomUUID(),
      session_id: sessionId,
      user_id: USER_ID,
      ...log,
    };
  });
  const endedAt = addMinutes(
    logs[logs.length - 1]?.started_at ?? startedAt,
    (logs[logs.length - 1]?.sets?.length ?? 1) * 4
  );
  return {
    session: {
      id: sessionId,
      user_id: USER_ID,
      session_date: date,
      day_id: dayId,
      program_id: PROGRAM_ID,
      started_at: startedAt,
      ended_at: endedAt,
    },
    logs,
  };
}

const DAYS = [
  {
    date: "2026-06-30",
    dayId: "chest",
    hour: 12,
    exercises: [
      {
        exerciseId: "c_bench",
        sets: [
          { reps: 8, rir: 1, weight: 225 },
          { reps: 8, rir: 1, weight: 225 },
          { reps: 8, rir: 1, weight: 225 },
          { reps: 7, rir: 0, weight: 225 },
        ],
      },
      {
        exerciseId: "c_incdb",
        sets: [
          { reps: 12, rir: 2, weight: 47.5 },
          { reps: 12, rir: 2, weight: 50 },
          { reps: 11, rir: 1, weight: 50 },
        ],
      },
      {
        exerciseId: "c_incmc",
        sets: [
          { reps: 12, rir: 2, weight: 130 },
          { reps: 12, rir: 1, weight: 190 },
          { reps: 10, rir: 1, weight: 190 },
        ],
      },
      {
        exerciseId: "c_fly",
        sets: [
          { reps: 14, rir: 2, weight: 85 },
          { reps: 15, rir: 2, weight: 115 },
          { reps: 12, rir: 1, weight: 145 },
        ],
      },
    ],
  },
  {
    date: "2026-07-01",
    dayId: "back",
    hour: 12,
    exercises: [
      {
        exerciseId: "b_pull",
        sets: [
          { reps: 6, rir: 2, weight: 0 },
          { reps: 8, rir: 2, weight: 0 },
          { reps: 8, rir: 1, weight: 0 },
          { reps: 8, rir: 1, weight: 0 },
        ],
        restMin: 2.5,
      },
      {
        exerciseId: "b_chestsup",
        sets: [
          { reps: 10, rir: 2, weight: 45 },
          { reps: 10, rir: 2, weight: 45 },
          { reps: 9, rir: 1, weight: 45 },
        ],
      },
      {
        exerciseId: "b_pulldown",
        sets: [
          { reps: 15, rir: 2, weight: 130 },
          { reps: 15, rir: 2, weight: 130 },
          { reps: 15, rir: 1, weight: 145 },
        ],
      },
      {
        exerciseId: "b_row",
        sets: [
          { reps: 12, rir: 2, weight: 115 },
          { reps: 12, rir: 2, weight: 130 },
          { reps: 12, rir: 2, weight: 130 },
        ],
      },
      {
        exerciseId: "b_face",
        sets: [
          { reps: 15, rir: 2, weight: 100 },
          { reps: 18, rir: 1, weight: 100 },
          { reps: 18, rir: 1, weight: 100 },
        ],
      },
      {
        exerciseId: "b_ext",
        sets: [
          { reps: 12, rir: 2, weight: 70 },
          { reps: 13, rir: 2, weight: 70 },
          { reps: 12, rir: 2, weight: 70 },
        ],
      },
    ],
  },
  {
    date: "2026-07-02",
    dayId: "legs",
    hour: 11,
    exercises: [
      {
        exerciseId: "l_squat",
        sets: [
          { reps: 8, rir: 2, weight: 185 },
          { reps: 8, rir: 2, weight: 185 },
          { reps: 8, rir: 1, weight: 185 },
          { reps: 7, rir: 1, weight: 185 },
        ],
        restMin: 3,
      },
      {
        exerciseId: "l_rdl",
        sets: [
          { reps: 10, rir: 2, weight: 95 },
          { reps: 10, rir: 2, weight: 95 },
          { reps: 9, rir: 1, weight: 95 },
        ],
      },
      {
        exerciseId: "l_press",
        sets: [
          { reps: 12, rir: 2, weight: 180 },
          { reps: 12, rir: 2, weight: 180 },
          { reps: 11, rir: 1, weight: 180 },
        ],
      },
      {
        exerciseId: "l_curl",
        sets: [
          { reps: 12, rir: 2, weight: 120 },
          { reps: 12, rir: 1, weight: 120 },
          { reps: 11, rir: 1, weight: 120 },
        ],
      },
      {
        exerciseId: "l_ext",
        sets: [
          { reps: 15, rir: 2, weight: 150 },
          { reps: 14, rir: 1, weight: 150 },
          { reps: 13, rir: 1, weight: 150 },
        ],
      },
      {
        exerciseId: "l_thrust",
        sets: [
          { reps: 12, rir: 2, weight: 265 },
          { reps: 12, rir: 2, weight: 265 },
          { reps: 11, rir: 1, weight: 265 },
        ],
      },
      {
        exerciseId: "l_calf",
        sets: [
          { reps: 15, rir: 2, weight: 180 },
          { reps: 15, rir: 1, weight: 180 },
          { reps: 14, rir: 1, weight: 180 },
          { reps: 13, rir: 0, weight: 180 },
        ],
      },
    ],
  },
  {
    date: "2026-07-03",
    dayId: "arms",
    hour: 10,
    exercises: [
      {
        exerciseId: "ar_cgbench",
        sets: [
          { reps: 9, rir: 2, weight: 65 },
          { reps: 9, rir: 1, weight: 65 },
          { reps: 8, rir: 1, weight: 65 },
        ],
      },
      {
        exerciseId: "ar_ezcurl",
        sets: [
          { reps: 12, rir: 2, weight: 55 },
          { reps: 11, rir: 1, weight: 55 },
          { reps: 10, rir: 1, weight: 55 },
        ],
      },
      {
        exerciseId: "ar_ropeoh",
        sets: [
          { reps: 12, rir: 2, weight: 40 },
          { reps: 12, rir: 1, weight: 40 },
          { reps: 11, rir: 1, weight: 40 },
        ],
      },
      {
        exerciseId: "ar_preacher",
        sets: [
          { reps: 12, rir: 2, weight: 65 },
          { reps: 11, rir: 1, weight: 65 },
          { reps: 10, rir: 0, weight: 65 },
        ],
      },
      {
        exerciseId: "ar_rope",
        sets: [
          { reps: 15, rir: 2, weight: 50 },
          { reps: 14, rir: 1, weight: 50 },
        ],
      },
      {
        exerciseId: "ar_hammer",
        sets: [
          { reps: 12, rir: 2, weight: 25 },
          { reps: 12, rir: 1, weight: 25 },
        ],
      },
    ],
  },
  {
    date: "2026-07-04",
    dayId: "chest",
    hour: 14,
    exercises: [
      {
        exerciseId: "c_bench",
        sets: [
          { reps: 8, rir: 2, weight: 225 },
          { reps: 8, rir: 1, weight: 225 },
          { reps: 7, rir: 1, weight: 225 },
          { reps: 7, rir: 0, weight: 225 },
        ],
        restMin: 2.5,
      },
      {
        exerciseId: "c_incdb",
        sets: [
          { reps: 12, rir: 2, weight: 50 },
          { reps: 11, rir: 1, weight: 50 },
          { reps: 10, rir: 1, weight: 52.5 },
        ],
      },
      {
        exerciseId: "c_incmc",
        sets: [
          { reps: 12, rir: 2, weight: 190 },
          { reps: 11, rir: 1, weight: 190 },
          { reps: 10, rir: 1, weight: 190 },
        ],
      },
      {
        exerciseId: "c_fly",
        sets: [
          { reps: 15, rir: 2, weight: 115 },
          { reps: 14, rir: 1, weight: 145 },
          { reps: 12, rir: 1, weight: 145 },
        ],
      },
    ],
  },
  {
    date: "2026-07-05",
    dayId: "back",
    hour: 11,
    exercises: [
      {
        exerciseId: "b_pull",
        sets: [
          { reps: 8, rir: 2, weight: 0 },
          { reps: 8, rir: 2, weight: 0 },
          { reps: 9, rir: 1, weight: 0 },
          { reps: 8, rir: 1, weight: 0 },
        ],
        restMin: 2.5,
      },
      {
        exerciseId: "b_chestsup",
        sets: [
          { reps: 10, rir: 2, weight: 45 },
          { reps: 10, rir: 2, weight: 45 },
          { reps: 9, rir: 1, weight: 45 },
        ],
      },
      {
        exerciseId: "b_pulldown",
        sets: [
          { reps: 15, rir: 2, weight: 150 },
          { reps: 15, rir: 2, weight: 150 },
          { reps: 15, rir: 1, weight: 150 },
        ],
      },
      {
        exerciseId: "b_row",
        sets: [
          { reps: 12, rir: 2, weight: 135 },
          { reps: 12, rir: 2, weight: 135 },
          { reps: 12, rir: 2, weight: 135 },
        ],
      },
      {
        exerciseId: "b_face",
        sets: [
          { reps: 15, rir: 2, weight: 100 },
          { reps: 15, rir: 2, weight: 100 },
          { reps: 20, rir: 1, weight: 100 },
        ],
      },
      {
        exerciseId: "b_ext",
        sets: [
          { reps: 12, rir: 2, weight: 70 },
          { reps: 12, rir: 2, weight: 70 },
          { reps: 14, rir: 2, weight: 70 },
        ],
      },
    ],
  },
];

async function main() {
  const db = createClient(`https://${LIFE_REF}.supabase.co`, serviceRole(), {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "fitness" },
  });

  const sessions = [];
  const logs = [];
  for (const day of DAYS) {
    const { session, logs: dayLogs } = buildSession(day);
    sessions.push(session);
    logs.push(...dayLogs);
    console.log(`  ${day.date} ${day.dayId}: ${dayLogs.length} exercises`);
  }

  const rotationHistory = DAYS.map((d) => ({ date: d.date, dayId: d.dayId }));

  const userState = {
    user_id: USER_ID,
    settings: {
      unit: "lbs",
      sound: true,
      theme: "auto",
      accent: "auto",
      logDetail: "off",
      notifyRest: true,
      locale: "zh",
    },
    rotation: {
      next: 2,
      history: rotationHistory,
      lastDeload: null,
      phaseStart: null,
    },
    program_overrides: {},
    active_program_id: PROGRAM_ID,
    last_day: "back",
    schema_version: SCHEMA_VERSION,
  };

  const weightMap = {
    c_bench: 225,
    c_incdb: 52.5,
    c_incmc: 190,
    c_fly: 145,
    b_pulldown: 150,
    b_row: 135,
    b_face: 100,
    b_ext: 70,
    b_chestsup: 45,
    l_squat: 185,
    l_rdl: 95,
    l_press: 180,
    l_curl: 120,
    l_ext: 150,
    l_thrust: 265,
    l_calf: 180,
    ar_cgbench: 65,
    ar_ezcurl: 55,
    ar_ropeoh: 40,
    ar_preacher: 65,
    ar_rope: 50,
    ar_hammer: 25,
  };

  const exerciseWeights = Object.entries(weightMap).map(([exercise_id, weight]) => ({
    user_id: USER_ID,
    exercise_id,
    weight,
  }));

  console.log("[seed] clearing existing fitness data for user…");
  for (const table of [
    "fitness_exercise_logs",
    "fitness_exercise_weights",
    "fitness_workout_sessions",
  ]) {
    const { error } = await db.from(table).delete().eq("user_id", USER_ID);
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  }

  console.log("[seed] inserting…");
  const { error: usErr } = await db.from("fitness_user_state").upsert(userState);
  if (usErr) throw new Error(`fitness_user_state: ${usErr.message}`);

  const { error: wErr } = await db.from("fitness_exercise_weights").upsert(exerciseWeights, {
    onConflict: "user_id,exercise_id",
  });
  if (wErr) throw new Error(`fitness_exercise_weights: ${wErr.message}`);

  const { error: sErr } = await db.from("fitness_workout_sessions").insert(sessions);
  if (sErr) throw new Error(`fitness_workout_sessions: ${sErr.message}`);

  const { error: lErr } = await db.from("fitness_exercise_logs").insert(logs);
  if (lErr) throw new Error(`fitness_exercise_logs: ${lErr.message}`);

  const { data: verify, error: vErr } = await db
    .from("fitness_workout_sessions")
    .select("session_date, day_id")
    .eq("user_id", USER_ID)
    .order("session_date");
  if (vErr) throw vErr;

  console.log("[seed] ✓ sessions:", verify);
  console.log("[seed] ✓ logs:", logs.length);
  console.log("[seed] rotation next=legs (index 2), last_day=back");
  console.log("[seed] done — 打开 Fitness App，已登录时会自动同步；或设置页「从云端恢复」");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
