# iOS 原生壳（Capacitor）

Life OS 的 app 统一用 Capacitor 8 + SPM 打 iOS 原生壳（无需 CocoaPods）。
Web 代码零分叉：同一套 SvelteKit 静态构建同时服务 Web、PWA、iOS。

## 给一个 app 加 iOS 壳

```bash
npm run ios:add <app>                      # app = apps/ 下目录名
npm run ios:add music -- --background-audio   # 音频类 app：真后台播放
```

脚本（[`scripts/ios/add-ios.mjs`](../../scripts/ios/add-ios.mjs)）自动完成：依赖安装、
`capacitor.config.json`（appId 统一 `os.lifeos.<id>`，元数据取自 `app.manifest.json`）、
`cap add ios`、Info.plist 补丁、品牌图标/启动屏、`ios:*` npm scripts。幂等，可重复跑。

## 日常工作流（以 music 为例）

```bash
cd apps/music
npm run ios:sync       # 改完 Web 代码：构建 + 同步进原生工程
npm run ios:build:sim  # 命令行模拟器构建（CI/验证）
npm run ios:open       # Xcode 打开（手动调签名/capabilities 时用）
```

## 装到真机

```bash
npm run ios:device -- --list            # 已配对设备（● 在线 / ○ 离线）
npm run ios:device music                # 唯一在线设备时自动选
npm run ios:device music -- --device <UDID>
npm run ios:device music -- --no-launch # 只装不启动
```

[`deploy-device.mjs`](../../scripts/ios/deploy-device.mjs) 一条命令走完
sync → 签名构建 → 安装 → 启动，不需要开 Xcode。签名 team 从已装的 provisioning
profile 推断，也可用 `IOS_DEVELOPMENT_TEAM=<TeamID>` 覆盖。

**设备"已配对"≠"连得上"**：拔线后 `pairingState` 仍是 `paired`，只有
`transportType` 有值才说明此刻可达（脚本按这个判据，离线时立即报错而不是白等
一次完整构建）。iPhone 锁屏或断开数据线后会掉线，重连后需解锁屏幕。

模拟器安装/启动/截图：

```bash
xcrun simctl install <UDID> <path>/App.app && xcrun simctl launch <UDID> os.lifeos.<id>
xcrun simctl launch --console-pty <UDID> os.lifeos.<id>   # 捕获 WebView console（⚡️ 前缀）
```

## 平台自动获得的行为

- **SW 守卫**：`@life-os/platform-web/sw-lifecycle` 检测到原生壳自动跳过 service worker
  注册（`capacitor://` 下 SW 不可用，资源本来就打包在本地）。app 不需要任何适配。
- **`.gitignore`**：`cap add` 自动生成，产物（`App/public`、生成的 config）已排除；
  `ios/` 原生工程本身应提交。

## 原生能力插件

共享 Capacitor 插件放 `packages/capacitor-*`，标准插件包结构（package.json `capacitor`
字段 + 根 `Package.swift`）即可被 `cap sync` 自动发现、自动注册——**不要**把 Swift
插件写进 app 的 Xcode 工程（那需要手改 pbxproj + 子类化 ViewController，维护成本高）。

现有插件：

| 包 | 能力 | 用法 |
| --- | --- | --- |
| `@life-os/capacitor-nowplaying` | 锁屏/控制中心/灵动岛「正在播放」+ 远程命令 + 来电中断/拔耳机事件 | 装依赖后在媒体会话层分支，见 `apps/music/src/lib/mediaSession.js` |

新插件包三件套：`package.json`（`capacitor.ios.src: "ios"` + **exports 必须含
`"./package.json"`**，否则 CLI 识别不到）、根 `Package.swift`（包名 = npm 名的
PascalCase，如 `@life-os/capacitor-foo` → `LifeOsCapacitorFoo`）、
`ios/Sources/<Target>/` Swift 源码（类上 `@objc(XxxPlugin)` 会被扫描进
`packageClassList` 自动注册）。

## 已知坑（都已在共享层修掉/文档化）

- **WKWebView 无 `navigator.mediaSession`** → 锁屏控制必须走 nowplaying 插件。
- **IndexedDB 存 picker 的 `File` 是按临时文件引用序列化的**，临时文件被系统回收后
  读回空 blob。持久化前必须物化：`new Blob([await file.arrayBuffer()])`。
- **`registerPlugin` 必须从 `@capacitor/core` import**——注入的 `window.Capacitor`
  全局没有该方法（检测 `isNativePlatform()` 用全局倒是可以）。
- **模拟器锁屏不渲染 Now Playing 控件**（注册成功与否看 MediaRemote 日志）；最终
  样式需真机确认。
- os_log 的 `.info` 级别不落盘：`log show` 查不到就用 `log stream --level info`。

## 发布

真机（免费账号 7 天重签）：`ios:open` → Signing & Capabilities 选 Apple ID → Run。
TestFlight/App Store 需付费开发者账号；`ITSAppUsesNonExemptEncryption=false` 已由
脚手架写入，出口合规问卷可跳过。
