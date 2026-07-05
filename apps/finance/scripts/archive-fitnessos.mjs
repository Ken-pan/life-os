#!/usr/bin/env node
/**
 * 归档旧 FitnessOS Supabase 项目（schema + 数据 + 元数据），供删除前留档。
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const FITNESS_REF = "drtqnhtlpjbwrpyqlrjk";
const OUT_DIR = join(process.cwd(), "docs/supabase-archive/fitnessos-2026-07-05");

function serviceRole(ref) {
  const raw = execSync(`supabase projects api-keys --project-ref ${ref} -o json`, {
    encoding: "utf8",
  });
  return JSON.parse(raw).find((x) => x.name === "service_role")?.api_key;
}

async function fetchAll(client, table) {
  const { data, error } = await client.from(table).select("*");
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const token = execSync('security find-generic-password -s "Supabase CLI" -w', {
    encoding: "utf8",
  }).trim();
  const meta = JSON.parse(
    execSync(`curl -s "https://api.supabase.com/v1/projects/${FITNESS_REF}" -H "Authorization: Bearer ${token}"`, {
      encoding: "utf8",
    })
  );
  writeFileSync(join(OUT_DIR, "project.json"), JSON.stringify(meta, null, 2));

  execSync(
    `cp "/Users/kenpan/「Projects」/Fitness/supabase/migrations/20260702185240_fitness_core_schema.sql" "${OUT_DIR}/schema.sql"`
  );

  const sr = serviceRole(FITNESS_REF);
  const client = createClient(`https://${FITNESS_REF}.supabase.co`, sr, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tables = ["profiles", "user_state", "exercise_weights", "workout_sessions", "exercise_logs"];
  const dump = { archivedAt: new Date().toISOString(), projectRef: FITNESS_REF, tables: {} };
  for (const table of tables) {
    dump.tables[table] = await fetchAll(client, table);
  }
  writeFileSync(join(OUT_DIR, "data.json"), JSON.stringify(dump, null, 2));

  const authUsers = execSync(
    `cd "/Users/kenpan/「Projects」/Fitness" && supabase db query --linked "select id, email, created_at from auth.users order by email;" -o json`,
    { encoding: "utf8" }
  );
  writeFileSync(join(OUT_DIR, "auth-users.json"), authUsers);

  const counts = tables.map((t) => `${t}: ${dump.tables[t].length}`).join(", ");
  const readme = `# FitnessOS 归档 (${new Date().toISOString().slice(0, 10)})

原 Supabase 项目 \`${FITNESS_REF}\`（FitnessOS）在合并进 Life OS 前的快照。

## 文件

| 文件 | 说明 |
|------|------|
| \`project.json\` | 项目元数据 |
| \`schema.sql\` | 原 public schema 迁移 |
| \`data.json\` | 全部业务表数据 (${counts}) |
| \`auth-users.json\` | auth.users 摘要（无密码） |

## 合并去向

- 目标项目：**Life OS** (\`iueozzuctstwvzbcxcyh\`)
- Fitness 数据 schema：**\`fitness.*\`**
- 用户 UUID 已映射到 Life OS Finance 账号

此目录可在确认 Life OS 正常后安全删除旧 FitnessOS 云端项目。
`;
  writeFileSync(join(OUT_DIR, "README.md"), readme);
  console.log(`[archive] wrote ${OUT_DIR}`);
  console.log(`[archive] rows: ${counts}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
