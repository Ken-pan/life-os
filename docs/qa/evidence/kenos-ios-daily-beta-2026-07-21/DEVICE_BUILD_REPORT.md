# DEVICE_BUILD_REPORT

## Build

```text
xcodegen generate
xcodebuild -project Kenos.xcodeproj -scheme KenosIOS -configuration Debug \
  -destination id=8097F071-CAB6-5AF0-8258-BCD985E9D79E \
  -derivedDataPath ./build-device -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=93NJ4CAU8B CODE_SIGN_STYLE=Automatic \
  KENOS_DAILY_BETA_ORIGIN=http://10.20.202.15:5219 \
  CURRENT_PROJECT_VERSION=202607210221 MARKETING_VERSION=1.0.0 build
→ BUILD SUCCEEDED
```

## Install / launch

```text
xcrun devicectl device install app --device 8097F071-CAB6-5AF0-8258-BCD985E9D79E \
  …/Debug-iphoneos/KenosIOS.app
xcrun devicectl device process launch --device … space.kenos.app.ios
→ INSTALL_OK launch_ec=0
```

## Notes

- First relaunch after SIGKILL failed with **Locked** until phone unlocked (owner action).
- Info.plist must be generated via XcodeGen `info.properties` (raw plist edits are overwritten).
- Reproducible wrapper: `scripts/kenos-ios-daily-beta/device-build-install.sh`
