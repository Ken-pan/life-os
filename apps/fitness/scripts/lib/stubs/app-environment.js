/**
 * `$app/environment` 的 node 替身 —— 只给 scripts/*.mjs 里的纯函数校验用。
 * 这些校验跑在 node 里，没有 SvelteKit 运行时，但被测模块的 import 链会碰到它。
 */
export const browser = false;
export const dev = false;
export const building = false;
export const version = 'test';
