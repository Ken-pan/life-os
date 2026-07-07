/**
 * Download merchant product thumbnails and store in Supabase Storage (small public objects).
 */
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? 'https://iueozzuctstwvzbcxcyh.supabase.co'
export const PURCHASE_IMAGES_BUCKET = 'finance-purchase-images'
const MAX_BYTES = 220_000

/** @type {Map<string, Promise<{ publicUrl?: string; storagePath?: string }>>} */
const uploadCache = new Map()

/** @type {string | null | undefined} */
let cachedServiceRoleKey

export function resolveServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY
  }
  if (cachedServiceRoleKey !== undefined) return cachedServiceRoleKey

  let token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    try {
      token = execSync('security find-generic-password -s "Supabase CLI" -w', {
        encoding: 'utf8',
      }).trim()
    } catch {
      cachedServiceRoleKey = null
      return null
    }
  }

  try {
    const projectRef =
      process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'
    const raw = execSync(
      `curl -sS "https://api.supabase.com/v1/projects/${projectRef}/api-keys" -H "Authorization: Bearer ${token}"`,
      { encoding: 'utf8' },
    )
    const keys = JSON.parse(raw)
    const service = keys.find((k) => k.name === 'service_role')
    cachedServiceRoleKey = service?.api_key ?? null
    return cachedServiceRoleKey
  } catch {
    cachedServiceRoleKey = null
    return null
  }
}

export function getServiceClient() {
  const key = resolveServiceRoleKey()
  if (!key) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY (set env or run: supabase login)',
    )
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function thumbSourceUrl(url, source) {
  if (!url) return url
  if (source === 'amazon' || /media-amazon\.com/i.test(url)) {
    return url
      .replace(/\._SL\d+_\./, '._SL96_.')
      .replace(/\._SX\d+_\./, '._SL96_.')
      .replace(/\._SS\d+_\./, '._SL96_.')
  }
  if (/bbystatic\.com|bestbuy\.com/i.test(url)) {
    const u = new URL(url, 'https://www.bestbuy.com')
    u.searchParams.set('maxHeight', '96')
    u.searchParams.set('maxWidth', '96')
    return u.toString()
  }
  return url
}

function itemKey(item) {
  return item.asin || item.detailUrl || item.title || 'item'
}

function buildStoragePath(userId, source, orderId, item, ext) {
  const id = createHash('sha1')
    .update(`${source}:${orderId}:${itemKey(item)}`)
    .digest('hex')
    .slice(0, 16)
  return `${userId}/${source}/${orderId}/${id}.${ext}`
}

function extFromContentType(ct) {
  if (!ct) return 'jpg'
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('gif')) return 'gif'
  return 'jpg'
}

async function fetchImageBuffer(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`image fetch ${res.status} ${url}`)
  const ct = res.headers.get('content-type') || 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_BYTES) {
    throw new Error(`image too large (${buf.length} bytes)`)
  }
  return { buf, contentType: ct.split(';')[0] }
}

async function uploadLineItemImage(
  item,
  { userId, source, orderId, supabase },
) {
  const merchantUrl = item.imageUrl
  if (!merchantUrl) return item
  if (
    item.imageStoragePath &&
    /\/storage\/v1\/object\/public\//.test(item.imageUrl || '')
  ) {
    return item
  }

  const cacheKey = `${userId}:${source}:${orderId}:${itemKey(item)}`
  if (!uploadCache.has(cacheKey)) {
    uploadCache.set(
      cacheKey,
      (async () => {
        try {
          const thumbUrl = thumbSourceUrl(merchantUrl, source)
          const { buf, contentType } = await fetchImageBuffer(thumbUrl)
          const ext = extFromContentType(contentType)
          const path = buildStoragePath(userId, source, orderId, item, ext)
          const { error } = await supabase.storage
            .from(PURCHASE_IMAGES_BUCKET)
            .upload(path, buf, {
              contentType,
              upsert: true,
            })
          if (error) throw error
          const { data } = supabase.storage
            .from(PURCHASE_IMAGES_BUCKET)
            .getPublicUrl(path)
          return { publicUrl: data.publicUrl, storagePath: path }
        } catch (err) {
          console.warn('[purchase-images]', orderId, itemKey(item), err.message)
          return {}
        }
      })(),
    )
  }

  const uploaded = await uploadCache.get(cacheKey)
  if (!uploaded?.publicUrl) return item
  return {
    ...item,
    imageStoragePath: uploaded.storagePath,
    imageUrl: uploaded.publicUrl,
  }
}

/** @param {Record<string, unknown>} enrichment */
export async function uploadPurchaseEnrichmentImages(enrichment, options) {
  const { userId, source, supabase = getServiceClient() } = options
  if (!userId || !enrichment?.lineItems?.length) return enrichment

  const orderId = String(enrichment.orderId || 'unknown')
  const lineItems = []
  for (const item of enrichment.lineItems) {
    lineItems.push(
      await uploadLineItemImage(item, { userId, source, orderId, supabase }),
    )
  }
  return { ...enrichment, lineItems }
}
