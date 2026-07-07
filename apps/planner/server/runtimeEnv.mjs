/**
 * Read Kimi API key at function runtime. Bracket access avoids esbuild inlining
 * a stale KIMI_API_KEY from the build environment into the function bundle.
 */
export function readKimiApiKey() {
  const env = globalThis.process?.env;
  if (!env) return undefined;
  return env[['KIMI', 'API', 'KEY'].join('_')];
}
