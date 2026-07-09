// Thin re-export shim so Svelte components can import formatting helpers via `$lib/format.js`
// instead of a relative path to `src/format.ts`. Mirrors the `$lib/appRoute.ts` pattern.
export * from '../format'
