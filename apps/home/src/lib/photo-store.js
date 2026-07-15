/**
 * 视角照片的本地仓 —— 只落 IndexedDB，永不上传。
 *
 * 家里内景照片属于最敏感的一类，所以刻意不走 Supabase：照片 blob 只存在这台
 * 设备的浏览器里，`homeos_spatial_v1`（localStorage）里只留 photoRef 字符串。
 * 代价是换设备照片不跟随 —— 这是有意的取舍。
 */

const DB_NAME = 'homeos_photos'
const DB_VERSION = 1
const STORE = 'photos'

/** 单张照片上限，超了先降采样。 */
const MAX_EDGE_PX = 2048
const JPEG_QUALITY = 0.82

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null

/** 打开超时。开不了要报错，不能无限等 —— 见下。 */
const OPEN_TIMEOUT_MS = 8000

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    let settled = false
    const done = (fn, v) => {
      if (settled) return
      settled = true
      fn(v)
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'ref' })
      }
    }
    req.onsuccess = () => {
      // 别的标签页要升版本时会发 versionchange —— 不让路它就会被永久阻塞。
      req.result.onversionchange = () => {
        req.result.close()
        dbPromise = null
      }
      done(resolve, req.result)
    }
    req.onerror = () => done(reject, req.error ?? new Error('indexedDB open failed'))
    // onblocked：别的标签页占着旧版本连接时触发，且 open **永不 resolve**。
    // 没有这一路，所有照片操作会静默挂死，UI 停在「存入中…」。
    req.onblocked = () =>
      done(reject, new Error('照片库被另一个标签页占用，关掉其它 HOME.OS 标签页再试'))
    setTimeout(
      () => done(reject, new Error('打开本地照片库超时')),
      OPEN_TIMEOUT_MS,
    )
  }).catch((err) => {
    // 失败的 promise 不能留在缓存里，否则一次失败会永久毒化后续每一次调用。
    dbPromise = null
    throw err
  })
  return dbPromise
}

/**
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>} fn
 * @returns {Promise<T>}
 */
async function tx(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

let refSeq = Date.now()

/**
 * IndexedDB 跨标签页共享，而 refSeq 以 Date.now() 起头 —— 两个标签页同毫秒开
 * 就会发同一串 ref，后写的照片会顶掉先写的。加一段每页随机前缀隔开。
 */
const PAGE_SALT = Math.random().toString(36).slice(2, 6)

function createPhotoRef() {
  return `ph-${PAGE_SALT}-${(refSeq++).toString(36)}`
}

/**
 * 按魔数认 HEIC/HEIF —— 不能信 MIME：Chrome 对 .heic 常给空 type 或
 * application/octet-stream，file.type 判断会漏。
 * ISOBMFF 结构：[4B size][ftyp][major brand]，brand 为 heic/heix/hevc/mif1 等。
 * @param {Blob} file
 * @returns {Promise<boolean>}
 */
export async function isHeic(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    if (head.length < 12) return false
    const box = String.fromCharCode(head[4], head[5], head[6], head[7])
    if (box !== 'ftyp') return false
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11])
    return /^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/.test(brand)
  } catch {
    return false
  }
}

/** 解码失败时抛这个，调用方据此给出可操作的提示而不是存下一张裂图。 */
export class PhotoDecodeError extends Error {
  /** @param {'heic'|'unknown'} kind */
  constructor(kind, message) {
    super(message)
    this.name = 'PhotoDecodeError'
    this.kind = kind
  }
}

/**
 * HEIC 解码器（libheif wasm，约 3MB）**只在真遇到 HEIC 时才动态加载** ——
 * 代码分割后传 JPEG 的人一个字节都不会下载。
 * @param {Blob} file
 * @returns {Promise<ImageBitmap>}
 */
async function decodeHeic(file) {
  const { heicTo } = await import('heic-to')
  return await heicTo({ blob: file, type: 'bitmap' })
}

// —— Worker 路径：解码 + 缩放都不许占主线程 ——
// 实测主线程解一张 5712×3213 的 HEIC 会连续卡住 1037ms + 858ms，界面整个冻住。

/** @type {Worker | null} */
let worker = null
let workerBroken = false
let reqSeq = 0
/** @type {Map<number, { resolve: Function, reject: Function }>} */
const pending = new Map()

