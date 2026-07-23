# Korben Shell V2 — P0 只读审计 + 实施计划

> 状态:**P0 只读审计已完成**。未修改任何源码、未部署、未碰生产数据。
> 代码库:`clients/apple`(iOS App,内部名 Kenos / 产品名 Korben)。
> 定位:**Kenos = 内部平台/数据/架构;Korben = 用户面产品 + AI 管家人格。**
> 第一刀决策(Owner 已定):**纯原生 Chrome 包现有 Web Space** —— System Strip / Orb / Intent Dock / Overlay 全做原生壳,中央仍是现有 WKWebView Space。规范第 4 章「原生对象单页流」推迟或改由 Web 侧实现。

---

## 0. 最重要的一条

现有 App 是 **「原生 WKWebView 壳 + Web SPA」混合架构,不是原生页面**:

- 一级页面(Today / Ask / Inbox)与全部 Domain(Plan / Work / Fitness / Finance / Knowledge / Music / Home / Health / Code)**内容都在 Web**(`https://www.kenos.space` 及 LAN Daily Beta)。
- 原生层只负责:**壳、dock、shelf、deep link、能力桥**(`window.kenosNative`)。
- 全库**无 "Korben" 命名**,App 全叫 `Kenos`(id `space.kenos.app.ios`)→ 需新建 Korben 品牌层(color token / 文案 / Assist 人格),但底层复用 Kenos。

含义:Korben Shell V2 是**围绕 Web Space 的原生 chrome 重构**,不是把 Domain 重写成 SwiftUI。玻璃属于 Korben Shell,内容属于 Web Space —— 与规范第 10 章「Domain 内容不做玻璃卡」天然吻合。

---

## 1. A. 精确文件路径清单(带行号)

### App 入口 / Root
- `Apps/iOS/Sources/KenosApp.swift` — L7 `@main struct KenosApp`,L14-16 根 `ZStack{ canvasColor; KenosRootView }`;L46-201 `KenosAppDelegate`(推送/通知→deep link)。
- `Apps/Shared/KenosRootView.swift`(**2461 行**)— 真正的根视图。L19 `body` 顶层分支(unlock gate / focus / shell);L226 `iPhoneTabs`;L361 `iPadSplit`;L392 `macSidebar`。
- `Apps/Shared/KenosAppModel.swift`(**3032 行**)— 超级 ViewModel,承载壳/dock/domain/continue/deeplink 全逻辑。

### 底部导航(无系统 TabView)
- `Apps/Shared/KenosGlobalDock.swift` L16 `KenosGlobalDock`(Spaces Orb + 3 胶囊)。L167 Orb。
- `Apps/Shared/KenosRootView.swift` L687 `KenosBottomChromeBar`(LiveAccessory + GlobalDock)。
- Tab 枚举:`KenosAppModel.swift:24` `enum Tab { today, assistant, spaces, inbox, settings }`。
- Dock 项:`KenosAppModel.swift:2282 DomainDockItem`、`:2294 kenosCapsuleDockItems`、`:2304 domainDockItems`。

### Space / Shelf 切换
- `Apps/Shared/KenosRootView.swift` L532 `KenosShellWithSpaceShelf`、L599 `KenosShelfEdgeOpenOverlay`、L626 `KenosSpaceShelfChrome`。
- `Apps/Shared/KenosDomainShell.swift` L22 `KenosDomainModeShell`、L562 `KenosSpaceShelfView`。
- `Packages/KenosDesign/Sources/KenosDesign/KenosShelfGesture.swift`(手势提交/视差)。
- Domain 注册表 SSOT:`Apps/Shared/KenosDomainRegistry.swift:266-277`(每 Domain 一行 Definition);导航 slot `:285-382`。

### Continue / Resume
- `Packages/KenosClient/Sources/KenosClient/KenosSpaceSwitcherStore.swift` — L9 磁盘文件 `kenos.spaceSwitcher.v1.json`;L58 `ResumeDescriptor`;L114 recent/pinned/resume;L229 `applyRemoteShellState`(远端同步)。
- 冷启动恢复:`KenosAppModel.swift:174 lastDomainURLKey`(UserDefaults)。

### Deep link / 导航
- `onOpenURL`:`KenosRootView.swift:194`;URL 解析:`KenosAppModel.swift:938 open(urlString:)`(`URLComponents`,`kenos://` host switch)。
- **无集中 NavigationPath** — 分散的 `NavigationStack` + selection(`selectedTab`/`inboxDestination`/`spacesDestination`);Domain 二级导航由内嵌 WKWebView 自管。

### Feature Flag(无统一结构)
- 最干净静态模板:`Apps/iOS/Sources/Health/KenosHealthKitFeature.swift:10 enum ... { static let isEnabled = true }`。
- 可切换持久化模板:`Apps/Shared/KenosDailyBetaConfig.swift:58`(UserDefaults)、`KenosShellSettingsStore.swift:14`。

