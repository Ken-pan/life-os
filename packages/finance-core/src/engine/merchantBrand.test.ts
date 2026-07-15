import { describe, expect, it } from 'vitest'
import { merchantBrandKey, KNOWN_BRAND_IDS } from './merchantBrand'

describe('merchantBrandKey', () => {
  it('reduces the many ways a feed spells one brand to a single id', () => {
    // All real descriptors seen in the ledger for the same store.
    for (const raw of [
      'Amazon',
      'Amazon Purchase',
      'AMAZON MKTPL*942YV4SB3',
      'Amazon.com*1X0JK7T93',
      'AMZN Mktp US',
      'Amazon Prime',
    ]) {
      expect(merchantBrandKey(raw), raw).toBe('amazon')
    }
  })

  it('matches case-insensitively and tolerates the aggregator’s tidy names', () => {
    expect(merchantBrandKey('BEST BUY')).toBe('best-buy')
    expect(merchantBrandKey('Best Buy Purchase')).toBe('best-buy')
    expect(merchantBrandKey('best buy #1234')).toBe('best-buy')
  })

  it('keeps more specific rules ahead of the generic ones', () => {
    expect(merchantBrandKey('Uber Eats')).toBe('uber-eats')
    expect(merchantBrandKey('UBER   *TRIP')).toBe('uber')
    expect(merchantBrandKey('Google *YouTube Premium')).toBe('youtube')
    expect(merchantBrandKey('GOOGLE *CLOUD')).toBe('google')
  })

  it('resolves processor-prefixed descriptors', () => {
    expect(merchantBrandKey('DD *DOORDASH JAMBAJUIC')).toBe('doordash')
    expect(merchantBrandKey('ALP*Taobao Shanghai 01/21 CN')).toBe('taobao')
    expect(merchantBrandKey('BPS*BILT RENT')).toBe('bilt')
    expect(merchantBrandKey('WEIXIN*Shanghai Starbu Shenzhen')).toBe('starbucks')
  })

  it('returns null for bank mechanics — a fee is not a store', () => {
    for (const raw of [
      'Interest Charge',
      'MONTHLY SERVICE FEE',
      'Zelle payment to NING 16805189828',
      'Online Transfer from SAV ...3851',
      'Online Payment',
      'CREDIT CARD PAYMENT',
      'Savings Transfer',
      // Fee wording is not always at the start of the descriptor.
      'Finance Charge* Cash Adv',
      'FOREIGN EXCHANGE RATE ADJUSTMENT FEE 12/10ALP*Gao D',
      'INTERNATIONAL INCOMING WIRE FEE',
    ]) {
      expect(merchantBrandKey(raw), raw).toBeNull()
    }
  })

  it('resolves the expanded brand set', () => {
    const cases: Array<[string, string]> = [
      ['SEPHORA #0521', 'sephora'],
      ["DOMINO'S 1234", 'dominos'],
      ['SHAKE SHACK SOUTH LAKE UNION', 'shake-shack'],
      ['Chewy.com', 'chewy'],
      ['T.J.Maxx #0891', 'tjmaxx'],
      ['FIVE GUYS SEATTLE', 'five-guys'],
      ["KIEHL'S SINCE 1851", 'kiehls'],
      ['H Mart Federal Way', 'h-mart'],
      ['DAISO JAPAN', 'daiso'],
      ['AMERICAN AIRLINES 0012345', 'american-airlines'],
      ['WL *Steam Purchase', 'steam'],
      ['MTA*NYCT PAYGO 2 BROADWAY', 'mta'],
      ['Quality Food Centers #123', 'qfc'],
      ['PANDA EXPRESS 2201', 'panda-express'],
      ['H&M US', 'hm'],
    ]
    for (const [raw, id] of cases) {
      expect(merchantBrandKey(raw), raw).toBe(id)
    }
  })

  it('keeps H Mart and H&M apart', () => {
    expect(merchantBrandKey('H Mart')).toBe('h-mart')
    expect(merchantBrandKey('HMART SEATTLE')).toBe('h-mart')
    expect(merchantBrandKey('H&M')).toBe('hm')
  })

  it('does not let short brand rules swallow unrelated descriptors', () => {
    // Guard against over-broad rules: these must NOT resolve to a brand.
    expect(merchantBrandKey('Shellfish Market')).toBeNull()
    expect(merchantBrandKey('Delltech Consulting')).toBeNull()
    expect(merchantBrandKey('Steamboat Cafe')).toBeNull()
    expect(merchantBrandKey('Teslaco Auto Repair')).toBeNull()
  })

  it('returns null for unknown local merchants rather than guessing', () => {
    expect(merchantBrandKey("TASTE OF XI'AN")).toBeNull()
    expect(merchantBrandKey('PHO HA RESTAURANT')).toBeNull()
    expect(merchantBrandKey('Swr Ultrachiropractic')).toBeNull()
  })

  it('handles empty / missing input', () => {
    expect(merchantBrandKey('')).toBeNull()
    expect(merchantBrandKey(null)).toBeNull()
    expect(merchantBrandKey(undefined)).toBeNull()
    expect(merchantBrandKey('   ')).toBeNull()
  })

  it('exposes a de-duplicated id list for the asset pipeline', () => {
    expect(KNOWN_BRAND_IDS).toContain('amazon')
    expect(new Set(KNOWN_BRAND_IDS).size).toBe(KNOWN_BRAND_IDS.length)
  })
})