function workerSupported() {
  return (
    typeof Worker === 'function' &&
    typeof OffscreenCanvas === 'function' &&
    typeof createImageBitmap === 'function'
  )
}

function getWorker() {
  if (worker || workerBroken) return worker
  try {
    worker = new Worker(new URL('./photo-decode-worker.js', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e) => {
      const { id, ...rest } = e.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      p.resolve(rest)
    }
    worker.onerror = () => {
      // worker 起不来就整条路作废，回落主线程 —— 卡顿总好过不能用。
      workerBroken = true
      for (const [, p] of pending) p.reject(new Error('WORKER_ERROR'))
      pending.clear()
      worker = null
    }
  } catch {
    workerBroken = true
    worker = null
  }
  return worker
}

/** worker 报的错码 → 用户能看懂、能行动的提示。 */
function decodeErrorFor(code) {
  if (code === 'DECODE_HEIC' || code === 'DECODE_NO_CANVAS' || code === 'DECODE_NO_BLOB') {
    return new PhotoDecodeError(
      'heic',
      'HEIC 解码失败。可以用 iPhone 直接上传（iOS 会自动转成 JPEG），或把「设置 → 相机 → 格式」改成「兼容性最佳」。',
    )
  }
  return new PhotoDecodeError('unknown', '这张图解不开，换一张试试。')
}

/**
 * @param {Blob} file
 * @returns {Promise<{ blob: Blob, source: { w: number, h: number } | null } | null>}
 *   null = worker 不可用，调用方回落主线程
 */
async function downscaleInWorker(file) {
  if (!workerSupported()) return null
  const w = getWorker()
  if (!w) return null
  const buf = await file.arrayBuffer()
  const id = ++reqSeq
  const res = await new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    // buf 是 transferable：交给 worker 后主线程这份就废了，零拷贝。
    w.postMessage(
      { id, buf, type: file.type, maxEdge: MAX_EDGE_PX, quality: JPEG_QUALITY },
      [buf],
    )
  }).catch((err) => {
    // 静默回落会让「worker 没生效」变成看不见的性能回归 —— 至少要留个痕。
    console.warn('[home] 照片解码 worker 不可用，回落主线程（会卡顿）', err)
    return null
  })
  if (!res) return null
  if (!res.ok) throw decodeErrorFor(res.code)
  // passthrough：小图且非 HEIC，worker 没重编码，直接用原文件。
  return { blob: res.passthrough ? file : res.blob, source: res.source }
}

/**
 * 归一成可直接 <img> 显示的 blob：解码 → 需要则缩到长边 MAX_EDGE_PX → 存 JPEG。
 * 原图直接塞 IndexedDB 会让写入和读取都变卡，而这个功能只需要看清"拍的是哪儿"。
 *
 * 两条铁律：
 * 1. 解不开就**抛错**，绝不原样存回 —— 存下去只会得到一张永远裂着的缩略图，
 *    而用户以为自己标注好了。
 * 2. **HEIC 必须重编码，哪怕它很小**。早先「小图就原样返回」的短路会把 2048px
 *    以内的 HEIC 原样存回，Chrome 照样显示不了。所以是否重编码由 `mustReencode`
 *    决定，不由尺寸决定。
 *
 * `source` 是**降采样前**的真实解码尺寸。它是算视锥张角的关键输入：EXIF 里的
 * 尺寸是原始采集尺寸，被 Photos 裁过就跟交付图对不上（实测一张 3213×5712 的竖图，
 * EXIF 仍写 5712×4284 横向），只信 EXIF 会把张角算宽 45%。
 *
 * @param {Blob} file
 * @returns {Promise<{ blob: Blob, source: { w: number, h: number } | null }>}
 */
