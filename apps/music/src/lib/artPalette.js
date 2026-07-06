import { trackAccent } from './trackArt.js';

/** @typedef {{ accent: string, accentMuted: string, glow: string, glow1: string, glow2: string, glow3: string, ambientBase: string }} ArtPalette */

/** @type {Map<string, ArtPalette>} */
const CACHE = new Map();

const SAMPLE_SIZE = 56;
const BRAND_HSL = { h: 350, s: 72, l: 45 };
const BRAND_BLEND = 0.1;

/** @param {number} r @param {number} g @param {number} b */
export function relativeLuminance(r, g, b) {
  const lin = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** @param {number} l1 @param {number} l2 */
export function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** @param {number} r @param {number} g @param {number} b */
export function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s: s * 100, l: l * 100 };
}

/** @param {number} h @param {number} s @param {number} l */
export function hslToRgb(h, s, l) {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  /** @type {[number, number, number]} */
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255)
  };
}

/** @param {number} h @param {number} s @param {number} l */
export function hslCss(h, s, l) {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
}

/** @param {number} h @param {number} s @param {number} l @param {number} amount 0–1 toward brand */
export function blendHueWithBrand(h, s, l, amount = BRAND_BLEND) {
  const dh = ((BRAND_HSL.h - h + 540) % 360) - 180;
  return {
    h: (h + dh * amount + 360) % 360,
    s: s * (1 - amount) + BRAND_HSL.s * amount,
    l: l * (1 - amount) + BRAND_HSL.l * amount
  };
}

/** @param {number} r @param {number} g @param {number} b @param {number} bgLum @param {number} [minRatio] */
export function ensureAccentContrast(r, g, b, bgLum, minRatio = 3) {
  let { h, s, l } = rgbToHsl(r, g, b);
  s = Math.max(38, Math.min(78, s));

  for (let i = 0; i < 28; i++) {
    const rgb = hslToRgb(h, s, l);
    const lum = relativeLuminance(rgb.r, rgb.g, rgb.b);
    if (contrastRatio(lum, bgLum) >= minRatio) return { ...rgb, h, s, l };
    l += lum <= bgLum ? 3.5 : -3.5;
    l = Math.max(24, Math.min(68, l));
  }

  const rgb = hslToRgb(h, s, l);
  return { ...rgb, h, s, l };
}

/** @returns {number} */
function surfaceLuminance() {
  if (typeof document === 'undefined') return 1;
  const card = getComputedStyle(document.documentElement).getPropertyValue('--card').trim();
  if (!card) {
    return document.documentElement.dataset.theme === 'dark' ? 0.01 : 1;
  }
  if (card.startsWith('#')) {
    const hex = card.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return relativeLuminance(r, g, b);
  }
  return document.documentElement.dataset.theme === 'dark' ? 0.01 : 1;
}

/**
 * @param {{ r: number, g: number, b: number, weight: number, sat: number, light: number }[]} samples
 * @param {number} k
 */
function kMeans(samples, k = 4) {
  if (!samples.length) return [];
  const centers = samples
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / k)) === 0)
    .slice(0, k)
    .map((s) => ({ ...s }));

  for (let iter = 0; iter < 10; iter++) {
    /** @type {{ r: number, g: number, b: number, weight: number, sat: number, light: number, score: number }[]} */
    const clusters = centers.map((c) => ({ ...c, score: 0 }));
    /** @type {number[]} */
    const counts = centers.map(() => 0);

    for (const s of samples) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const c = centers[i];
        const dr = s.r - c.r;
        const dg = s.g - c.g;
        const db = s.b - c.b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const w = s.weight;
      clusters[best].r += s.r * w;
      clusters[best].g += s.g * w;
      clusters[best].b += s.b * w;
      clusters[best].score += w * (s.sat * 0.75 + (1 - Math.abs(s.light - 0.46)) * 0.25);
      counts[best] += w;
    }

    for (let i = 0; i < centers.length; i++) {
      if (counts[i] <= 0) continue;
      centers[i] = {
        r: clusters[i].r / counts[i],
        g: clusters[i].g / counts[i],
        b: clusters[i].b / counts[i],
        weight: clusters[i].score / counts[i],
        sat: 0,
        light: 0
      };
    }
  }

  return centers.map((c) => ({
    r: Math.round(c.r),
    g: Math.round(c.g),
    b: Math.round(c.b),
    score: c.weight
  }));
}

/** @param {{ r: number, g: number, b: number, score: number }} c @param {number} l */
function clusterAmbientCss(c, l) {
  const { h, s } = rgbToHsl(c.r, c.g, c.b);
  return hslCss(h, Math.min(Math.max(s, 22), 78), l);
}

/** @param {{ r: number, g: number, b: number, score: number }[]} clusters */
function ambientFromClusters(clusters) {
  const ranked = clusters
    .slice()
    .sort((a, b) => b.score - a.score)
    .filter((c) => c.r + c.g + c.b > 0);
  const a = ranked[0] ?? { r: 48, g: 36, b: 32, score: 1 };
  const b = ranked[1] ?? a;
  const c = ranked[2] ?? b;
  const { h, s } = rgbToHsl(a.r, a.g, a.b);
  return {
    ambientBase: hslCss(h, Math.min(s * 0.62, 52), 11),
    glow1: clusterAmbientCss(a, 34),
    glow2: clusterAmbientCss(b, 26),
    glow3: clusterAmbientCss(c, 18)
  };
}

