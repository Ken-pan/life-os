---
title: KENOS APPLE CLIENTS — PACKAGE STATUS
owner: kenpan
last_verified: 2026-07-20
status: DEVICE_INSTALLED — AWAITING_UNLOCK_AND_OWNER_SMOKE
---

# Apple clients progress

## Automated

| Check | Result |
| --- | --- |
| KenosContracts `swift test` | PASS (6) |
| KenosClient `swift test` | PASS (6) |
| KenosIOS simulator build | BUILD SUCCEEDED |
| KenosMac arm64 build | completed |
| KenosIOS device build (`Ken’s 17 Pro`) | **BUILD SUCCEEDED** (team `93NJ4CAU8B`) |
| Device install | **PASS** — `space.kenos.app.ios` |
| Device launch | FAIL — device Locked |

## Requires Owner

1. 解锁 iPhone「Ken’s 17 Pro」
2. 打开 Kenos（首次可能需「信任开发者」）
3. 登录后快速看：Today / Focus / Approvals 是否可读
4. 回复「真机已开」或贴截图

安装已完成；解锁后即可冷启动。模拟器 ≠ 生产通过。
