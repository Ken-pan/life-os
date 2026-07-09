import { describe, expect, it, vi } from 'vitest'
import {
  hasPurchaseEnrichment,
  lineItemImageSrc,
  purchaseEnrichmentFromRow,
  setPurchaseImageBaseUrl,
  uniqueLineItems,
} from './purchaseEnrichment'

describe('purchaseEnrichmentFromRow', () => {
  it('parses amazon enrichment with numeric fields', () => {
    const row = {
      source: 'amazon',
      orderId: '123-4567890-1234567',
      orderTotal: 42.99,
      lineItems: [{ title: 'USB Hub', price: 19.99, asin: 'B001' }],
    }
    const e = purchaseEnrichmentFromRow(row)
    expect(e?.source).toBe('amazon')
    expect(e?.orderTotal).toBe(42.99)
    expect(e?.lineItems?.[0].price).toBe(19.99)
  })

  it('parses bestbuy and target sources', () => {
    expect(
      purchaseEnrichmentFromRow({ source: 'bestbuy', orderId: 'BBY01-1' })
        ?.source,
    ).toBe('bestbuy')
    expect(
      purchaseEnrichmentFromRow({ source: 'target', orderId: '912003' })
        ?.source,
    ).toBe('target')
  })

  it('rejects unknown source', () => {
    expect(purchaseEnrichmentFromRow({ source: 'walmart' })).toBeUndefined()
  })

  it('decodes HTML entities in line item titles', () => {
    const e = purchaseEnrichmentFromRow({
      source: 'target',
      lineItems: [{ title: 'Bin &#8482; test' }],
    })
    expect(e?.lineItems?.[0].title).toContain('™')
  })
})

describe('lineItemImageSrc', () => {
  it('prefers imageUrl', () => {
    expect(
      lineItemImageSrc({
        title: 'x',
        imageUrl: 'https://cdn.example/a.jpg',
        imageStoragePath: 'user/amazon/x.jpg',
      }),
    ).toBe('https://cdn.example/a.jpg')
  })

  it('builds Supabase public URL from imageStoragePath', () => {
    setPurchaseImageBaseUrl('https://proj.supabase.co')
    expect(
      lineItemImageSrc({
        title: 'x',
        imageStoragePath: 'uid/amazon/oid/abc.jpg',
      }),
    ).toBe(
      'https://proj.supabase.co/storage/v1/object/public/finance-purchase-images/uid/amazon/oid/abc.jpg',
    )
    setPurchaseImageBaseUrl(undefined)
  })
})

describe('hasPurchaseEnrichment', () => {
  it('detects enriched txn', () => {
    expect(
      hasPurchaseEnrichment({ purchaseEnrichment: { source: 'bestbuy' } }),
    ).toBe(true)
    expect(hasPurchaseEnrichment({})).toBe(false)
  })
})

describe('uniqueLineItems', () => {
  it('dedupes by title', () => {
    expect(
      uniqueLineItems([{ title: 'A' }, { title: 'A' }, { title: 'B' }]).length,
    ).toBe(2)
  })
})
