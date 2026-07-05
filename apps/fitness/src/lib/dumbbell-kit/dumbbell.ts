// ─────────────────────────────────────────────────────────────────────────
// Dumbbell renderer — framework-agnostic.
//
// Pure TypeScript + Canvas 2D. No React, no Svelte, no bundler magic, no
// external asset files (sprites are embedded in ./sprites.data). Give it a
// CanvasRenderingContext2D and it draws a dumbbell composed from the VECTOR
// (procedurally rendered) plate / bar / collar sprites — unified parametric
// plate shading with rounded corners, knurled bar, and a crisp clamp.
//
//   const assets = await loadDumbbell();
//   drawDumbbell(ctx, assets, { plate: "blue", perSide: 3, scale: 2 });
//
// Renders on a transparent canvas — put whatever background you like behind it.
// ─────────────────────────────────────────────────────────────────────────

import { SPRITES } from "./sprites.data";

export type Sprite = { src: CanvasImageSource; w: number; h: number };
export type LoadedAssets = {
  bar: Sprite;
  cap2: Sprite; // collar sprite — used on the right and mirrored for the left
  plates: Record<string, Sprite>;
};

export const PLATE_KEYS = ["blue", "green", "yellow", "black", "grey", "white"] as const;
export type PlateKey = (typeof PLATE_KEYS)[number];

// ── Layout constants, in base (scale = 1) units ──────────────────────────
const D = 300; // reference plate diameter (largest plate maps to this)
const BAR_THICK = D / 6;
const CAP_H = D * 0.38;
const PLATE_OVERLAP = 1.0; // plates have vertical edges → butt into clean vertical seams
const PAD = 8; // transparent margin around the dumbbell (kept tight — spacing is the container's job)

// Bar rebuilt from horizontal slices of the source sprite (native px): rounded
// tips (fixed) + smooth sleeves (stretch to fit plates + collar + overhang) +
// knurled handle (stretch to a constant length).
const BAR_TIP_SRC = 40;
const BAR_SLEEVE_L_SX = 40;
const BAR_SLEEVE_L_SW = 235;
const BAR_MID_SX = 275;
const BAR_MID_SW = 443;
const BAR_SLEEVE_R_SX = 718;
const BAR_SLEEVE_R_SW = 215;
const BAR_TIP_R_SX = 933;
const BAR_MID_LEN = 210;
const BAR_COLLAR_SPACE = 58;

// Collar: align the clamp "ring" (lower 2/3 of the sprite) to the bar axis.
const CAP_RING_FY = 0.66;
const CAP2_RING_LEFT = 0.0; // image_2 ring hugs the sprite's left (inner) edge
const CAP_GAP = -4; // negative → ring overlaps the plate so it clamps

export type PlateSpec = string | { key: string; tint?: string };

type Item = {
  sprite: Sprite;
  /** Pre-tinted replacement source (iron-black small plates). */
  tintSrc?: CanvasImageSource;
  x: number;
  y: number;
  w: number;
  h: number;
  sx?: number;
  sy?: number;
  sw?: number;
  sh?: number;
  flip?: boolean;
};

// ── Asset loading (embedded data URIs → images, processed once) ───────────
let cache: Promise<LoadedAssets> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load dumbbell sprite"));
    img.src = src;
  });
}
const toSprite = (img: HTMLImageElement): Sprite => ({ src: img, w: img.naturalWidth, h: img.naturalHeight });

// Tinted plate variants (desaturate → darken → restore alpha), cached per key+tint.
const tintCache = new Map<string, HTMLCanvasElement>();
function tintedSprite(key: string, sprite: Sprite, tint: string): CanvasImageSource {
  const id = `${key}|${tint}`;
  let c = tintCache.get(id);
  if (!c) {
    c = document.createElement("canvas");
    c.width = sprite.w;
    c.height = sprite.h;
    const x = c.getContext("2d")!;
    x.drawImage(sprite.src, 0, 0);
    x.globalCompositeOperation = "saturation";
    x.fillStyle = "#808080";
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = "multiply";
    x.fillStyle = tint;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = "destination-in";
    x.drawImage(sprite.src, 0, 0);
    tintCache.set(id, c);
  }
  return c;
}

/** Loads and caches every sprite. Safe to call repeatedly. */
export function loadDumbbell(): Promise<LoadedAssets> {
  if (!cache) {
    cache = (async () => {
      const [bar, cap] = await Promise.all([loadImage(SPRITES.bar), loadImage(SPRITES.cap2)]);
      const plateEntries = await Promise.all(
        PLATE_KEYS.map(async (k) => [k, toSprite(await loadImage(SPRITES[k]))] as const),
      );
      const plates: Record<string, Sprite> = {};
      for (const [k, s] of plateEntries) plates[k] = s;
      return { bar: toSprite(bar), cap2: toSprite(cap), plates };
    })();
  }
  return cache;
}

