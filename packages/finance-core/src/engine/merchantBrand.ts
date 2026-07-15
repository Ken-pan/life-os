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

/**
 * Ledger rows that are bank mechanics, not a store. Never get a brand logo.
 * Fee wording varies a lot per issuer, so match on the distinctive phrase anywhere
 * in the descriptor rather than only at the start ("Finance Charge* Cash Adv",
 * "FOREIGN EXCHANGE RATE ADJUSTMENT FEE 12/10ALP*…").
 */
const NON_MERCHANT_RE =
  /^(interest charge|monthly service fee|late fee|annual membership fee|foreign transaction fee|atm fee|overdraft|zelle |online (transfer|payment)|payment thank you|autopay|balance transfer|cash advance|credit card payment|savings transfer|recurring transfer|wire transfer|deposit|withdrawal)|(finance charge|foreign exchange rate adjustment|incoming wire fee|outgoing wire fee|returned item fee|stop payment fee|cash advance fee)/i

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
  // Feeds write DoorDash both ways: "DD *DOORDASH JAMBAJUIC" and "DD DOORDASH TIANFU".
  [/^(dd[ *]+doordash|doordash|door dash)/i, 'doordash'],
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
  [/^chewy/i, 'chewy'],
  [/^24 hour fitness/i, '24-hour-fitness'],
  [/^planet fitness/i, 'planet-fitness'],
  [/^supercuts/i, 'supercuts'],
  [/^lemonade/i, 'lemonade'],
  [/^astound/i, 'astound'],
  [/^rocket money/i, 'rocket-money'],
  [/^(bps\*)?bilt/i, 'bilt'],
  [/^robinhood/i, 'robinhood'],
  // Robinhood Gold's $50/yr bills as a bare "Gold Annual Subscription[ Fee]" with
  // no brand name at all — confirmed by the charges landing on the Robinhood card.
  // Anchored end-to-end because the phrase is only unambiguous as a whole string:
  // "TST* 19 GOLD TAIWANESE RE" and "Golden Corral" must not inherit the logo.
  [/^gold annual subscription( fee)?$/i, 'robinhood'],
  [/^(cl \*)?chase travel/i, 'chase'],
  [/^chase/i, 'chase'],
  [/^panera/i, 'panera'],

  // ── 扩展批次 ────────────────────────────────────────────────────────────
  // 注意：短/通用词（gap、ross、x、lg、hp、mint、bolt）故意不做规则——它们会在
  // 无关描述里误命中，宁可留占位符也不放错 logo。
  // Retail / grocery
  [/^sephora/i, 'sephora'],
  [/^ulta/i, 'ulta'],
  [/^kiehl'?s/i, 'kiehls'],
  [/^t\.?j\.? ?maxx|^tjmaxx/i, 'tjmaxx'],
  [/^marshalls/i, 'marshalls'],
  [/^macy'?s/i, 'macys'],
  [/^zara/i, 'zara'],
  [/^h ?& ?m\b/i, 'hm'],
  [/^instacart/i, 'instacart'],
  [/^ebay/i, 'ebay'],
  [/^etsy/i, 'etsy'],
  [/^aliexpress/i, 'aliexpress'],
  [/^lidl/i, 'lidl'],
  [/^quality food centers|^qfc\b/i, 'qfc'],
  // Food
  [/^shake shack/i, 'shake-shack'],
  [/^domino'?s/i, 'dominos'],
  [/^five guys/i, 'five-guys'],
  [/^panda express/i, 'panda-express'],
  [/^paris baguette/i, 'paris-baguette'],
  [/^burger king|^bk /i, 'burger-king'],
  [/^taco bell/i, 'taco-bell'],
  [/^kfc\b/i, 'kfc'],
  // Apparel / sport
  [/^the north face|^north face/i, 'the-north-face'],
  [/^new balance/i, 'new-balance'],
  [/^puma\b/i, 'puma'],
  [/^under ?armour/i, 'under-armour'],
  [/^reebok/i, 'reebok'],
  [/^arc'?teryx/i, 'arcteryx'],
  [/^dick'?s sporting/i, 'dicks-sporting-goods'],
  // Travel
  [/^american airlines|^aa\.com/i, 'american-airlines'],
  [/^southwest air/i, 'southwest'],
  [/^jetblue/i, 'jetblue'],
  [/^hilton/i, 'hilton'],
  [/^expedia/i, 'expedia'],
  [/^booking\.com/i, 'booking'],
  [/^tripadvisor/i, 'tripadvisor'],
  // Tech / consumer
  [/^sony\b/i, 'sony'],
  [/^samsung/i, 'samsung'],
  [/^dell\b/i, 'dell'],
  [/^playstation|^sony interactive/i, 'playstation'],
  [/^(wl \*)?steam( purchase|powered)?\b/i, 'steam'],
  [/^tesla\b/i, 'tesla'],
  [/^shell oil|^shell service|^shell \d/i, 'shell'],
  // Media / subscriptions
  [/^audible/i, 'audible'],
  [/^twitch/i, 'twitch'],
  [/^discord/i, 'discord'],
  [/^reddit/i, 'reddit'],
  [/^zoom\.us|^zoom video/i, 'zoom'],
  [/^dropbox/i, 'dropbox'],
  [/^duolingo/i, 'duolingo'],
  [/^coursera/i, 'coursera'],
  [/^patreon/i, 'patreon'],
  [/^substack/i, 'substack'],
  // Fitness / health
  [/^strava/i, 'strava'],
  [/^peloton/i, 'peloton'],
  [/^fitbit/i, 'fitbit'],
  [/^garmin/i, 'garmin'],
  // Fin / telecom
  [/^cash ?app/i, 'cashapp'],
  [/^stripe\b/i, 'stripe'],
  [/^coinbase/i, 'coinbase'],
  [/^american express|^amex\b/i, 'amex'],
  [/^discover(?! card services)/i, 'discover'],
  [/^verizon/i, 'verizon'],
  [/^at&t|^att\*/i, 'att'],
  [/^spectrum/i, 'spectrum'],
  // Dev / AI
  [/^perplexity/i, 'perplexity'],
  [/^vercel/i, 'vercel'],
  [/^supabase/i, 'supabase'],
  [/^cloudflare/i, 'cloudflare'],
  [/^namecheap/i, 'namecheap'],
  [/^shopify/i, 'shopify'],
  [/^obsidian/i, 'obsidian'],
  [/^todoist/i, 'todoist'],
  // Transit
  [/^mta\*|^mta nyct/i, 'mta'],
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
