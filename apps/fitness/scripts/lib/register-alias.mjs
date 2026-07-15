/**
 * 注册 SvelteKit 别名解析钩子。用法：
 *   node --import ./scripts/lib/register-alias.mjs scripts/xxx-check.mjs
 */
import { register } from 'node:module';

register('./alias-hooks.mjs', import.meta.url);