// ── Layout ────────────────────────────────────────────────────────────────
// specs: per-side plates, inner→outer (largest innermost). Each plate keeps
// its own sprite proportions; one scale keyed to the largest. A spec with
// `tint` renders the sprite recoloured (iron-black small plates).
function layout(a: LoadedAssets, specs: PlateSpec[]) {
  const refH = a.plates.blue?.h ?? 1;
  const plateScale = D / refH;
  const norm = specs.map((p) => (typeof p === "string" ? { key: p } : p));
  const sprs = norm.map((p) => a.plates[p.key] ?? a.plates.blue);
  const ws = sprs.map((s) => s.w * plateScale * PLATE_OVERLAP);
  const stackW = ws.reduce((sum, w) => sum + w, 0);

  const capW = a.cap2.w * (CAP_H / a.cap2.h);
  const capY = -CAP_RING_FY * CAP_H;

  const barScale = BAR_THICK / a.bar.h;
  const barDrawH = a.bar.h * barScale;
  const barY = -barDrawH / 2;
  const tipW = BAR_TIP_SRC * barScale;
  const sleeveW = stackW + BAR_COLLAR_SPACE;
  const midW = BAR_MID_LEN;

  const xSleeveL = tipW;
  const xMid = tipW + sleeveW;
  const xSleeveR = xMid + midW;
  const xTipR = xSleeveR + sleeveW;

  const back: Item[] = [];
  const mid: Item[] = [];
  const collars: Item[] = [];

  const bs = (sx: number, sw: number, x: number, w: number) =>
    back.push({ sprite: a.bar, x, y: barY, w, h: barDrawH, sx, sy: 0, sw, sh: a.bar.h });
  bs(0, BAR_TIP_SRC, 0, tipW);
  bs(BAR_SLEEVE_L_SX, BAR_SLEEVE_L_SW, xSleeveL, sleeveW);
  bs(BAR_MID_SX, BAR_MID_SW, xMid, midW);
  bs(BAR_SLEEVE_R_SX, BAR_SLEEVE_R_SW, xSleeveR, sleeveW);
  bs(BAR_TIP_R_SX, BAR_TIP_SRC, xTipR, tipW);

  // Inner→outer so the outer plate sits on top; right stack mirrored so both
  // sides' faces point outward.
  const innerL = xMid;
  const innerR = xSleeveR;
  let lx = innerL;
  let rx = innerR;
  for (let i = 0; i < sprs.length; i++) {
    const w = ws[i];
    const h = sprs[i].h * plateScale;
    const { key, tint } = norm[i];
    const tintSrc = tint ? tintedSprite(key, sprs[i], tint) : undefined;
    lx -= w;
    mid.push({ sprite: sprs[i], tintSrc, x: lx, y: -h / 2, w, h });
    mid.push({ sprite: sprs[i], tintSrc, x: rx, y: -h / 2, w, h, flip: true });
    rx += w;
  }

  // Both collars use image_2; the left is mirrored so they're perfectly symmetric.
  const leftOuter = innerL - stackW;
  const rightOuter = innerR + stackW;
  collars.push({ sprite: a.cap2, x: leftOuter - CAP_GAP - capW, y: capY, w: capW, h: CAP_H, flip: true });
  collars.push({ sprite: a.cap2, x: rightOuter + CAP_GAP - CAP2_RING_LEFT * capW, y: capY, w: capW, h: CAP_H });

  const all = [...back, ...collars, ...mid];
  const minX = Math.min(...all.map((i) => i.x));
  const maxX = Math.max(...all.map((i) => i.x + i.w));
  return { back, collars, mid, minX, maxX };
}

export type DrawOptions = {
  /** Explicit per-side stack, inner→outer (largest first). Overrides plate/perSide. */
  plates?: PlateSpec[];
  /** Plate colour key (see PLATE_KEYS). Default "blue". */
  plate?: string;
  /** Plates per side. Default 3. */
  perSide?: number;
  /** Supersampling / pixel-density factor. Default 2. */
  scale?: number;
};

function resolveKeys(opts: DrawOptions): PlateSpec[] {
  if (opts.plates) return opts.plates;
  const { plate = "blue", perSide = 3 } = opts;
  return new Array(Math.max(0, perSide)).fill(plate);
}

/** Canvas pixel size for the given options (before you size the canvas). */
export function measure(a: LoadedAssets, opts: DrawOptions = {}) {
  const { scale = 2 } = opts;
  const { minX, maxX } = layout(a, resolveKeys(opts));
  return {
    width: Math.round((maxX - minX + PAD * 2) * scale),
    height: Math.round((D + PAD * 2) * scale),
  };
}

/** Draws the dumbbell onto ctx (transparent background). Sizes nothing — set
 *  canvas.width/height from measure() first. */
export function drawDumbbell(ctx: CanvasRenderingContext2D, a: LoadedAssets, opts: DrawOptions = {}) {
  const { scale = 2 } = opts;
  const { back, collars, mid, minX, maxX } = layout(a, resolveKeys(opts));
  const width = Math.round((maxX - minX + PAD * 2) * scale);
  const height = Math.round((D + PAD * 2) * scale);

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const ox = (PAD - minX) * scale;
  const oy = (PAD + D / 2) * scale;
  const blit = (it: Item) => {
    const src = it.tintSrc ?? it.sprite.src;
    const dx = ox + it.x * scale;
    const dy = oy + it.y * scale;
    const dw = it.w * scale;
    const dh = it.h * scale;
    if (it.flip) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      if (it.sw != null) ctx.drawImage(src, it.sx!, it.sy!, it.sw, it.sh!, 0, 0, dw, dh);
      else ctx.drawImage(src, 0, 0, dw, dh);
      ctx.restore();
    } else if (it.sw != null) {
      ctx.drawImage(src, it.sx!, it.sy!, it.sw, it.sh!, dx, dy, dw, dh);
    } else {
      ctx.drawImage(src, dx, dy, dw, dh);
    }
  };

  back.forEach(blit); // bar
  collars.forEach(blit); // collars — behind the plates
  mid.forEach(blit); // plates press on top of the collars
}
