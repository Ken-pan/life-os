import type { AccountType } from "../types";

export type InstitutionId =
  | "chase"
  | "bank-of-america"
  | "wells-fargo"
  | "citi"
  | "amex"
  | "discover"
  | "capital-one"
  | "us-bank"
  | "robinhood"
  | "fidelity"
  | "vanguard"
  | "apple-card"
  | "target"
  | "bilt"
  | "alaska"
  | "rocket-money"
  | "checking"
  | "savings"
  | "hsa"
  | "brokerage"
  | "retirement"
  | "property"
  | "credit-card"
  | "mortgage"
  | "auto-loan"
  | "other";

export interface InstitutionMeta {
  id: InstitutionId;
  label: string;
  /** 用于 fallback 圆标 */
  color: string;
  initials: string;
}

const INSTITUTIONS: Record<InstitutionId, InstitutionMeta> = {
  chase: { id: "chase", label: "Chase", color: "#117ACA", initials: "CH" },
  "bank-of-america": { id: "bank-of-america", label: "Bank of America", color: "#E31837", initials: "BA" },
  "wells-fargo": { id: "wells-fargo", label: "Wells Fargo", color: "#D71E28", initials: "WF" },
  citi: { id: "citi", label: "Citi", color: "#003B70", initials: "Ci" },
  amex: { id: "amex", label: "Amex", color: "#006FCF", initials: "AX" },
  discover: { id: "discover", label: "Discover", color: "#FF6000", initials: "Di" },
  "capital-one": { id: "capital-one", label: "Capital One", color: "#D03027", initials: "C1" },
  "us-bank": { id: "us-bank", label: "U.S. Bank", color: "#D52B1E", initials: "US" },
  robinhood: { id: "robinhood", label: "Robinhood", color: "#00C805", initials: "RH" },
  fidelity: { id: "fidelity", label: "Fidelity", color: "#4AA564", initials: "Fi" },
  vanguard: { id: "vanguard", label: "Vanguard", color: "#96151D", initials: "VG" },
  "apple-card": { id: "apple-card", label: "Apple Card", color: "#1D1D1F", initials: "" },
  target: { id: "target", label: "Target", color: "#CC0000", initials: "T" },
  bilt: { id: "bilt", label: "Bilt", color: "#1A1A2E", initials: "Bi" },
  alaska: { id: "alaska", label: "Alaska Airlines", color: "#01426A", initials: "AS" },
  "rocket-money": { id: "rocket-money", label: "Rocket Money", color: "#6C47FF", initials: "RM" },
  checking: { id: "checking", label: "Checking", color: "#0A6F73", initials: "Ck" },
  savings: { id: "savings", label: "Savings", color: "#087A5B", initials: "Sv" },
  hsa: { id: "hsa", label: "HSA", color: "#2B65B1", initials: "HS" },
  brokerage: { id: "brokerage", label: "Brokerage", color: "#5B4FCF", initials: "Br" },
  retirement: { id: "retirement", label: "Retirement", color: "#8B6914", initials: "Rt" },
  property: { id: "property", label: "Property", color: "#6B5B4F", initials: "Pr" },
  "credit-card": { id: "credit-card", label: "Credit Card", color: "#B9364F", initials: "CC" },
  mortgage: { id: "mortgage", label: "Mortgage", color: "#9A5B08", initials: "Mg" },
  "auto-loan": { id: "auto-loan", label: "Auto Loan", color: "#51605F", initials: "Au" },
  other: { id: "other", label: "Account", color: "#6F7D7D", initials: "Ac" },
};

const NAME_RULES: { test: RegExp; id: InstitutionId }[] = [
  { test: /apple\s*card/i, id: "apple-card" },
  { test: /best\s*buy|citi/i, id: "citi" },
  { test: /bank\s*of\s*america|\bbofa\b/i, id: "bank-of-america" },
  { test: /chase/i, id: "chase" },
  { test: /discover/i, id: "discover" },
  { test: /robinhood/i, id: "robinhood" },
  { test: /target|red\s*card|redcard|circle\s*card/i, id: "target" },
  { test: /wells\s*fargo|\bwf\b/i, id: "wells-fargo" },
  { test: /amex|american\s*express/i, id: "amex" },
  { test: /\bbilt\b/i, id: "bilt" },
  { test: /alaska|bank\s*of\s*america.*visa/i, id: "alaska" },
  { test: /capital\s*one/i, id: "capital-one" },
  { test: /us\s*bank/i, id: "us-bank" },
  { test: /fidelity|\bfdrxx\b/i, id: "fidelity" },
  { test: /vanguard|\bvti\b|\bvoo\b/i, id: "vanguard" },
  { test: /rocket\s*money/i, id: "rocket-money" },
];

