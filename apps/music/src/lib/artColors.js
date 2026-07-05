/** FNV-1a hash → deterministic palette seed */
/** @param {string} key */
export function hashKey(key) {
  let h = 2166136261;
  const s = key || 'unknown';
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** @param {string} key */
export function artColors(key) {
  const h = hashKey(key);
  const hue = h % 360;
  const hue2 = (hue + 36 + ((h >> 8) % 72)) % 360;
  const sat = 52 + ((h >> 16) % 28);
  const light = 40 + ((h >> 20) % 16);
  return { hue, hue2, sat, light };
}
