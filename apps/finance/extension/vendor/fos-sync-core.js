// 构建产物,勿手改:npm run ext:build-core -w finance-os(源 packages/finance-core/src/extension-sync.ts)
"use strict";
var FOS_CORE = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // extension/coreEntry.mjs
  var coreEntry_exports = {};
  __export(coreEntry_exports, {
    captureRowsToRpcPayloads: () => captureRowsToRpcPayloads,
    computeEnvelopePayloadHash: () => computeEnvelopePayloadHash,
    isCaptureEnvelope: () => isCaptureEnvelope
  });

  // ../../packages/finance-core/src/engine/ledgerDisplay.ts
  var IMPORT_PIPELINE_ACCOUNTS = ["Rocket Money", "Robinhood", "Fidelity"];
  function isImportPipelineAccount(account) {
    const a = account?.trim() ?? "";
    if (!a) return false;
    return IMPORT_PIPELINE_ACCOUNTS.some((label) => label.toLowerCase() === a.toLowerCase());
  }
  function statementToMerchant(statement) {
    const line = statement.split(/\n|\|/)[0]?.replace(/\s+/g, " ").trim();
    if (!line) return "";
    return line.length > 120 ? `${line.slice(0, 117)}\u2026` : line;
  }
  function merchantMatchesCategory(merchant, category) {
    const m = merchant.trim().toLowerCase();
    const c = category.trim().toLowerCase();
    if (!m || !c) return false;
    return m === c;
  }
  function resolveCaptureMerchant(row) {
    const merchant = row.merchant?.trim() ?? "";
    const category = row.category?.trim() ?? "";
    const statement = row.statement?.trim() ?? "";
    if (statement && (!merchant || merchantMatchesCategory(merchant, category))) {
      const fromStmt = statementToMerchant(statement);
      if (fromStmt) return fromStmt;
    }
    return merchant || statementToMerchant(statement) || "Unknown";
  }
  function resolveCaptureAccount(row) {
    const acct = row.account?.trim();
    if (acct && !isImportPipelineAccount(acct)) return acct;
    return "Unknown";
  }

  // ../../packages/finance-core/src/extension-sync.ts
  var PAYROLL_NAME_RE = /\b(payroll|direct\s*dep(osit)?|salary|wages|paycheck)\b|工资|薪资|薪酬/i;
  function flowForCaptureRow(row, ctx) {
    const cat = normalize(row.category);
    if (cat === "income") return "income";
    if (cat === "internal transfers" || cat === "savings transfer")
      return "internal_transfer";
    if (cat === "credit card payment") return "credit_card_payment";
    if (cat === "ignore") return "ignored";
    if (row.credit) {
      const name = `${row.merchant ?? ""} ${row.statement ?? ""}`;
      if (PAYROLL_NAME_RE.test(name)) return "income";
      const merchant = resolveCaptureMerchant(row);
      if (ctx?.isIncomeMerchant?.(merchant)) return "income";
      return "refund_or_reversal";
    }
    return "expense";
  }
  function captureRowsToRpcPayloads(rows, source, incomeMerchants = []) {
    const ctx = {
      isIncomeMerchant: (m) => Boolean(m) && incomeMerchants.some((n) => nameMatches(n, m))
    };
    const seen = /* @__PURE__ */ new Set();
    const payloads = [];
    const keyless = [];
    for (const row of rows) {
      if (!row.platformId) {
        if (!row.pending) keyless.push(row);
        continue;
      }
      if (seen.has(row.platformId)) continue;
      seen.add(row.platformId);
      payloads.push(newTxnToExtensionSyncPayload(captureRowToTxn(row, source, ctx)));
    }
    return { payloads, keyless };
  }
  function captureRowToTxn(row, _source, ctx) {
    const abs = Math.abs(row.amount);
    const flow = flowForCaptureRow(row, ctx);
    const base = {
      date: row.date,
      merchant: resolveCaptureMerchant(row),
      category: row.category || "Uncategorized",
      account: resolveCaptureAccount(row),
      source: "import",
      platformId: row.platformId,
      // pending 只对带 platformId 的行有意义（无稳定键无法转正对账，plan 阶段已跳过）。
      ...row.pending && row.platformId ? { pending: true } : {}
    };
    switch (flow) {
      case "income":
        return {
          ...base,
          flow,
          amount: -abs,
          budgetImpact: 0,
          inSpending: false,
          inCashFlow: true
        };
      case "refund_or_reversal":
        return {
          ...base,
          flow,
          amount: -abs,
          budgetImpact: abs,
          inSpending: true,
          inCashFlow: true
        };
      case "expense":
        return {
          ...base,
          flow,
          amount: abs,
          budgetImpact: -abs,
          inSpending: true,
          inCashFlow: true
        };
      case "ignored":
        return {
          ...base,
          flow,
          amount: row.credit ? -abs : abs,
          budgetImpact: 0,
          inSpending: false,
          inCashFlow: false,
          excludeReason: "extension-import-ignored"
        };
      default:
        return {
          ...base,
          flow,
          amount: row.credit ? -abs : abs,
          budgetImpact: 0,
          inSpending: false,
          inCashFlow: true
        };
    }
  }
  function canonicalEnvelopeJson(env) {
    return JSON.stringify({
      v: env.v,
      id: env.id,
      source: env.source,
      kind: env.kind,
      asOfDate: env.asOfDate,
      data: env.data
    });
  }
  function computeEnvelopePayloadHashSync(env) {
    const canonical = canonicalEnvelopeJson(env);
    let h = 2166136261;
    for (let i = 0; i < canonical.length; i += 1) {
      h ^= canonical.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  async function computeEnvelopePayloadHash(env) {
    const canonical = canonicalEnvelopeJson(env);
    if (globalThis.crypto?.subtle) {
      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonical)
      );
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return computeEnvelopePayloadHashSync(env);
  }
  function sanitizeExtensionSyncTxnPayload(payload) {
    const out = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === void 0) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      out[key] = value;
    }
    return out;
  }
  function newTxnToExtensionSyncPayload(t) {
    return sanitizeExtensionSyncTxnPayload({
      date: t.date,
      merchant: t.merchant,
      category: t.category,
      account: t.account,
      flow_type: t.flow,
      amount: t.amount,
      budget_impact: t.budgetImpact,
      include_in_spending_analytics: t.inSpending,
      include_in_cash_flow_history: t.inCashFlow,
      source: t.source ?? "import",
      ...t.excludeReason ? { exclude_reason: t.excludeReason } : {},
      ...t.platformId ? { platform_id: t.platformId } : {},
      ...t.pending ? { pending: true } : {}
    });
  }
  function normalize(s) {
    return s.trim().toLowerCase().replace(/\s+/g, " ");
  }
  function normalizeForMatch(s) {
    return normalize(s).replace(/[®™©]/g, "").replace(/401\s*\(\s*k\s*\)/gi, "401k").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function nameMatches(a, b) {
    const na = normalizeForMatch(a);
    const nb = normalizeForMatch(b);
    if (na === nb) return true;
    const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
    if (short.length < 2) return false;
    const idx = long.indexOf(short);
    if (idx < 0) return false;
    const before = idx === 0 ? "" : long[idx - 1];
    const after = idx + short.length >= long.length ? "" : long[idx + short.length];
    const isWordChar = (c) => /[a-z0-9]/.test(c);
    return (!before || !isWordChar(before)) && (!after || !isWordChar(after));
  }
  function isCaptureEnvelope(v) {
    if (typeof v !== "object" || v === null) return false;
    const e = v;
    return e.v === 1 && typeof e.id === "string" && (e.source === "robinhood" || e.source === "rocketmoney" || e.source === "fidelity" || e.source === "amazon" || e.source === "target" || e.source === "bestbuy") && (e.kind === "holdings" || e.kind === "accounts" || e.kind === "transactions" || e.kind === "recurring" || e.kind === "merchant_orders") && typeof e.asOfDate === "string" && typeof e.data === "object" && e.data !== null;
  }
  return __toCommonJS(coreEntry_exports);
})();
