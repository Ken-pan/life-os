# DEVICE_CONNECTION_REPORT — Kenos iOS Daily Beta

**run_id:** `ios-daily-beta-2026-07-21T03:27Z`
**HEAD SHA:** `d8ec099ca92055bda74bc0b41bacc5708b303348`
**timestamp:** 2026-07-21T03:27:09Z (doctor) / 03:28:38Z (lifecycle smoke)

## Device

| Field | Value |
| --- | --- |
| Name | Ken’s 17 Pro |
| Model | iPhone 17 Pro (`iPhone18,1`) |
| iOS | 27.0 (24A5380h) Beta |
| UDID (full, evidence-only) | `00008150-000C38C20AC0401C` |
| CoreDevice id | `8097F071-CAB6-5AF0-8258-BCD985E9D79E` |
| Transport | `localNetwork` tunnel (TCP) |
| Pairing | paired · manualPairing |
| Developer Mode | **enabled** |
| DDI services | available |
| Lock | unlockedSinceBoot=true during smoke; earlier launches failed with `Locked` until owner unlocked |

## Visibility

```
Ken’s 17 Pro … 8097F071-… available (paired) iPhone 17 Pro
```

15 Pro is also paired (`DB1122B8-…`) but **not** in the Development provisioning profile — assist-only; does not block 17 Pro.

## Build destination

- Preferred install path: `generic/platform=iOS` → `devicectl device install app --device <17Pro>`
- Bundle: `space.kenos.app.ios`
- Product: `KenosIOS.app`

## Exit

| Assertion | Status |
| --- | --- |
| 17 Pro online + paired | PASS |
| Developer Mode | PASS |
| Install visible | PASS (`1.0.0` / `20260721` stamped; build stamp file `202607210317`) |
| Launch when unlocked | PASS |
| Launch when locked | FAIL (expected) → Owner unlock |

Evidence: `logs/doctor-live.txt`, `logs/UNLOCKED.flag`, device details JSON under `/tmp/kenos-17pro-details.json` (session).
