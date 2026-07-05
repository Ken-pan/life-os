import type { Account } from "../types";

export interface CardPortal {
  /** 发卡机构展示名 */
  issuer: string;
  /** 官方登录 / 付款入口 */
  url: string;
  /** 付款是否主要依赖手机 App（网页仅登录或查看） */
  appPreferred?: boolean;
}

/** 按账户名称匹配发卡机构门户；先匹配更具体的规则。 */
const ISSUER_RULES: { test: RegExp; portal: CardPortal }[] = [
  {
    test: /apple\s*card/i,
    portal: { issuer: "Apple Card", url: "https://card.apple.com/" },
  },
  {
    test: /best\s*buy|citi/i,
    portal: { issuer: "Citi", url: "https://online.citi.com/US/login.do" },
  },
  {
    test: /bank\s*of\s*america|\bbofa\b/i,
    portal: { issuer: "Bank of America", url: "https://www.bankofamerica.com/" },
  },
  {
    test: /chase/i,
    portal: { issuer: "Chase", url: "https://www.chase.com/paycard" },
  },
  {
    test: /discover/i,
    portal: { issuer: "Discover", url: "https://www.discover.com/login/" },
  },
  {
    test: /robinhood/i,
    portal: {
      issuer: "Robinhood",
      url: "https://robinhood.com/login",
      appPreferred: true,
    },
  },
  {
    test: /target|red\s*card|redcard|circle\s*card/i,
    portal: { issuer: "Target", url: "https://www.target.com/mycirclecard" },
  },
  {
    test: /wells\s*fargo|\bwf\b/i,
    portal: {
      issuer: "Wells Fargo",
      url: "https://connect.secure.wellsfargo.com/auth/login/present",
    },
  },
  {
    test: /amex|american\s*express/i,
    portal: { issuer: "Amex", url: "https://www.americanexpress.com/en-us/account/login" },
  },
  {
    test: /\bbilt\b/i,
    portal: { issuer: "Bilt", url: "https://www.biltrewards.com/login" },
  },
  {
    test: /alaska|bank\s*of\s*america.*visa/i,
    portal: { issuer: "Alaska Airlines Visa", url: "https://www.bankofamerica.com/" },
  },
  {
    test: /capital\s*one/i,
    portal: { issuer: "Capital One", url: "https://verified.capitalone.com/auth/signin" },
  },
  {
    test: /us\s*bank/i,
    portal: { issuer: "U.S. Bank", url: "https://onlinebanking.usbank.com/auth/login/" },
  },
];

function matchPortal(name: string): CardPortal | null {
  const n = name.trim();
  if (!n) return null;
  for (const rule of ISSUER_RULES) {
    if (rule.test.test(n)) return rule.portal;
  }
  return null;
}

/** 解析信用卡账户对应的官方登录/付款入口。 */
export function resolveCardPortal(account: Pick<Account, "type" | "name">): CardPortal | null {
  if (account.type !== "credit-card") return null;
  return matchPortal(account.name);
}

/** 从「{账户名} 账单」类标签反查门户（用于今日页日历/账单列表）。 */
export function resolveCardPortalFromBillLabel(label: string): CardPortal | null {
  const name = label.replace(/\s*账单\s*$/, "").trim();
  return matchPortal(name);
}
