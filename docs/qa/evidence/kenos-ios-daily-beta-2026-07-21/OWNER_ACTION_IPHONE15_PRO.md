# iPhone 15 Pro — OWNER ACTION (signing)

**Time:** 2026-07-21  
**Target:** Ken’s iPhone 15 Pro (`iPhone16,1`, UDID `00008130-0008045E0843401C`, CoreDevice `DB1122B8-C6A8-5DB2-958B-637D01E25BF5`)  
**State:** paired · wired · iOS 26.5.2 · developer disk OK  
**Blocker:** Xcode has **No Accounts**; Team `93NJ4CAU8B` wildcard profile only lists 17 Pro UDID `00008150-000C38C20AC0401C`.

## Why install failed

```
No Accounts: Add a new account in Accounts settings.
Provisioning profile "iOS Team Provisioning Profile: *" doesn't include
  "Ken’s iPhone 15 Pro" (00008130-0008045E0843401C)
```

Existing `.app` from 17 Pro cannot be side-loaded onto 15 Pro (`0xe8008012` profile mismatch).

## What Ken needs to click (Mac, ~2 minutes)

1. Open **Xcode** on this Mac (`/Applications/Xcode.app`).
2. **Xcode → Settings → Accounts** → **+** → sign in with the Apple ID that owns team **93NJ4CAU8B** (Pan Juncheng / Development cert `24LGFN37R4`).
3. Keep **iPhone 15 Pro** unlocked and connected (already wired).
4. **Window → Devices and Simulators** → select **Ken’s iPhone 15 Pro** → wait until it shows ready / “Use for Development” if prompted → trust computer if asked.
5. Tell the agent “15 Pro ready” **or** run:

```bash
export KENOS_IOS_DEVICE=DB1122B8-C6A8-5DB2-958B-637D01E25BF5
export KENOS_DAILY_BETA_ORIGIN="http://$(ipconfig getifaddr en0):5219"
./scripts/kenos-ios-daily-beta/device-build-install.sh
```

No public deploy / TestFlight / DB change required — only local device registration into the free/team provisioning profile.

## After that

Agent will continue: build → install → cold launch → Today / Planner / Fitness LAN smoke on **15 Pro**.
