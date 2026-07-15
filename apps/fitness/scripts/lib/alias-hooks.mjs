/**
 * node 解析钩子：把 SvelteKit 的 `$lib` / `$app` 别名喂给 plain node。
 *
 * 为什么需要：scripts/*.mjs 里的纯函数校验用 `node` 直接跑，但被测模块的 import
 * 链上有 `$app/environment`（state.svelte.js）和 `$lib/state.svelte.js`（i18n）。
 * node 不认这两个别名，会直接 ERR_MODULE_NOT_FOUND —— 不是某条断言红，是整个
 * 脚本一行都跑不起来（2026-07-15 前 plate-calculators-check / weight-memory-check
 * 就是这么静默失效的）。
 *
 * 用法见 register.mjs；vite 侧不受影响，这只在 node 测试进程里生效。
 */
import { pathToFileURL } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { compileModule } from 'svelte/compiler';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = pathResolve(HERE, '../..');
const LIB_URL = pathToFileURL(pathResolve(APP_ROOT, 'src/lib') + '/').href;

const STUBS = {
  '$app/environment': pathToFileURL(pathResolve(HERE, 'stubs/app-environment.js')).href
};

export async function resolve(specifier, context, next) {
  const stub = STUBS[specifier];
  if (stub) return { url: stub, shortCircuit: true };
  if (specifier.startsWith('$lib/')) return next(LIB_URL + specifier.slice(5), context);
  return next(specifier, context);
}

/**
 * `*.svelte.js` 是 Svelte 5 的 runes 模块（`$state` 等），node 直接跑会
 * `ReferenceError: $state is not defined`。这里用 svelte 编译器把它编成普通 JS。
 * 用 server 目标：runes 退化成普通值，正好适合纯逻辑校验（不需要响应式）。
 */
export async function load(url, context, next) {
  if (url.startsWith('file:') && url.endsWith('.svelte.js')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const { js } = compileModule(source, { generate: 'server', filename: fileURLToPath(url) });
    return { format: 'module', source: js.code, shortCircuit: true };
  }
  return next(url, context);
}
