#!/usr/bin/env node
/** 独立 smoke test：extension/popup/debugLog.js 导出结构。 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = readFileSync(join(root, "extension/popup/debugLog.js"), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const { buildDebugExport } = sandbox.window.FOS_DEBUG_LOG;

const sample = {
  manifest: { name: "Finance OS Sync", version: "0.2.0", manifest_version: 3 },
  userAgent: "node-smoke",
  state: { phase: "error", detail: "TypeError: x", at: Date.now() - 60_000 },
  log: {
    entries: [
      {
        at: new Date().toISOString(),
        phase: "dashboard",
        level: "warn",
        message: "DOM 探测超时：dashboard",
        extra: { code: "PROBE_TIMEOUT", phase: "dashboard", timeoutMs: 8000 },
      },
    ],
  },
  performance: {
    lastRun: {
      probeTimeouts: [{ phase: "dashboard", timeoutMs: 8000, path: "/dashboard", atMs: 9000 }],
      routeTimeouts: [],
    },
  },
  dlq: [{ id: "1", source: "robinhood", kind: "holdings", reason: "timeout" }],
  inFlight: [],
  queue: [],
  tabs: [],
};

const out = buildDebugExport(sample);
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

assert(out.schema === "finance-os-sync-debug/v2", "schema");
assert(out.meta.extension.version === "0.2.0", "version");
assert(out.diagnosis.issues.some((i) => i.code === "PROBE_TIMEOUT"), "PROBE_TIMEOUT");
assert(out.diagnosis.issues.some((i) => i.code === "DLQ_NON_EMPTY"), "DLQ");
assert(out.errors.length >= 1, "errors");
console.log("extension debugLog smoke OK:", out.diagnosis.headline);
