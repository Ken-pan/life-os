// Raw bank descriptor → brand id, for merchant logo lookup.
//
// Card/bank feeds and the Rocket Money aggregator describe the same store many
// different ways ("Amazon", "AMAZON MKTPL*942YV4SB3", "Amazon.com*1X0JK7T93",
// "Amazon Purchase"), so a ledger row can only be matched to a logo after the
// descriptor is reduced to a stable brand key.
//
// Only brands we actually ship a logo for need an entry here; everything else
// resolves to null and renders the neutral placeholder. Rules are ordered —
// the first match wins — so put more specific patterns first (uber eats vs uber).

/** Ledger rows that are bank mechanics, not a store. Never get a brand logo. */
const NON_MERCHANT_RE =
  /^(interest charge|monthly service fee|late fee|annual membership fee|foreign transaction fee|atm fee|overdraft|zelle |online (transfer|payment)|payment thank you|autopay|balance transfer|cash advance|credit card payment|savings transfer|recurring transfer|wire transfer|deposit|withdrawal)/i

/** first match wins */
const BRAND_RULES: Array<[RegExp, string]> = [
  // ── Marketplaces / retail ───────────────────────────────────────────────
  [/^(amazon|amzn|amazon\.com|amazon mktpl|amazon retail|amazon prime|amazon digital)/i, 'amazon'],
  [/^best ?buy/i, 'best-buy'],
  [/^target/i, 'target'],
  [/^costco/i, 'costco'],
  [/^walmart|^wal-mart/i, 'walmart'],
  [/^nordstrom/i, 'nordstrom'],
  [/^ikea/i, 'ikea'],
  [/^(the )?home ?depot/i, 'home-depot'],
  [/^daiso/i, 'daiso'],
  [/^uniqlo/i, 'uniqlo'],
  [/^lululemon/i, 'lululemon'],
  [/^claire'?s/i, 'claires'],

  // ── Grocery ────────────────────────────────────────────────────────────
  [/^t ?& ?t supermarket|^t&t /i, 't-and-t'],
  [/^trader joe/i, 'trader-joes'],
  [/^whole ?foods|^wholefds/i, 'whole-foods'],
  [/^safeway/i, 'safeway'],
  [/^jewel ?-? ?osco/i, 'jewel-osco'],
  [/^h ?mart/i, 'h-mart'],
  [/^99 ranch|^ranch 99/i, '99-ranch'],
  [/^asian family market/i, 'asian-family-market'],

  // ── Food / delivery ────────────────────────────────────────────────────
  [/^starbucks|^weixin\*shanghai starbu/i, 'starbucks'],
  [/^mcdonald/i, 'mcdonalds'],
  [/^chipotle/i, 'chipotle'],
  [/^(dd \*|doordash|door dash)/i, 'doordash'],
  [/^uber ?eats/i, 'uber-eats'],
  [/^fantuan/i, 'fantuan'],
  [/^hungrypanda/i, 'hungrypanda'],
  [/^7-? ?eleven/i, 'seven-eleven'],

  // ── Transport / travel ─────────────────────────────────────────────────
  [/^uber(?! ?eats)/i, 'uber'],
  [/^lyft/i, 'lyft'],
  [/^alaska air|^wifionboard alaska/i, 'alaska-airlines'],
  [/^united air/i, 'united-airlines'],
  [/^delta air/i, 'delta'],
  [/^airbnb/i, 'airbnb'],
  [/^marriott/i, 'marriott'],
  [/^westin/i, 'westin'],

  // ── Tech / subscriptions ───────────────────────────────────────────────
  [/^anthropic|claude\.ai/i, 'anthropic'],
  [/^(openai|chatgpt)/i, 'openai'],
  [/^cursor/i, 'cursor'],
  [/^github/i, 'github'],
  [/^godaddy/i, 'godaddy'],
  [/^netlify/i, 'netlify'],
  [/^vercel/i, 'vercel'],
  [/^notion/i, 'notion'],
  [/^figma/i, 'figma'],
  [/^netflix/i, 'netflix'],
  [/^spotify/i, 'spotify'],
  [/^(youtube|google \*youtube)/i, 'youtube'],
  [/^(apple\.com|apple store|apple$|itunes|apple pay)/i, 'apple'],
  [/^facebk|^facebook|^meta ?platforms/i, 'facebook'],
  [/^google(?! \*youtube)/i, 'google'],

  // ── China / payments ───────────────────────────────────────────────────
  [/^(taobao|alp\*taobao|taobao\.com)/i, 'taobao'],
  [/^(weixin|wechat)/i, 'wechat'],
  [/^paypal|^pp\*/i, 'paypal'],
  [/^venmo/i, 'venmo'],

  // ── Health / services / bills ──────────────────────────────────────────
  [/^walgreens/i, 'walgreens'],
  [/^cvs/i, 'cvs'],
  [/^petco/i, 'petco'],
  [/^petsmart/i, 'petsmart'],
  [/^24 hour fitness/i, '24-hour-fitness'],
  [/^planet fitness/i, 'planet-fitness'],
  [/^supercuts/i, 'supercuts'],
  [/^lemonade/i, 'lemonade'],
  [/^astound/i, 'astound'],
  [/^rocket money/i, 'rocket-money'],
  [/^(bps\*)?bilt/i, 'bilt'],
  [/^robinhood/i, 'robinhood'],
  [/^chase/i, 'chase'],
]

/**
 * Reduce a raw merchant descriptor to a stable brand id, or null when the row is
 * bank mechanics or an unrecognized (usually local) merchant — both render the
 * neutral placeholder.
 */
export function merchantBrandKey(raw: string | undefined | null): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (NON_MERCHANT_RE.test(s)) return null
  for (const [re, id] of BRAND_RULES) {
    if (re.test(s)) return id
  }
  return null
}

/** Every brand id this module can produce — the set logo assets must cover. */
export const KNOWN_BRAND_IDS: readonly string[] = [
  ...new Set(BRAND_RULES.map(([, id]) => id)),
]
