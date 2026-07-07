/** Avoid esbuild inlining secrets from the build environment into function bundles. */
export function readKimiApiKey(): string | undefined {
  const env = globalThis.process?.env;
  if (!env) return undefined;
  return env[['KIMI', 'API', 'KEY'].join('_')];
}