---

## 2. B. 能力现状对照(现状 vs 规范)

| 规范模块 | 现状 | 关键文件 | 复用度 |
|---|---|---|---|
| 双壳切换引擎 | `.kenos/.domain/.focus` 三态,opacity/scale keep-alive 防闪白 | `KenosRootView.swift:33-84` `KenosAppModel.shellMode` | 直接复用 |
| Space Orb + Shelf | Spaces Orb + 完整抽屉手势已实现 | `KenosGlobalDock`, `KenosShellWithSpaceShelf`, `KenosShelfGesture` | 骨架复用,手势扩到 6 种 |
| Continue / Resume | 磁盘+远端同步,pin/recent/resume | `KenosSpaceSwitcherStore` | 直接复用 |
| System Strip / Runtime | `KenosLiveAccessoryBar` 迷你条 + Focus 运行时 + NowPlaying;**无合并 Strip** | `KenosFocusRuntime/Store`, `KenosNowPlayingBridge` | 数据齐,UI 新建 |
| Attention(待确认/审批) | `InboxItem`/`ApprovalRecord`/`KenosGlances` 齐;`SystemStatusView` 已列队列 | `KenosClient.swift`, `KenosGlances.swift`, `KenosRootView.swift:1937` | 数据齐,投影进 Strip |
| Intent Dock / Capture | `CaptureView` sheet;**仅落本地草稿,无路由、无语音** | `KenosRootView.swift:1892`, `KenosAppModel.swift:2905` | 骨架有,管线补全 |
| Capture 可靠性 | 幂等键+重试+R3/R4 拒绝;`ActivityItem` 有 correlationId/undo | `KenosOfflineActionQueue`(`KenosActions.swift:114`) | 现成骨架 |
| App Intents / Shortcuts | 5 个 Intent + `AppShortcutsProvider`(中英) | `KenosAppIntents.swift` | 直接扩展 |
| Live Activity / 灵动岛 | `training/focus/tidy` 全链路已上线 | `KenosLiveActivityAttributes/Foundation/Widget` | 直接复用 |
| Korben Assist / Canvas | 原生 `AssistantView` 是 **stub(250ms 假流)**;真身在 Web | `KenosRootView.swift:1038`, `KenosAppModel.swift:2890` | 需接真 agent |
| Camera / Korben Lens | **零实现、零权限**(AVFoundation 仅音频) | — | 全新建 |
| 设计系统 / Motion / Haptic | token/组件/A11y + 三动效族 + Reduce Motion + 桥内 haptic,与 Web CSS 对齐 | `KenosDesign.swift`, `KenosMotion.swift`, `KenosNativeCapabilityBridge.swift:703-725` | 直接复用 |

---

## 3. C. 可复用 / D. 需新建

### 可直接复用
双壳切换引擎、Space Shelf 抽屉全套、Domain 注册表 SSOT、Continue 持久化、Deep link 路由、离线队列+幂等(承载 Action Receipt)、App Intents、Live Activity 全链路、NowPlaying、设计系统+Motion+Haptic、Glance 投影层。

### 需新建
- `korbenShellV2` Feature Flag(仿 `KenosHealthKitFeature` 静态或 `KenosDailyBetaConfig` 可切)。
- System Strip 合并 UI(Runtime + Attention 投影,数据源已齐)。
- Orb 6 手势解析器(现有仅 tap/shelf);全部手势需可点击替代路径。
- Intent Dock 三层(Dock→Quick Capture→Canvas)+ 完整 Capture 管线(ContextSnapshot→分类→ConfirmationPolicy→Receipt→Undo)。
- 意图分类/路由(`CaptureDraft.targetHint` 有字段无消费者)。
- Korben Assist(上下文摘要+2-3 操作,非空白聊天)+ 真 agent 桥。
- Camera / Korben Lens + LockedCameraCapture extension + 相机/麦克风权限。
- 语音/听写捕获(Speech framework)。
- Korben 品牌层(accent `#5B8CFF`、文案、Assist 人格)。

---

## 4. E. 风险与未知项(真机会咬人)