/** @param {number} h @param {number} s @param {number} l */
function ambientGlowPair(h, s, l) {
  const a = hslToRgb(h, Math.min(s * 0.82, 70), Math.min(l + 6, 52));
  const b = hslToRgb((h + 28) % 360, Math.min(s * 0.62, 58), Math.max(l - 14, 22));
  return {
    glow1: `rgba(${a.r}, ${a.g}, ${a.b}, 0.18)`,
    glow2: `rgba(${b.r}, ${b.g}, ${b.b}, 0.1)`
  };
}

/** @param {{ r: number, g: number, b: number, score: number }[]} clusters @param {number} bgLum */
function clustersToPalette(clusters, bgLum) {
  const ranked = clusters
    .slice()
    .sort((a, b) => b.score - a.score)
    .filter((c) => c.r + c.g + c.b > 0);

  const pick = ranked[0] ?? { r: 196, g: 30, b: 58, score: 1 };
  const mutedPick = ranked.find((c) => c !== pick) ?? pick;

  let accent = ensureAccentContrast(pick.r, pick.g, pick.b, bgLum);
  let muted = ensureAccentContrast(mutedPick.r, mutedPick.g, mutedPick.b, bgLum, 2.5);
  muted = { ...muted, l: Math.max(28, Math.min(accent.l - 8, muted.l)) };

  const blended = blendHueWithBrand(accent.h, accent.s, accent.l);
  const blendedMuted = blendHueWithBrand(muted.h, Math.max(muted.s - 12, 32), muted.l, BRAND_BLEND * 0.6);

  const accentCss = hslCss(blended.h, blended.s, blended.l);
  const mutedCss = hslCss(blendedMuted.h, blendedMuted.s, blendedMuted.l);
  const ambient = ambientFromClusters(ranked);
  return {
    accent: accentCss,
    accentMuted: mutedCss,
    glow: `color-mix(in srgb, ${accentCss} 42%, transparent)`,
    glow1: ambient.glow1,
    glow2: ambient.glow2,
    glow3: ambient.glow3,
    ambientBase: ambient.ambientBase
  };
}

/** @param {ImageBitmap | HTMLImageElement} img */
function sampleImage(img) {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data, width, height } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  /** @type {{ r: number, g: number, b: number, weight: number, sat: number, light: number }[]} */
  const samples = [];

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 140) continue;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const light = (max + min) / 510;
      if (light < 0.06 || light > 0.94) continue;

      const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
      const cx = x / width - 0.5;
      const cy = y / height - 0.5;
      const center = 1 + (1 - Math.min(1, Math.hypot(cx * 2, cy * 2))) * 0.45;
      const vibrancy = sat * 0.75 + (1 - Math.abs(light - 0.44)) * 0.25;

      samples.push({ r, g, b, sat, light, weight: center * (0.25 + vibrancy * 0.75) });
    }
  }

  return samples;
}

/** @param {string | Blob} source */
async function loadImageSource(source) {
  if (source instanceof Blob) {
    const bitmap = await createImageBitmap(source);
    return /** @type {ImageBitmap | HTMLImageElement} */ (bitmap);
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  await new Promise((resolve, reject) => {
    img.onload = () => resolve(undefined);
    img.onerror = () => reject(new Error('art load failed'));
    img.src = source;
  });
  return img;
}

/**
 * Extract an accessible palette from album artwork.
 * @param {string | Blob} source
 * @param {string} cacheKey
 */
export async function extractArtPalette(source, cacheKey) {
  const key = `${cacheKey}::${typeof source === 'string' ? source : source.size}`;
  if (CACHE.has(key)) return CACHE.get(key);

  const img = await loadImageSource(source);
  const samples = sampleImage(img);
  if ('close' in img && typeof img.close === 'function') img.close();

  const bgLum = surfaceLuminance();
  /** @type {ArtPalette} */
  let palette;
  if (samples.length < 8) {
    palette = paletteFromHash(cacheKey);
  } else {
    palette = clustersToPalette(kMeans(samples, 4), bgLum);
  }

  CACHE.set(key, palette);
  return palette;
}

/** @param {string} seed */
export function paletteFromHash(seed) {
  const accent = trackAccent(seed);
  const match = accent.match(/hsl\((\d+)/);
  const h = match ? Number(match[1]) : 350;
  return {
    accent,
    accentMuted: accent.replace(/(\d+)%\)$/, (_, l) => `${Math.max(+l - 12, 28)}%)`),
    glow: `color-mix(in srgb, ${accent} 42%, transparent)`,
    glow1: hslCss(h, 58, 34),
    glow2: hslCss((h + 32) % 360, 48, 26),
    glow3: hslCss((h + 64) % 360, 40, 18),
    ambientBase: hslCss(h, 42, 11)
  };
}

/** @param {string} [cacheKey] */
export function clearArtPaletteCache(cacheKey) {
  if (!cacheKey) {
    CACHE.clear();
    return;
  }
  for (const k of CACHE.keys()) {
    if (k.startsWith(`${cacheKey}::`)) CACHE.delete(k);
  }
}