async function downscale(file) {
  if (typeof createImageBitmap !== 'function') return { blob: file, source: null }

  // 优先走 worker：主线程一帧都不该为解码停下。失败/不支持才回落。
  try {
    const viaWorker = await downscaleInWorker(file)
    if (viaWorker) return viaWorker
  } catch (err) {
    if (err instanceof PhotoDecodeError) throw err
    // 其它异常（worker 挂了等）继续往下走主线程
  }

  const heic = await isHeic(file)
  /** @type {ImageBitmap} */
  let bmp
  try {
    bmp = await createImageBitmap(file)
  } catch {
    // Chrome/Firefox 原生解不了 HEIC（Safari 可以，所以上面那步在 Safari 就成了）。
    // 走到这里才付 wasm 的下载代价。
    if (!heic) throw new PhotoDecodeError('unknown', '这张图解不开，换一张试试。')
    try {
      bmp = await decodeHeic(file)
    } catch (heicErr) {
      console.error('[home] HEIC decode failed', heicErr)
      throw new PhotoDecodeError(
        'heic',
        'HEIC 解码失败。可以用 iPhone 直接上传（iOS 会自动转成 JPEG），或把「设置 → 相机 → 格式」改成「兼容性最佳」。',
      )
    }
  }

  const { width, height } = bmp
  const source = { w: width, h: height }
  const longest = Math.max(width, height)
  const needsResize = longest > MAX_EDGE_PX
  // HEIC 即使不用缩也得转码 —— 存回 HEIC 等于存了张 Chrome 显示不了的图。
  if (!needsResize && !heic) {
    bmp.close()
    return { blob: file, source }
  }

  const scale = needsResize ? MAX_EDGE_PX / longest : 1
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bmp.close()
    if (heic) throw new PhotoDecodeError('heic', 'HEIC 转码失败：拿不到 canvas。')
    return { blob: file, source }
  }
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const out = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY),
  )
  if (!out) {
    if (heic) throw new PhotoDecodeError('heic', 'HEIC 转码失败：编不出 JPEG。')
    return { blob: file, source }
  }
  return { blob: out, source }
}

/**
 * 存一张照片，返回 photoRef。
 * `sourceWidth`/`sourceHeight` 是降采样前的真实解码尺寸 —— 调用方用它算张角。
 * @param {Blob} file
 * @returns {Promise<{ ref: string, width: number, height: number, sourceWidth: number, sourceHeight: number }>}
 */
export async function putPhoto(file) {
  const { blob, source } = await downscale(file)
  const ref = createPhotoRef()
  let width = source?.w ?? 0
  let height = source?.h ?? 0
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob)
      width = bmp.width
      height = bmp.height
      bmp.close()
    } catch {
      /* 尺寸拿不到不影响存储 */
    }
  }
  await tx('readwrite', (s) =>
    s.put({ ref, blob, width, height, savedAt: new Date().toISOString() }),
  )
  return {
    ref,
    width,
    height,
    sourceWidth: source?.w ?? width,
    sourceHeight: source?.h ?? height,
  }
}

/**
 * @param {string} ref
 * @returns {Promise<Blob | null>}
 */
export async function getPhotoBlob(ref) {
  if (!ref) return null
  try {
    const rec = await tx('readonly', (s) => s.get(ref))
    return rec?.blob ?? null
  } catch {
    return null
  }
}

/**
 * 取一个可直接塞 <img src> 的 object URL。调用方负责 revoke。
 * @param {string} ref
 * @returns {Promise<string | null>}
 */
export async function getPhotoUrl(ref) {
  const blob = await getPhotoBlob(ref)
  return blob ? URL.createObjectURL(blob) : null
}

/** @param {string} ref */
export async function deletePhoto(ref) {
  if (!ref) return
  try {
    await tx('readwrite', (s) => s.delete(ref))
  } catch {
    /* 删不掉就留着，不该阻断 UI */
  }
}

/**
 * 清掉没有任何视角引用的孤儿照片。
 * @param {string[]} liveRefs
 * @returns {Promise<number>} 清掉的张数
 */
export async function pruneOrphans(liveRefs) {
  try {
    const keys = await tx('readonly', (s) => s.getAllKeys())
    const live = new Set(liveRefs)
    const dead = keys.filter((k) => typeof k === 'string' && !live.has(k))
    for (const k of dead) await deletePhoto(/** @type {string} */ (k))
    return dead.length
  } catch {
    return 0
  }
}

/** 粗略统计占用，给设置页显示。 */
export async function photoStoreStats() {
  try {
    const all = await tx('readonly', (s) => s.getAll())
    const bytes = all.reduce((sum, r) => sum + (r.blob?.size ?? 0), 0)
    return { count: all.length, bytes }
  } catch {
    return { count: 0, bytes: 0 }
  }
}
