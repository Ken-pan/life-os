/**
 * 轻量 ID3v2 标签解析（TIT2 / TPE1 / TALB / APIC）
 * @param {ArrayBuffer} buffer
 */
export function parseId3(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 10) return null;
  const tag = readStr(view, 0, 3);
  if (tag !== 'ID3') return null;

  const version = view.getUint8(3);
  const size = syncsafe(view, 6);
  if (size <= 0 || 10 + size > buffer.byteLength) return null;

  /** @type {{ title?: string, artist?: string, album?: string, lyrics?: string, lyricsSynced?: boolean, picture?: { mime: string, data: Uint8Array } }} */
  const out = {};
  let offset = 10;
  const end = 10 + size;

  while (offset + 10 <= end) {
    const frameId = readStr(view, offset, 4);
    if (!frameId || frameId === '\0\0\0\0') break;
    const frameSize =
      version === 4 ? syncsafe(view, offset + 4) : view.getUint32(offset + 4);
    offset += 10;
    if (offset + frameSize > end) break;
    const frame = new Uint8Array(buffer, offset, frameSize);
    offset += frameSize;

    if (frameId === 'TIT2') out.title = readTextFrame(frame);
    else if (frameId === 'TPE1') out.artist = readTextFrame(frame);
    else if (frameId === 'TALB') out.album = readTextFrame(frame);
    else if (frameId === 'SYLT') {
      const synced = readSyncedLyricsFrame(frame);
      if (synced) {
        out.lyrics = synced;
        out.lyricsSynced = true;
      }
    } else if (frameId === 'USLT' && !out.lyricsSynced) {
      out.lyrics = readLyricsFrame(frame);
    } else if (frameId === 'APIC' || frameId === 'PIC') {
      const pic = readPictureFrame(frame);
      if (pic) out.picture = pic;
    }
  }

  return out;
}

