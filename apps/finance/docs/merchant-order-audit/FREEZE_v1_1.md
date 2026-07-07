# Merchant Order Audit v1.1 — Freeze Record

> Frozen: 2026-07-07  
> Code tag: `merchant-order-audit-v1.1-code` @ `172baa8a807e8d0ea8c56da05e3e1a44d4146d96` (pipeline only)  
> Handoff tag: `merchant-order-audit-v1.1-handoff` @ `0e9c2fe9895c288998639733baa5b3d7eac6c9c7`  
> Bundle (gitignored): `tools/web-state-devtools/bridge/data/merchant-order-audit-20260707-1620-after-target-final/`

## Git tags

| Tag | Points to | Contents |
|-----|-----------|----------|
| `merchant-order-audit-v1.1-code` | `172baa8` | Harvest/match/read-model engine only |
| `merchant-order-audit-v1.1-handoff` | `0e9c2fe9` | + governance docs, UI states, apply ledger, contract TS types |

Before tagging either: `git rev-parse HEAD` and confirm the intended commit.

## SHA256 checksums

| Artifact | SHA256 |
|----------|--------|
| `merchant-order-audit-20260707-1620-after-target-final.zip` | `e32db192bd879278560053b541e226ddd16390208af1e43cff8668d3b87dedbd` |
| `manifest.json` | `40bf7d455faf6a8ed56c8c429c09e818d03d21e30796aab3a39cba63e059de7c` |
| `read_model/read_model_manifest_v1_1.json` | `3d0a802bac429e448326f427b71c4959bf2b09792b6f6877241396fe901afff1` |

## v1.1 stats

- Clean orders: 105 (Target 81 / Amazon 20 / Best Buy 4)
- Clean items: 331
- Review queue: 168
- DB canonical enriched: 273

## Tracked copies (git)

- [AUDIT_DATA_CONTEXT_v1_1.md](./AUDIT_DATA_CONTEXT_v1_1.md)
- [DOWNSTREAM_HANDOFF_v1_1.md](./DOWNSTREAM_HANDOFF_v1_1.md)

## Policy

- Broad apply: **not approved**
- Bundle data stays in `bridge/data/` (gitignored); distribute via zip or external archive
- Regenerate zip after any approved scoped apply + read model rebuild
