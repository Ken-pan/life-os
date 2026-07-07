import type { Txn } from "./transactions";
import { hasPurchaseEnrichment, uniqueLineItems, type PurchaseEnrichmentSource } from "./purchaseEnrichment";

/** 扩展导入时误写入 account 的数据源名称（不是真实付款账户）。 */
export const IMPORT_PIPELINE_ACCOUNTS = ["Rocket Money", "Robinhood", "Fidelity"] as const;

export type ImportPipelineAccount = (typeof IMPORT_PIPELINE_ACCOUNTS)[number];

export function isImportPipelineAccount(account: string | undefined | null): boolean {
  const a = account?.trim() ?? "";
  if (!a) return false;
  return IMPORT_PIPELINE_ACCOUNTS.some((label) => label.toLowerCase() === a.toLowerCase());
}

/** 账单描述 → 更易读的商户名（取首段、去多余空白）。 */
export function statementToMerchant(statement: string): string {
  const line = statement
    .split(/\n|\|/)[0]
    ?.replace(/\s+/g, " ")
    .trim();
  if (!line) return "";
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

export function merchantMatchesCategory(merchant: string, category: string): boolean {
  const m = merchant.trim().toLowerCase();
  const c = category.trim().toLowerCase();
  if (!m || !c) return false;
  return m === c;
}

/** 扩展 capture 行 → 入库商户名。 */
export function resolveCaptureMerchant(row: {
  merchant: string;
  category: string;
  statement?: string;
}): string {
  const merchant = row.merchant?.trim() ?? "";
  const category = row.category?.trim() ?? "";
  const statement = row.statement?.trim() ?? "";
  if (
    statement &&
    (!merchant || merchantMatchesCategory(merchant, category))
  ) {
    const fromStmt = statementToMerchant(statement);
    if (fromStmt) return fromStmt;
  }
  return merchant || statementToMerchant(statement) || "Unknown";
}

/** 扩展 capture 行 → 入库账户（卡/账户末四位或机构名，而非「Rocket Money」）。 */
export function resolveCaptureAccount(row: { account?: string }): string {
  const acct = row.account?.trim();
  if (acct && !isImportPipelineAccount(acct)) return acct;
  return "Unknown";
}

/** 银行描述里的冗长商户名 → 简短店名（避免移动端截断）。 */
export function normalizeMerchantDisplayName(
  merchant: string,
  source?: PurchaseEnrichmentSource,
): string {
  const m = merchant.trim();
  if (!m) return m;
  if (source === "amazon" || /^amazon\b/i.test(m)) {
    if (/^amazon\s+(purchase|order|pay|mktplace|marketplace|digital|retail)/i.test(m)) {
      return "Amazon";
    }
    if (/^amazon\b/i.test(m) && m.length > 14) return "Amazon";
  }
  if (source === "bestbuy" || /^best\s*buy/i.test(m)) {
    return m.length > 12 ? "Best Buy" : m;
  }
  if (source === "target" || /^target\b/i.test(m)) {
    return m.length > 10 ? "Target" : m;
  }
  return m;
}

/** 账本主标题：商家 / 账单描述，不显示类别。 */
export function ledgerTitle(txn: Txn): string {
  const merchant = txn.merchant?.trim() ?? "";
  const category = txn.category?.trim() ?? "";
  const source = txn.purchaseEnrichment?.source;

  if (merchant && !merchantMatchesCategory(merchant, category)) {
    return normalizeMerchantDisplayName(merchant, source);
  }

  if (hasPurchaseEnrichment(txn)) {
    if (source === "amazon") {
      return /amazon/i.test(merchant) ? normalizeMerchantDisplayName(merchant, source) : "Amazon";
    }
    if (source === "bestbuy") {
      return /best\s*buy/i.test(merchant) ? normalizeMerchantDisplayName(merchant, source) : "Best Buy";
    }
    if (source === "target") {
      return /target/i.test(merchant) ? normalizeMerchantDisplayName(merchant, source) : "Target";
    }
    const items = uniqueLineItems(txn.purchaseEnrichment.lineItems);
    if (items[0]?.title) return items[0].title;
  }

  if (merchant && merchantMatchesCategory(merchant, category)) {
    return "—";
  }

  return normalizeMerchantDisplayName(merchant, source) || category || "—";
}

/** 副标题：类别 · 付款账户 · 同步来源。 */
export function ledgerMetaParts(txn: Txn): {
  category: string | null;
  account: string | null;
  importSource: ImportPipelineAccount | null;
} {
  const category = txn.category?.trim() ?? "";
  const accountRaw = txn.account?.trim() ?? "";

  const categoryLabel = category || null;

  const importSource = isImportPipelineAccount(accountRaw)
    ? (IMPORT_PIPELINE_ACCOUNTS.find((l) => l.toLowerCase() === accountRaw.toLowerCase()) ?? null)
    : null;

  const account =
    accountRaw && !importSource && accountRaw !== "Unknown" && accountRaw !== "Manual"
      ? accountRaw
      : null;

  return { category: categoryLabel, account, importSource };
}

export function ledgerMetaLine(
  txn: Txn,
  labels: { viaImport: (source: string) => string },
): string {
  const { category, account, importSource } = ledgerMetaParts(txn);
  const parts: string[] = [];
  if (category) parts.push(category);
  if (account) parts.push(account);
  if (importSource) parts.push(labels.viaImport(importSource));
  return parts.join(" · ");
}

/** 桌面端账户列：仅真实付款账户。 */
export function ledgerAccountColumn(txn: Txn): string | null {
  return ledgerMetaParts(txn).account;
}