/** @param {DataView} view @param {number} offset */
function syncsafe(view, offset) {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

/** @param {DataView} view @param {number} offset @param {number} len */
function readStr(view, offset, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

/** @param {string} s */
export function isValidMeta(s) {
  const t = String(s ?? '')
    .replace(/\0/g, '')
    .trim();
  if (!t || t.length > 240) return false;
  if (t.includes('\uFFFD')) return false;
  if (/[\u0000-\u0008\u000e-\u001f]/.test(t)) return false;
  const highBytes = (t.match(/[\u0080-\u00ff]/g) || []).length;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  if (highBytes >= 3 && cjk === 0 && highBytes > t.length * 0.35) return false;
  return true;
}

/** @param {Uint8Array} bytes */
function tryDecodeGbk(bytes) {
  try {
    return new TextDecoder('gbk').decode(bytes);
  } catch {
    return '';
  }
}

/** @param {...string} candidates */
function pickBestDecoded(...candidates) {
  for (const c of candidates) {
    const cleaned = String(c).replace(/\0+$/, '').trim();
    if (isValidMeta(cleaned)) return cleaned;
  }
  for (const c of candidates) {
    const cleaned = String(c).replace(/\0+$/, '').trim();
    if (cleaned) return cleaned;
  }
  return '';
}

/** @param {Uint8Array} frame */
function readTextFrame(frame) {
  if (!frame.length) return '';
  const enc = frame[0];
  const bytes = frame.subarray(1);
  if (enc === 0x00) {
    return pickBestDecoded(decodeLatin1(bytes), tryDecodeGbk(bytes)).replace(/\0+$/, '');
  }
  if (enc === 0x01) return decodeUtf16(bytes, false).replace(/\0+$/, '');
  if (enc === 0x02) return decodeUtf16(bytes, true).replace(/\0+$/, '');
  if (enc === 0x03) {
    return pickBestDecoded(new TextDecoder('utf-8').decode(bytes), tryDecodeGbk(bytes)).replace(/\0+$/, '');
  }
  return pickBestDecoded(
    decodeUtf16(bytes, false),
    new TextDecoder('utf-8').decode(bytes),
    tryDecodeGbk(bytes)
  ).replace(/\0+$/, '');
}

/** @param {Uint8Array} bytes */
function decodeLatin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** @param {Uint8Array} frame */
function readLyricsFrame(frame) {
  if (frame.length < 5) return '';
  const enc = frame[0];
  let i = 4; /* language code */
  i = skipEncodedString(frame, i, enc);
  const bytes = frame.subarray(i);
  if (enc === 0x00) return decodeLatin1(bytes).replace(/\0+$/, '').trim();
  if (enc === 0x01 || enc === 0x02) return decodeUtf16(bytes).replace(/\0+$/, '').trim();
  return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/, '').trim();
}

/** SYLT → LRC text for timed highlighting in LyricsPanel. */
/** @param {Uint8Array} frame */
function readSyncedLyricsFrame(frame) {
  if (frame.length < 6) return '';
  const enc = frame[0];
  const timeFormat = frame[4];
  let i = 6;
  i = skipEncodedString(frame, i, enc);

  /** @type {{ time: number, text: string }[]} */
  const lines = [];
  while (i < frame.length) {
    let text = '';
    if (enc === 0x00 || enc === 0x03) {
      const start = i;
      while (i < frame.length && frame[i] !== 0) i++;
      const bytes = frame.subarray(start, i);
      text = enc === 0x00 ? decodeLatin1(bytes) : new TextDecoder('utf-8').decode(bytes);
      i += 1;
    } else {
      const start = i;
      while (i + 1 < frame.length && !(frame[i] === 0 && frame[i + 1] === 0)) i += 2;
      text = decodeUtf16(frame.subarray(start, i));
      i += 2;
    }
    if (i + 4 > frame.length) break;
    const stamp = ((frame[i] << 24) | (frame[i + 1] << 16) | (frame[i + 2] << 8) | frame[i + 3]) >>> 0;
    i += 4;
    const seconds = timeFormat === 2 ? stamp / 1000 : stamp / 1000;
    text = text.replace(/\0/g, '').trim();
    if (text) lines.push({ time: seconds, text });
  }

  if (lines.length < 2) return '';
  return lines
    .map(({ time, text }) => {
      const m = Math.floor(time / 60);
      const s = time - m * 60;
      const whole = Math.floor(s);
      const cs = Math.min(99, Math.floor((s - whole) * 100));
      return `[${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(cs).padStart(2, '0')}]${text}`;
    })
    .join('\n');
}

/** @param {Uint8Array} frame @param {number} i @param {number} enc */
function skipEncodedString(frame, i, enc) {
  if (enc === 0x01 || enc === 0x02) {
    while (i + 1 < frame.length && !(frame[i] === 0 && frame[i + 1] === 0)) i += 2;
    return i + 2;
  }
  while (i < frame.length && frame[i] !== 0) i++;
  return i + 1;
}

/** @param {Uint8Array} bytes @param {boolean} [forceBe] */
function decodeUtf16(bytes, forceBe = false) {
  if (bytes.length < 2) return '';
  let le = true;
  let start = 0;
  if (forceBe) {
    le = false;
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    le = true;
    start = 2;
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    le = false;
    start = 2;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let s = '';
  for (let i = start; i + 1 < bytes.length; i += 2) {
    s += String.fromCharCode(view.getUint16(i, le));
  }
  return s;
}

/** @param {Uint8Array} frame */
function readPictureFrame(frame) {
  if (frame.length < 4) return null;
  let i = 1;
  let mime = '';
  while (i < frame.length && frame[i] !== 0) {
    mime += String.fromCharCode(frame[i++]);
  }
  i += 2;
  while (i < frame.length && frame[i] !== 0) i++;
  i++;
  const data = frame.subarray(i);
  if (!data.length) return null;
  return { mime: mime || 'image/jpeg', data };
}

const FEAT_RE = /\b(feat\.?|ft\.?|featuring|with|vs\.?|x)\b/i;
const LEADING_TRACK_RE = /^\d{1,3}[.)]\s*/;

/** @param {string} part */
function stripFilenameNoise(part) {
  return part
    .replace(LEADING_TRACK_RE, '')
    .replace(/\s*[\[(].*[\])]\s*$/g, '')
    .trim();
}

/** @param {string} part */
function looksLikeArtistSegment(part) {
  const s = stripFilenameNoise(part);
  if (!s) return false;
  if (FEAT_RE.test(s)) return true;
  if (s.includes(' & ') || s.includes('、') || s.includes('，')) return true;
  if (/^(the|a|an)\s+/i.test(s)) return true;
  // Band / duo names often shorter than song titles in Western exports.
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}$/.test(s) && s.length <= 32) return true;
  return false;
}

/**
 * Parse "A - B" into artist/title.
 * Heuristic pipeline (ByeTunes / filename-fixer style): feat./band cues, then locale defaults.
 * @param {string} left
 * @param {string} right
 */
function splitArtistTitle(left, right) {
  const a = stripFilenameNoise(left);
  const b = stripFilenameNoise(right);
  if (!a || !b) return { artist: a || b || '未知艺术家', title: b || a || '未命名' };

  const leftArtist = looksLikeArtistSegment(a);
  const rightArtist = looksLikeArtistSegment(b);

  if (leftArtist && !rightArtist) return { artist: a, title: b };
  if (rightArtist && !leftArtist) return { artist: b, title: a };

  const aCjk = (a.match(/[\u4e00-\u9fff]/g) || []).length;
  const bCjk = (b.match(/[\u4e00-\u9fff]/g) || []).length;
  const aLatin = /^[\x00-\x7F\s'.-]+$/.test(a);
  const bLatin = /^[\x00-\x7F\s'.-]+$/.test(b);

  // WeChat / CN exports: Title - Artist (title often longer or mixed CJK+Latin).
  if (aCjk > 0 && bCjk > 0 && a.length >= b.length) return { title: a, artist: b };
  if (aCjk > 0 && bLatin) return { title: a, artist: b };
  if (bCjk > 0 && aLatin) return { title: b, artist: a };

  // Western default: Artist - Title.
  return { artist: a, title: b };
}

/** @param {string} name — fallback when ID3 is missing */
export function parseFilename(name) {
  const base = name.replace(/\.[^.]+$/, '').trim();
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return splitArtistTitle(parts[0], parts.slice(1).join(' - '));
  }
  return { artist: '未知艺术家', title: base || '未命名' };
}
