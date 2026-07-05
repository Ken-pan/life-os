/**
 * One-off: replace raw px in spacing properties with --space-* tokens in index.css
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "../src/index.css");
let css = readFileSync(cssPath, "utf8");

const pxToToken = [
  [96, "var(--space-24)"],
  [48, "var(--space-12)"],
  [40, "var(--space-10)"],
  [32, "var(--space-8)"],
  [28, "var(--space-7)"],
  [24, "var(--space-6)"],
  [20, "var(--space-5)"],
  [18, "var(--space-4)"],
  [16, "var(--space-4)"],
  [14, "var(--space-3-5)"],
  [12, "var(--space-3)"],
  [10, "var(--space-2-5)"],
  [9, "var(--space-2)"],
  [8, "var(--space-2)"],
  [7, "var(--space-2)"],
  [6, "var(--space-1-5)"],
  [5, "var(--space-1)"],
  [4, "var(--space-1)"],
  [3, "var(--space-1)"],
  [2, "var(--space-0-5)"],
];

const spacingProps =
  /(?:^|\s)((?:gap|row-gap|column-gap|padding|margin|padding-top|padding-bottom|padding-left|padding-right|margin-top|margin-bottom|margin-left|margin-right))\s*:\s*([^;]+);/gm;

css = css.replace(spacingProps, (full, _prop, value) => {
  if (value.includes("var(--") || value.includes("env(") || value.includes("calc(")) {
    return full;
  }
  let next = value;
  for (const [px, token] of pxToToken) {
    next = next.replace(new RegExp(`(?<![\\d.])${px}px`, "g"), token);
  }
  return full.replace(value, next);
});

writeFileSync(cssPath, css);
console.log("Migrated spacing tokens in index.css");
