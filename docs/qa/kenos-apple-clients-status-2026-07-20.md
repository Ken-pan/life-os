---
title: KENOS APPLE CLIENTS — PACKAGE STATUS
owner: kenpan
last_verified: 2026-07-20
status: SIMULATOR_BUILD_PASS — DEVICE_MOUNT_NEEDS_OWNER
---

# Apple clients progress

## Automated

| Check | Result |
| --- | --- |
| KenosContracts `swift test` | PASS (6) |
| KenosClient `swift test` | PASS (6) |
| KenosIOS simulator build (iPhone 17 OS 26.5) | **BUILD SUCCEEDED** |
| KenosMac arm64 build | completed (local sign) |
| Physical device `Ken’s 17 Pro` | FAIL — developer disk image could not be mounted |

## Requires Owner

请解锁 iPhone「Ken’s 17 Pro」，在设备上信任本机开发者，并确保已连接；完成后回复「设备已就绪」。

真机安装/冷启动/登录/Focus/Approval smoke 才能计为 PRODUCTION_VERIFIED。