const ISSUER_TO_ID: Record<string, InstitutionId> = {
  "Apple Card": "apple-card",
  Citi: "citi",
  "Bank of America": "bank-of-america",
  Chase: "chase",
  Discover: "discover",
  Robinhood: "robinhood",
  Target: "target",
  "Wells Fargo": "wells-fargo",
  Amex: "amex",
  Bilt: "bilt",
  "Alaska Airlines Visa": "alaska",
  "Capital One": "capital-one",
  "U.S. Bank": "us-bank",
  Fidelity: "fidelity",
  Vanguard: "vanguard",
  "Rocket Money": "rocket-money",
};

const SYNC_SOURCE_TO_ID: Record<string, InstitutionId> = {
  robinhood: "robinhood",
  fidelity: "fidelity",
  rocketmoney: "rocket-money",
};

const ACCOUNT_TYPE_TO_ID: Record<AccountType, InstitutionId> = {
  checking: "checking",
  savings: "savings",
  hsa: "hsa",
  brokerage: "brokerage",
  retirement: "retirement",
  property: "property",
  "credit-card": "credit-card",
  mortgage: "mortgage",
  "auto-loan": "auto-loan",
  other: "other",
};

function matchFromName(name: string): InstitutionId | null {
  const n = name.trim();
  if (!n) return null;
  for (const rule of NAME_RULES) {
    if (rule.test.test(n)) return rule.id;
  }
  return null;
}

export function getInstitutionMeta(id: InstitutionId): InstitutionMeta {
  return INSTITUTIONS[id];
}

export function institutionLogoSrc(id: InstitutionId): string {
  return `/assets/institutions/${id}.svg`;
}

export function resolveInstitutionFromIssuer(issuer: string): InstitutionMeta | null {
  const id = ISSUER_TO_ID[issuer];
  return id ? INSTITUTIONS[id] : null;
}

export function resolveInstitutionFromSource(source: string): InstitutionMeta | null {
  const id = SYNC_SOURCE_TO_ID[source];
  return id ? INSTITUTIONS[id] : null;
}

/** 从账户名称 + 类型解析机构品牌；名称优先，否则按账户类型 fallback。 */
export function resolveInstitution(
  name: string,
  accountType?: AccountType
): InstitutionMeta {
  const fromName = matchFromName(name);
  if (fromName) return INSTITUTIONS[fromName];
  if (accountType) return INSTITUTIONS[ACCOUNT_TYPE_TO_ID[accountType]];
  return INSTITUTIONS.other;
}

/** 从账单标签（如「Chase 账单」）解析。 */
export function resolveInstitutionFromBillLabel(label: string): InstitutionMeta | null {
  const name = label.replace(/\s*账单\s*$/, "").trim();
  const id = matchFromName(name);
  return id ? INSTITUTIONS[id] : null;
}

/** 综合发卡行/同步来源/账单标签/名称+类型解析机构信息（logo 组件与账户卡片共用）。 */
export function resolveInstitutionMetaFrom(props: {
  name?: string;
  accountType?: AccountType;
  issuer?: string;
  billLabel?: string;
  source?: string;
}): InstitutionMeta {
  if (props.issuer) {
    const fromIssuer = resolveInstitutionFromIssuer(props.issuer);
    if (fromIssuer) return fromIssuer;
  }
  if (props.source) {
    const fromSource = resolveInstitutionFromSource(props.source);
    if (fromSource) return fromSource;
  }
  if (props.billLabel) {
    const fromBill = resolveInstitutionFromBillLabel(props.billLabel);
    if (fromBill) return fromBill;
  }
  return resolveInstitution(props.name ?? "", props.accountType);
}
