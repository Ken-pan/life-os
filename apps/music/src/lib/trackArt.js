import { artColors } from './artColors.js';

/** @param {string} key */
export function artGradient(key) {
  const { hue, hue2, sat, light } = artColors(key);
  return `linear-gradient(145deg, hsl(${hue} ${sat}% ${light}%), hsl(${hue2} ${Math.max(sat - 8, 38)}% ${Math.max(light - 10, 28)}%))`;
}

/** Accent color for CSS variables (--track-accent, glow) */
/** @param {string} key */
export function trackAccent(key) {
  const { hue, sat, light } = artColors(key);
  return `hsl(${hue} ${sat}% ${Math.min(light + 10, 58)}%)`;
}
