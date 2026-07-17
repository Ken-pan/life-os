# HealthOS Companion — Apple Watch + iPhone 数据采集

macOS 没有 HealthKit,所以 HealthOS 的 Mac 端拿不到 Apple Watch 数据。这个伴侣 app 补上这一环:
**iPhone(+ Apple Watch)读 HealthKit → 交付给 Mac 代理 → State Engine 被动推导状态,零手动记录。**

Apple Watch 采集的睡眠 / 心率 / HRV / 活动量会自动同步到 iPhone 的健康库,所以 iPhone app 读一处就能拿到手表的全部数据;watchOS target 主要用于腕上一瞥与快速触发。

## 数据流

```
Apple Watch ──(自动)──▶ iPhone 健康库
                              │  HealthKitReader(睡眠/静息心率/HRV/步数,按天聚合)
                              ▼
                   ┌──────────────────────┐
      iCloud Drive │ Documents/inbox/*.json│  (推荐:无需联网、不暴露端口)
  或 LAN 直连 POST │  → 同步到 Mac         │  http://<mac-ip>:5193/ingest
                   └──────────┬───────────┘
                              ▼
        Mac 代理 scanInbox() / POST /ingest → health.jsonl → State Engine
```

交付 schema 与 Mac 代理 `health.jsonl` / `POST /ingest` **严格同源**:
`{date:"yyyy-MM-dd", sleepHours?, restingHR?, hrv?, steps?}`(醒来日为 key,睡眠归到入睡+6h 的日期)。

## 构建 & 部署(需要你的 Xcode + Apple 开发者账号)

> ⚠️ iOS/watchOS app **无法在本仓库沙盒里构建、签名、部署**——需真机 + 开发者账号。
> 这里交付的是完整源码 + XcodeGen 规范,你在自己机器上一条命令生成工程即可。

```bash
brew install xcodegen
cd apps/health/companion
xcodegen                       # 生成 HealthOSCompanion.xcodeproj
open HealthOSCompanion.xcodeproj
```

> Info.plist / *.entitlements 由 `project.yml` 的 properties **生成**(唯一源)——别手改生成物,
> 改 `project.yml` 再 `xcodegen`。`.xcodeproj` 在 `.gitignore`;plist/entitlements 内容确定,提交进仓库便于 review。

在 Xcode 里:
1. 选中两个 target → Signing & Capabilities → 选你的 **Team**(自动签名)。
2. 确认 **HealthKit** 与 **iCloud › CloudDocuments**(容器 `iCloud.space.kenos.healthos`)已开。
3. 把 iPhone 连上,Build & Run 到手机;watchOS app 会随之装到配对的手表。
4. 首次打开授权读取健康数据 → app 自动同步,并注册后台刷新(每 ~2 小时)。

## 在模拟器上调试(已验证可跑)

无需签名即可在模拟器编译 + 运行,验证 UI 与代码路径(HealthKit 无数据是正常的,真机才有):

```bash
xcodegen
SIM=$(xcrun simctl list devices available | grep -m1 'iPhone' | grep -oE '\([0-9A-F-]{36}\)' | tr -d '()')
xcrun simctl boot "$SIM"
xcodebuild -project HealthOSCompanion.xcodeproj -scheme HealthOSCompanion \
  -destination "id=$SIM" -derivedDataPath /tmp/dd CODE_SIGNING_ALLOWED=NO build
xcrun simctl install "$SIM" "$(find /tmp/dd/Build/Products -name 'HealthOSCompanion.app' | head -1)"
xcrun simctl launch "$SIM" space.kenos.healthos.companion
xcrun simctl io "$SIM" screenshot /tmp/shot.png   # 看 UI
```
watchOS 同理,scheme 换 `HealthOSWatch`、destination 换 Apple Watch 模拟器、bundle id
`space.kenos.healthos.companion.watchkitapp`。

> 已验证:iOS + watchOS 两个 target 在 Xcode 26 / iOS·watchOS 26 模拟器上 **BUILD SUCCEEDED**、
> 安装启动、UI 正确、HealthKit 读取链路执行(空数据时状态显示「近 14 天无数据」)。
> 真机上有健康数据即会自动交付。

## 交付方式二选一(可都开)

- **iCloud Drive(推荐)**:什么都不用配。app 写 iCloud 容器,Mac 代理扫
  `~/Library/Mobile Documents/iCloud~space~kenos~healthos/Documents/inbox` 自动摄入。
  代理无需 entitlement(只是读已同步到本地的文件)。延迟几分钟,对健康数据足够。
- **LAN 直连(近实时)**:iPhone 与 Mac 同一 wifi 时,在 app 里填 Mac 的局域网 IP,
  直接 POST 到代理 `:5193/ingest`。

## 没有 Watch / 懒得部署?

可以先用一次性导入顶着:iOS「健康」→ 头像 → 导出所有健康数据 → 把 `export.xml` 拷到 Mac →
`healthos-focus-agent --import-health <path>`(见 [../docs/data-sources.md](../docs/data-sources.md))。
效果一样喂进 State Engine,只是不会持续更新。

## 文件

| 路径 | 作用 |
| --- | --- |
| `Shared/HealthDay.swift` | 按天聚合模型 + 日期口径(与代理同源) |
| `Shared/HealthKitReader.swift` | HealthKit 授权 + 查询 + 按天聚合 |
| `Shared/Delivery.swift` | iCloud Drive 写入 + LAN POST |
| `iOS/*.swift` | iPhone app(SwiftUI + 后台刷新 BGTask) |
| `Watch/WatchApp.swift` | watchOS app(腕上一瞥 + 手动同步) |
| `project.yml` | XcodeGen 规范 = Info.plist/entitlements/工程的**唯一源** |
| `project.yml` | XcodeGen 工程规范 |
