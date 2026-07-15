/**
 * 手工拼一张带 EXIF 的最小 JPEG，用来测 photo-exif 的解析。
 * 只写我们真正读的那几个 tag：IFD0(Make/Model/Orientation) + ExifIFD + GPS IFD。
 *
 * 为什么不用真照片当夹具：真照片是二进制大文件、还带隐私；而 iPhone 的关键签名
 *（竖拍 = Orientation 6 + 传感器横向像素）用合成的反而能精确覆盖各种组合。
 */

const SOI = Buffer.from([0xff, 0xd8])
/** 一个最小合法 JPEG 的其余部分（SOI 之后）。内容不重要，只要 exifr 能扫到 APP1。 */
const TAIL = Buffer.from([
  0xff, 0xdb, 0x00, 0x43, 0x00, ...new Array(64).fill(0x10), 0xff, 0xd9,
])

/**
 * @param {{
 *   make?: string, model?: string, f35?: number,
 *   dirDeg?: number, dirRef?: 'T'|'M',
 *   orientation?: number, w?: number, h?: number,
 *   dto?: string, offsetTime?: string,
 * }} o
 * @returns {Buffer}
 */
export function makeExifJpeg(o = {}) {
  const {
    make = 'Apple',
    model = 'iPhone 15 Pro',
    f35 = 26,
    dirDeg = null,
    dirRef = 'T',
    orientation = 1,
    w = 4032,
    h = 3024,
    dto = '2026:07:14 15:30:00',
    offsetTime = null,
  } = o

  const enc = (s) => Buffer.from(s + '\0', 'latin1')
  const makeB = enc(make)
  const modelB = enc(model)
  const dtoB = enc(dto)
  const offB = offsetTime ? enc(offsetTime) : null

  const hasGps = dirDeg != null
  const IFD0_OFF = 8
  const ifd0Count = 3 + (hasGps ? 1 : 0) + 1 // Make, Model, Orientation, [GpsPtr], ExifPtr
  const ifd0Size = 2 + ifd0Count * 12 + 4
  const makeOff = IFD0_OFF + ifd0Size
  const modelOff = makeOff + makeB.length
  const exifIfdOff = modelOff + modelB.length
  const exifCount = 4 + (offB ? 1 : 0)
  const exifSize = 2 + exifCount * 12 + 4
  const dtoOff = exifIfdOff + exifSize
  const offOff = dtoOff + dtoB.length
  const gpsIfdOff = offOff + (offB ? offB.length : 0)
  const gpsCount = 2
  const gpsSize = 2 + gpsCount * 12 + 4
  const dirRatOff = hasGps ? gpsIfdOff + gpsSize : gpsIfdOff
  const total = dirRatOff + (hasGps ? 8 : 0)

  const buf = Buffer.alloc(total)
  buf.writeUInt16LE(0x4949, 0) // "II"
  buf.writeUInt16LE(42, 2)
  buf.writeUInt32LE(IFD0_OFF, 4)

  let p = IFD0_OFF
  buf.writeUInt16LE(ifd0Count, p)
  p += 2
  const entry = (tag, type, count, setValue) => {
    buf.writeUInt16LE(tag, p)
    buf.writeUInt16LE(type, p + 2)
    buf.writeUInt32LE(count, p + 4)
    setValue(p + 8)
    p += 12
  }
  entry(0x010f, 2, makeB.length, (x) => buf.writeUInt32LE(makeOff, x))
  entry(0x0110, 2, modelB.length, (x) => buf.writeUInt32LE(modelOff, x))
  entry(0x0112, 3, 1, (x) => buf.writeUInt16LE(orientation, x))
  entry(0x8769, 4, 1, (x) => buf.writeUInt32LE(exifIfdOff, x))
  if (hasGps) entry(0x8825, 4, 1, (x) => buf.writeUInt32LE(gpsIfdOff, x))
  buf.writeUInt32LE(0, p)
  p += 4
  makeB.copy(buf, makeOff)
  modelB.copy(buf, modelOff)

  p = exifIfdOff
  buf.writeUInt16LE(exifCount, p)
  p += 2
  entry(0x9003, 2, dtoB.length, (x) => buf.writeUInt32LE(dtoOff, x)) // DateTimeOriginal
  entry(0xa002, 4, 1, (x) => buf.writeUInt32LE(w, x)) // ExifImageWidth
  entry(0xa003, 4, 1, (x) => buf.writeUInt32LE(h, x)) // ExifImageHeight
  entry(0xa405, 3, 1, (x) => buf.writeUInt16LE(f35, x)) // FocalLengthIn35mmFormat
  if (offB) entry(0x9011, 2, offB.length, (x) => buf.writeUInt32LE(offOff, x)) // OffsetTimeOriginal
  buf.writeUInt32LE(0, p)
  p += 4
  dtoB.copy(buf, dtoOff)
  if (offB) offB.copy(buf, offOff)

  if (hasGps) {
    p = gpsIfdOff
    buf.writeUInt16LE(gpsCount, p)
    p += 2
    entry(0x0010, 2, 2, (x) => {
      buf.write(dirRef, x, 'latin1')
      buf.writeUInt8(0, x + 1)
    }) // GPSImgDirectionRef
    entry(0x0011, 5, 1, (x) => buf.writeUInt32LE(dirRatOff, x)) // GPSImgDirection (RATIONAL)
    buf.writeUInt32LE(0, p)
    p += 4
    buf.writeUInt32LE(Math.round(dirDeg * 100), dirRatOff)
    buf.writeUInt32LE(100, dirRatOff + 4)
  }

  const hdr = Buffer.from('Exif\0\0', 'latin1')
  const app1Len = 2 + hdr.length + total
  const app1 = Buffer.alloc(2 + app1Len)
  app1.writeUInt8(0xff, 0)
  app1.writeUInt8(0xe1, 1)
  app1.writeUInt16BE(app1Len, 2)
  hdr.copy(app1, 4)
  buf.copy(app1, 4 + hdr.length)

  return Buffer.concat([SOI, app1, TAIL])
}
