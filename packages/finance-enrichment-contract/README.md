# @life-os/finance-enrichment-contract

Single source of truth for purchase enrichment **clean vs review** classification.

## Consumers

- `apps/finance/src/engine/purchaseEnrichmentDisplay.ts` (Finance OS UI)
- `tools/web-state-devtools/bridge/scripts/merchant-read-model-v1.mjs` (read model builder)

## Fixtures

`fixtures/display-state.json` — shared test cases for UI + read model parity.

```bash
node packages/finance-enrichment-contract/scripts/test-contract.mjs
```

## TypeScript

The package exports `src/index.d.ts` for TypeScript consumers. Keep the
runtime implementation in `.mjs`; update declarations when adding exported
rules or fixture-facing shapes.

## Rules

Do not duplicate `classifyCleanReasons` logic elsewhere. Extend this package first, then update consumers.
