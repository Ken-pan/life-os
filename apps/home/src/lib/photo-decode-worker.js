/**
 * 照片解码 + 降采样的 Web Worker。
 *
 * 为什么必须在 worker 里：libheif 的 wasm 解一张 5712×3213 要 1–4.5 秒，跑在主线程上
 * 实测把主线程连续卡住 1037ms + 858ms —— 界面整个冻住，用户以为崩了。
 * canvas 缩放同理。搬进 worker 后主线程只等一条消息。
 *
 * ⚠️ `import('heic-to')` 必须留在**函数里**做动态导入。提到顶层会让这个 2.9MB 的
 * wasm chunk 变成 worker 的静态依赖，传 JPEG 的人也要下载。
 */

/** @type {Promise<any> | null} */
let heicToPromise = null

function loadHeicTo() {
  if (!heicToPromise) heicToPromise = import('heic-to')
  return heicToPromise
}

/**
 * 按魔数认 HEIC —— MIME 不可靠（Chrome 对 .heic 常给空 type）。
 * 与 photo-store.js 的 isHeic 同源；worker 里不能 import 那个模块（它碰 document）。
 * @param {ArrayBuffer} buf
 */
function isHeicBuf(buf) {
  const head = new Uint8Array(buf, 0, Math.min(12, buf.byteLength))
  if (head.length < 12) return false
  const box = String.fromCharCode(head[4], head[5], head[6], head[7])
  if (box !== 'ftyp') return false
  const brand = String.fromCharCode(head[8], head[9], head[10], head[11])
  return /^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/.test(brand)
}

self.onmessage = async (e) => {
  const { id, buf, type, maxEdge, quality } = e.data
  try {
    const heic = isHeicBuf(buf)
    const blob = new Blob([buf], { type: type || (heic ? 'image/heic' : '') })

    /** @type {ImageBitmap} */
    let bmp
    try {
      bmp = await createImageBitmap(blob)
    } catch (err) {
      if (!heic) throw new Error('DECODE_UNKNOWN')
      try {
        const { heicTo } = await loadHeicTo()
        bmp = await heicTo({ blob, type: 'bitmap' })
      } catch {
        throw new Error('DECODE_HEIC')
      }
    }

    const source = { w: bmp.width, h: bmp.height }
    const longest = Math.max(source.w, source.h)
    const needsResize = longest > maxEdge
    // HEIC 即便不用缩也得转码：存回 HEIC 等于存了张 Chrome 显示不了的图。
    if (!needsResize && !heic) {
      bmp.close()
      self.postMessage({ id, ok: true, passthrough: true, source })
      return
    }

    const scale = needsResize ? maxEdge / longest : 1
    const w = Math.round(source.w * scale)
    const h = Math.round(source.h * scale)
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('DECODE_NO_CANVAS')
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality })
    if (!out) throw new Error('DECODE_NO_BLOB')
    self.postMessage({ id, ok: true, blob: out, source })
  } catch (err) {
    self.postMessage({ id, ok: false, code: String(err?.message ?? err) })
  }
}
