/**
 * 下载并规范化机构 Logo（Simple Icons + Wikimedia Commons + 官方 CDN）。
 * 运行: node scripts/fetch-institution-logos.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/assets/institutions");
const SI_DIR = path.join(ROOT, "node_modules/simple-icons/icons");

/** @type {Record<string, { kind: 'simple' | 'wiki' | 'url'; slug?: string; file?: string; url?: string; bg?: string }>} */
const SOURCES = {
  chase: { kind: "simple", slug: "chase", bg: "#ffffff" },
  "bank-of-america": { kind: "simple", slug: "bankofamerica", bg: "#ffffff" },
  "wells-fargo": { kind: "simple", slug: "wellsfargo", bg: "#ffffff" },
  citi: { kind: "wiki", file: "Citi logo March 2023.svg", bg: "#ffffff" },
  amex: { kind: "simple", slug: "americanexpress", bg: "#ffffff" },
  discover: { kind: "simple", slug: "discover", bg: "#ffffff" },
  "capital-one": { kind: "wiki", file: "Capital One logo.svg", bg: "#ffffff" },
  "us-bank": { kind: "wiki", file: "US Bank logo 2023 color.svg", bg: "#ffffff" },
  robinhood: { kind: "simple", slug: "robinhood", bg: "#1E2124" },
  fidelity: {
    kind: "url",
    url: "https://static.cdnlogo.com/logos/f/11/fidelity-investments.svg",
    bg: "#ffffff",
  },
  vanguard: { kind: "wiki", file: "Vanguard.svg", bg: "#ffffff" },
  "apple-card": { kind: "simple", slug: "apple", bg: "#ffffff" },
  target: { kind: "simple", slug: "target", bg: "#ffffff" },
  bilt: { kind: "wiki", file: "Bilt Rewards logo.svg", bg: "#ffffff" },
  alaska: { kind: "wiki", file: "Alaska Airlines Logo.svg", bg: "#ffffff" },
  "rocket-money": {
    kind: "url",
    url: "https://framerusercontent.com/images/ZOA99UIp1h5v4nfGMfga0fZ49Zg.svg",
    bg: "#ffffff",
  },
};

const BRAND_HEX = {
  chase: "117ACA",
  bankofamerica: "012169",
  wellsfargo: "D71E28",
  americanexpress: "016FD0",
  discover: "FF6000",
  robinhood: "CCFF00",
  apple: "000000",
  target: "CC0000",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url, label) {
  const res = await fetch(url, {
    headers: { "User-Agent": "FinanceOS-LogoFetcher/1.0 (personal project)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes("<svg") && !text.includes("<SVG")) throw new Error(`${label}: not SVG`);
  return text;
}

async function fetchWikiSvg(filename) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
  return fetchText(url, filename);
}

function readSimpleIcon(slug) {
  const file = path.join(SI_DIR, `${slug}.svg`);
  if (!fs.existsSync(file)) throw new Error(`Simple Icons missing: ${slug}`);
  return fs.readFileSync(file, "utf8");
}

function parseViewBox(svg) {
  const vbMatch = svg.match(/viewBox=["']([^"']+)["']/i);
  if (vbMatch) return vbMatch[1];
  const w = parseFloat(svg.match(/\bwidth=["']([\d.]+)/i)?.[1] ?? "");
  const h = parseFloat(svg.match(/\bheight=["']([\d.]+)/i)?.[1] ?? "");
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return `0 0 ${w} ${h}`;
  return "0 0 24 24";
}

/** 将任意 SVG 包装为 32×32 圆角 app icon，保留 viewBox 比例。 */
function wrapAsAppIcon(rawSvg, bg = "#ffffff") {
  const inner = rawSvg
    .replace(/<\?xml[^?]*\?>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .trim();

  const viewBox = parseViewBox(inner);
  const content = inner
    .replace(/^<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .trim();

  const pad = 4;
  const size = 32 - pad * 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="${bg}"/>
  <svg x="${pad}" y="${pad}" width="${size}" height="${size}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">
    ${content}
  </svg>
</svg>`;
}

function colorizeSimpleIcon(svg, slug) {
  const hex = BRAND_HEX[slug] ?? "000000";
  return svg
    .replace(/<path /g, `<path fill="#${hex}" `)
    .replace(/<path>/g, `<path fill="#${hex}">`)
    .replace(/fill="currentColor"/g, `fill="#${hex}"`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let ok = 0;
  let fail = 0;

  for (const [id, src] of Object.entries(SOURCES)) {
    try {
      let raw;
      if (src.kind === "simple") {
        raw = colorizeSimpleIcon(readSimpleIcon(src.slug), src.slug);
      } else if (src.kind === "url") {
        raw = await fetchText(src.url, id);
      } else {
        await sleep(1500);
        raw = await fetchWikiSvg(src.file);
      }
      const out = wrapAsAppIcon(raw, src.bg ?? "#ffffff");
      fs.writeFileSync(path.join(OUT, `${id}.svg`), out);
      console.log(`✓ ${id} (${src.kind})`);
      ok++;
    } catch (e) {
      console.warn(`✗ ${id}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} ok, ${fail} failed → ${OUT}`);
  if (fail > 0) process.exitCode = 1;
}

main();