| # | 风险 | 严重度 | 说明 |
|---|---|---|---|
| 1 | **App Group entitlement 缺失** | 高 | `project.yml` 声明 `group.space.kenos.app`,但 iOS/Widget `.entitlements` 都无 `application-groups` → App↔Widget/Live Activity 共享落进程内 fallback,不可靠。 |
| 2 | **后台音频缺失** | 高 | NowPlaying 设 `.playback`,但 `UIBackgroundModes` 只有 `fetch/processing`,无 `audio` → 锁屏续播「假活」。 |
| 3 | Push 未开 | 中 | 无 `aps-environment` → 远程 Live Activity 推送走不通,当前仅本地。 |
| 4 | Focus 本地模拟 | 中 | caches 目录,注释「No production Executor」→ 跨设备权威未落地。 |
| 5 | **无统一 NavigationPath** | 中 | 状态分散在 `selectedTab`/`shellMode`/`continuityURL` + WKWebView 内部历史。规范「每 Space 独立导航栈」需新建协调层。 |
| 6 | 超级文件 | 中 | `KenosRootView.swift`(2461) + `KenosAppModel.swift`(3032)。shellV2 共存边界需划清,避免继续膨胀。 |
| 7 | 命名对齐 | 信息 | Kenos↔Korben 需确认为同 App 新旧代号(Owner 已确认:Kenos 内部 / Korben 产品面)。 |
| 8 | 共享 Auth token 下发 | 中 | `getSharedAuthTokens` 把 Supabase token 交给页面 JS,靠 committed origin 白名单判定;安全性取决于 `KenosSharedWebAuth.isAuthRelatedHost` 严密度(未展开)。 |
| 9 | 相机全空 | 信息 | 锁屏捕获/后台录音零实现零权限,从头做需过隐私审查。 |

---

## 5. 分阶段实施计划(基于「原生 Chrome 包 Web」路线)

强约束(每阶段适用):不删旧壳 · 挂 `korbenShellV2` flag · 不做生产 DB migration · 不改 canonical owner · 不长期双写 · 不 push/deploy(除非 Owner 明确要求) · 不伪造生产数据 · 保持现有 deep link · 每阶段给真机截图+行为证据 · 未完成不宣称 STABILIZED。

| 阶段 | 内容 | 交付门 | 预计 |
|---|---|---|---|
| **P0** | ✅ 只读审计(本文档) | 本文档 + Owner 确认路线 | 完成 |
| **P1** | `korbenShellV2` flag + `KorbenShellView` 骨架,把现有 Today Web Space 接入中央 canvas;旧壳完全保留 | flag 开=新壳、关=旧壳;Today 可正常加载 | 6–10h |
| **P2** | System Strip(合并 Runtime+Attention,≤36pt,无状态隐藏)+ System Tray;投影现有 Focus/NowPlaying/Glance 数据 | 三态单元 + Tray 可展开,不遮 Dynamic Type | 4–8h |
| **P3** | Space Orb 6 手势(Tap/Up/Hold/Hold+Drag/DragRight×2)+ 全部可点击替代路径 + VoiceOver actions | 手势判定参数达标,不与左缘返回冲突 | 10–16h |
| **P4** | Intent Dock 三层 + Quick Capture + 完整 Capture 管线(ContextSnapshot→分类→ConfirmationPolicy→Receipt→Undo);复用 `KenosOfflineActionQueue` | L1 有 Undo,L2/L3 强确认,断网 Draft 不丢 | 12–20h |
| **P5** | Korben Assist(上下文摘要+2-3 操作)+ Canvas;接真 agent(替换 stub) | Assist 携带当前 Space/页面/选中/Runtime | 8–14h |
| **P6** | App Intents(`StartKorbenCaptureIntent`/`OpenKorbenAssistIntent`)+ Action Button Switchboard + Live Activity 扩展 | Shortcut 可配到 Action Button,按上下文路由 | 8–14h |
| **P7** | Korben Lens MVP(观察/文档/收据/空间/白板)+ Camera Control + LockedCameraCapture + 权限声明 | 锁屏仅写安全暂存区,解锁后路由 | 16–30h |
| **P8** | Accessibility(≥44pt/Dynamic Type/VoiceOver/Reduce Motion)+ Motion + 真机 Dogfood | 验收清单全绿 | 8–14h |

### 先决修复(建议在 P2 前或并行处理,否则 Live Activity/Widget 会「假活」)
- 补 `application-groups` entitlement(风险 #1)。
- 补 `UIBackgroundModes: audio`(风险 #2,若确需锁屏续播)。

---

## 6. 建议第一刀(P1 落点)

改动最小、风险最低的接入点:在 `KenosRootView.swift:33-84` 的 shell 分支处加

```swift
if KorbenShellV2.isEnabled {
    KorbenShellView(model: model)   // 新原生 chrome,中央仍复用现有 Web Space 承载
} else {
    // 现有 KenosShellWithSpaceShelf 分支,原样保留
}
```

`KorbenShellView` 首版只做:SystemStripHost(占位)+ SpaceNavigationHost(复用现有 `KenosDailyBetaSurface`/`KenosWebSurfaceView`,禁止 `.id(tab)` remount)+ BottomChromeHost(复用 Orb + Dock)。**先让 Today Web Space 在新壳里正常加载并可切 Space,再逐阶段替换 chrome。**

---

## 7. 下一 Gate

Owner 确认本计划后,进入 **P1:Feature Flag + Shell Skeleton**。P1 完成需交付:改动文件清单、架构说明、编译结果、真机截图(flag 开/关对比)、已知限制。
