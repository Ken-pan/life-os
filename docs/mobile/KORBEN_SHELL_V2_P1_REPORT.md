# Korben Shell V2 — P1 报告(含 Gate A Closure)

```
KORBEN SHELL V2(Owner 判定,2026-07-23)
P0 AUDIT: PASSED
P1A EVIDENCE CLOSURE: PASSED
P1B UNIFIED CHROME: PASSED_AUTOMATED
P1 DEVICE GATE: OPEN
PER-SPACE CONTINUITY: ARCHITECTURE OPEN(ARCH-OPEN: PER_SPACE_SURFACE_CONTINUITY)
P2 SYSTEM STRIP: NOT STARTED(等 Device Gate)
STABILIZED: NO
```

## 冻结规则(Owner 已批,P2 前不可变更)

### Domain 胶囊 — 条件通过,层级锁定
```
Domain capsule = local view switcher(域内视图切换)
Orb + Intent Dock = global shell(全局壳)
```
四条视觉限制:仅在当前 Domain 显示 ✅ / 不复制 Orb 或 Capture ✅ / 视觉权重须低于 Intent Dock(待调) / 最好随滚动或上下文收敛(待做)。
**永不**把 Domain 胶囊扩展为:Space 切换、Korben 入口、Capture、全局 Inbox、全局运行态。

### ARCH-OPEN: PER_SPACE_SURFACE_CONTINUITY
Test 2 已证 Domain↔Domain 为逐次 hardLoad,状态不保留。三方案:A=每 Space 常驻 WebView(内存/桥接代价高,不做);B=单 WebView+状态恢复契约;**C=LRU Surface Pool(Today 常驻+当前 Domain+最近 Domain,≤3 个,长期推荐)**。
**决策时点:Orb Quick Switch 真机体验之后**——先观察 Plan↔Fitness 实际等待与状态损失,再定是否做 LRU Pool。不阻塞 P2。

### Mac 构建状态
```
MAC BUILD BASELINE: FAIL(master 0317ddbdb 引入,KenosAppModel:488 无守卫调用 iOS-only bridge)
KORBEN P1 INTRODUCED: NO
OWNER: 独立任务(已建 chip)
规则:后续改共享文件不得扩大 Mac 错误——涉及共享文件的新代码必须自带平台守卫,
「master 本来就红」不是无限豁免。
```

> 治理口径:P0 仅新增审计文档;P1/Gate A/Gate B 修改产品源码与测试,**未提交、未 push、未动 entitlement / 数据库 / 部署**;旧壳未删除。
> 上游:[KORBEN_SHELL_V2_P0_AUDIT.md](KORBEN_SHELL_V2_P0_AUDIT.md)

## 证据分级说明(全文用此口径)

- **AUTOMATED VERIFIED** — 模拟器自动化实测(simctl 深链驱动 + 生命周期/导航日志 + 截图)
- **CODE-PATH VERIFIED** — 仅证明走同一代码路径,未发生真实用户交互
- **DEVICE OPEN** — 等待真机验证
- **NOT TESTED** — 本轮未测

---

## 1. 改动文件清单

### 新增(`clients/apple/Apps/Shared/KorbenShell/`)
| 文件 | 职责 |
|---|---|
| `KorbenShellV2Feature.swift` | flag:**rollback 最高优先**(见 §2),启动冻结 |
| `KorbenShellView.swift` | 新壳根:TopChromePlaceholder + SurfaceHost + BottomChrome;shelf 深链重定向 |
| `KorbenShellProjection.swift` | 旧 model → 新壳只读投影(唯一耦合缝) |
| `KorbenShellState.swift` | `KorbenShellMetrics` inset 契约 + 壳级 presentation 骨架 |
| `KorbenSpaceSurfaceHost.swift` | 复用同一批持久 Web Surface(§3) |
| `KorbenBottomChrome.swift` | Orb + 静态 Intent Dock + LiveAccessory 复用 |
| `KorbenSurfaceLifecycleLog.swift` | Debug-only 探针:实例集合 + **导航事件**(start/finish/hardLoad/softNav/processTerm,只记 host) |

### 修改(最小侵入)
- `KenosRootView.swift` — 一个 `else if` 分支(9 行)。
- `KenosWebSurfaceView.swift` — 8 个单行探针钩子(make/update/dismantle + 5 个导航点),两壳共用。

### 测试
- `KorbenShellV2FeatureTests` — **5/5 通过**,含「两参共存 → Legacy 赢」。

---

## 2. Feature Flag(Gate A1 已修正)

判定顺序(**安全回退最高**):
```
1. -legacyKenosShell   → 强制旧壳(紧急回退,永远赢)
2. -korbenShellV2      → 强制新壳
3. feature.korbenShellV2.enabled (UserDefaults)
4. 编译默认:关
```
- 两个 launch args 同时存在 → **Legacy 胜出**(单测 `testBothArgumentsPresentLegacyWins` 锁定)。
- 启动时冻结(`static let`),dogfood 切换下次启动生效;设置页若做开关必须标注「下次启动后生效」。单进程内新旧壳互斥。
- 无远程配置、无运行时热切换。

---

## 3. WebView 生命周期与 Continuity(Gate A3/A4)

### 所有权(不变)
```
KenosWebSurfaceView(Owner,makeUIView 创建 WKWebView)+ KenosActiveWebRegistry(weak)
  ├─ shell 面:KenosDailyBetaSurface(单实例)
  └─ domain 面:KenosDomainModeShell 内 stayInApp 面
Legacy Host(flag OFF)/ Korben Host(flag ON)——启动冻结互斥,挂载同一批组件
```

### 实例稳定性 — AUTOMATED VERIFIED
同序列(启动→Plan→Fitness→Finance→Today):Korben 壳 shell/domain 面各 **create 1 · dismantle 0 · 零 UNTRACKED**;旧壳同序列 shell create×3/dismantle×2(存量问题,见 §6)。

### Test 1 — Shell Continuity(Today→Plan→Today)— AUTOMATED VERIFIED
- shell 面实例不变(`b8d7`),回 Today 后 **navStart/navFinish/hardLoad 全部零增长** → DOM 未被触碰,SPA 状态保留。
- scrollY / 未提交输入的视觉确认:**DEVICE OPEN**。

### Test 2 — Domain-to-Domain(Plan→Fitness→Plan)— AUTOMATED VERIFIED,结果为**不保留**
- 同一 domain WKWebView 实例(`6241`)上,每次 Domain↔Domain 切换均为 **hardLoad(load() 重新加载)**,backForwardList 递增(3→4→5),既非状态恢复也非浏览器后退。
- **结论:当前架构下 Domain 页面状态跨 Space 不保留。** 这是单 Domain-WebView 架构的既有语义(旧壳同理),如实记录为后续 Persistence / per-Space WebView 议题(P3+ 决策),本 Gate 不重构。

### 表述边界(Gate A2)
可以说:Chrome 状态变化与 kenos↔domain 模式切换**不会重建 WKWebView**;Shell 面(Today/Ask/Inbox)在模式往返中 DOM 零触碰。
不能说:每个 Space 的页面状态都被保留(Test 2 证伪);登录态「必然」保留——正确表述:复用同一 `WKWebsiteDataStore` 且零重建**降低了会话丢失风险**,登录态仍 DEVICE OPEN。

---

## 4. 构建 / 测试

```
xcodegen generate → 通过
xcodebuild build (iPhone 17 Pro sim) → BUILD SUCCEEDED
KorbenShellV2FeatureTests → 5/5
全量 KenosIOSTests → bundle passed(0 failed)
```

---

## 5. 验收矩阵(证据分级)

| 项 | Flag Off | Flag On | 级别 |
|---|---|---|---|
| Cold launch / Today 加载 | ✅ | ✅ | AUTOMATED |
| Plan / Fitness / Finance 深链切换 | ✅ | ✅ | AUTOMATED |
| 返回 Today | ✅ | ✅ | AUTOMATED |
| WKWebView 不因 chrome/模式切换重建 | 存量重建(§6) | ✅ c1/d0 | AUTOMATED |
| Shell 面 DOM 零触碰(Test 1) | — | ✅ | AUTOMATED |
| Domain↔Domain 状态保留(Test 2) | ❌ 不保留 | ❌ 不保留(同架构) | AUTOMATED(结果如实) |
| `kenos://shelf` 不 dead-end | ✅ | ✅ 重定向 Switcher | AUTOMATED |
| Orb / Intent Dock 真实点按 | — | — | **DEVICE OPEN**(仅 CODE-PATH:与深链同函数) |
| Background → foreground | ✅ | ✅ | AUTOMATED |
| 键盘 / VoiceOver / 横竖屏 | — | — | **DEVICE OPEN / NOT TESTED** |
| 登录态持久化 | — | — | **DEVICE OPEN** |
| Focus 路径 | ✅ | ✅ | CODE-PATH(分支在 flag 之上,两壳共用) |
| 旧壳 Flag Off 视觉/行为一致 | ✅ | — | AUTOMATED(截图对照) |

证据:`scratchpad/p1-evidence/01–10.png` + `log show` 导航时间线(随会话)。

---

## 6. 已知问题与限制

1. **[Gate B 对象] Domain Mode 仍用旧 chrome** — 破坏「Shell stays, context changes」;P1B 统一所有权后才可进 P2。
2. **Domain↔Domain 状态不保留**(Test 2)— 单 Domain-WebView 架构语义;per-Space 持久 WebView 是独立架构决策,待 Owner 定夺。
3. 旧壳 kenos↔domain 切换重建 Surface(`KenosShellWithSpaceShelf.body` 分支移位)— master 存量,独立工单。
4. 模拟器 MCP 面板失灵(宿主 Xcode-beta 缺 SimulatorKit)→ 无法注入真实触控;所有交互项 DEVICE OPEN。
5. App Group / 后台音频:按 Owner 决定移至**能力支线**,不阻塞主线;后台音频先做 Music Runtime 审计再动 entitlement。

---

## 7. Gate B — P1B Unified Chrome Ownership(已完成)

### 所有权图(flag ON)
```
KorbenShellView(唯一全局 chrome Owner,Kenos + 所有 Domain)
├─ TopChromePlaceholder(空态 0 高,预留 ≤36pt)
├─ KorbenSpaceSurfaceHost
│  ├─ Kenos shell Web 面(不变)
│  └─ KenosDomainModeShell(policy: .externalKorbenShell)
│     └─ 只剩:Web 内容 + router-back 边缘 + More sheet + 离开确认
│        (旧 GlobalDock / Shelf 抽屉 / shelf 边缘手势:不再渲染)
└─ KorbenBottomChrome(全 Space 同一套)
   ├─ [Domain 时] 域目的地胶囊(复用 domainDockItems/selectDomainDockSlot SSOT)
   ├─ Space Orb → Space Switcher
   └─ Intent Dock → Quick Capture
```

### 实现方式
- `KenosGlobalChromePolicy`(`.legacyOwned` / `.externalKorbenShell`)——**单一注入点**(`KorbenSpaceSurfaceHost` 传入),不在 Domain 视图里散落 flag 判断。Flag OFF 走 `.legacyOwned` 默认值,旧行为零变化。
- `KenosDomainModeShell` 改动:`ownsGlobalChrome` 门三处(shelf 边缘手势 / Shelf chrome / 底部 dock)+ `isImmersiveWebPath` 改 internal + web 滚动收尾 pad 在外部 chrome 下加 60px(胶囊第二行的余隙)。
- Korben chrome 的隐藏规则与旧 Domain dock 对齐:conversation / Settings / immersive 路由(`/focus`、`/summary`、`/tidy/go`)/ web overlay 状态(editing/drawer/sheet/capturing/scanning/immersive/compose)。
- **域子导航保留**:去掉旧 dock 会回归掉 Plan 的任务/日历/收件箱切换,故 Korben chrome 在 Domain 态加一行紧凑胶囊,直接复用 `domainDockItems` + `selectDomainDockSlot`(SSOT,零复制)。
- `kenos://shelf` 在两种模式下均重定向 Space Switcher(Korben 树内无 Shelf chrome,不 dead-end)。

### Gate B 自动验收(iPhone 17 Pro 模拟器)
| 项 | 结果 | 级别 |
|---|---|---|
| Flag ON:Plan / Fitness / Finance 均为 Korben chrome(旧 dock 消失) | ✅ 截图 11/13/14 | AUTOMATED |
| 域胶囊按域着色(Plan 金 / Training 橙 / Finance 绿)且可标识选中 | ✅ | AUTOMATED |
| Today→Plan→Fitness→Finance→Today 全程一套 Orb+Intent Dock | ✅ 截图 15 | AUTOMATED |
| 全旅程 WKWebView 零重建(pid 9687:shell c1 + domain c1,零 dismantle) | ✅ | AUTOMATED |
| Flag OFF:Plan 旧 dock/Shelf 原样(截图 12) | ✅ | AUTOMATED |
| Deep link 进 Domain 仍 Korben chrome | ✅ | AUTOMATED |
| Focus / immersive 隐藏 chrome | 与旧 dock 同一条件表 | CODE-PATH |
| 域胶囊真实点按 / 滚动到底不被遮 / 键盘 | — | DEVICE OPEN |
| 页面深浅极性差异(截图 03 vs 11) | web 侧主题状态所致(Flag OFF 同样为深),非 chrome 回归 | AUTOMATED(对照排除) |

### 发现的存量问题(不属本次)
- **KenosMac target 编译红**:`KenosAppModel.swift:488` 无守卫调用 iOS-only 的 `KenosNativeCapabilityBridge.broadcastAuthVaultReady()`,自 commit 0317ddbdb 起;已建独立修复任务。

## 8. Device Gate 执行脚本(iPhone 17 Pro,15–25 分钟)

### 准备
- 已登录真实账户;Today/Plan/Fitness/Finance 有真实内容;不开 Focus。
- 记录 build/commit;Debug 构建(生命周期日志才生效);全程屏幕录制。
- **启用 flag 的实操注意**:launch argument 只在 Xcode Run 时生效——从主屏图标启动**不带** `-korbenShellV2`。两条路径任选:
  1. Xcode scheme → Arguments 加 `-korbenShellV2`,连真机 Run(推荐,回退只需去掉参数);
  2. 或先在 Xcode 带参跑一次后,由我加设置页 dogfood 开关(写 `feature.korbenShellV2.enabled`,下次启动生效)再脱机测——需要时说一声。

### Test 1 全局 Chrome 连续性
Today→Plan→Fitness→Finance→Today,每页停 2–3 秒。验收:全程仅一个 Orb、一个 Intent Dock;无旧 Shelf trigger / 旧 GlobalDock;chrome 位置不跳;无白屏闪烁;域胶囊只在对应 Domain 出现、回 Today 消失。

### Test 2 Orb 点按
命中自然(不需精确点中心);打开 Space Switcher;背景不 reload;关闭回原内容;连开关三次无叠层。记录 `Orb Tap: PASS/FAIL · Surface reload: 0/N`。

### Test 3 Intent Dock + 键盘(Today、Plan 各一次)
点按→键盘→输入→取消→再开。验收:Dock 不被键盘遮;web 不被挤错位;输入框不跳;关闭后布局恢复;Draft 保留按现有 Capture 行为如实记录;不 reload。

### Test 4 各 Domain 滚动到底(Plan/Fitness/Finance)
滚到底→点最后一个可交互对象→展开键盘/Sheet→返回。验收:最后一行完整露出,不被胶囊/Dock/Home Indicator 遮;+60px pad 不过大;无巨大空白。**截图必须同框:最后一个真实对象 + 域胶囊 + Intent Dock + Home Indicator。**

### Test 5 登录与前后台
已登录 Today→Plan→锁屏 30s→解锁→切后台 1min→回前台。验收:不重登;不回错 Space;不白屏;Bridge 可用;chrome 不重复;无非预期 hardLoad(看日志)。

### Test 6 VoiceOver(静态入口)
Orb / Intent Dock / 域胶囊项 / Space Switcher 关闭按钮:label 有意义、hint 描述结果、顺序合理、不读装饰图标、命中 ≥44×44pt。Orb 自定义 Actions 留 P3。

### Test 7 Dynamic Type(默认 / 较大 / 辅助功能大号)
域胶囊不截断;Intent Dock 不溢出;Top Slot 不挤压内容;按钮文字不裁切。最大字号下允许胶囊转横滚或菜单,但不可裁掉核心标签。

### 结果模板
```
KORBEN SHELL V2 — P1 DEVICE GATE
BUILD:                      DEVICE: iPhone 17 Pro    IOS:
FLAG: -korbenShellV2        DURATION:
GLOBAL CHROME CONTINUITY: PASS / FAIL
ORB TAP: PASS / FAIL
INTENT DOCK TAP: PASS / FAIL
KEYBOARD: PASS / FAIL
DOMAIN SCROLL END: PASS / FAIL
AUTH PERSISTENCE: PASS / FAIL
BACKGROUND / FOREGROUND: PASS / FAIL
VOICEOVER: PASS / FAIL
DYNAMIC TYPE: PASS / FAIL
WEBVIEW UNEXPECTED RELOADS:
DUPLICATE CHROME:
P0:                         P1:
SCREEN RECORDING:           SCREENSHOTS:
DEVICE GATE:                P2 READINESS:
STABILIZED: NO
```
**进 P2 硬门**:Global Chrome / Orb Tap / Intent Dock Tap / Keyboard / Domain Scroll End / Auth / BG-FG 全 PASS。VoiceOver、Dynamic Type 轻微 P1 可登记后修,但不得存在控件不可达、文字不可读、功能不可操作。

## 8b. 模拟器 Device Gate 执行记录(2026-07-23,Owner 指示中止)

```
KORBEN SHELL V2 — P1 DEVICE GATE(模拟器代跑,真机项仍 OPEN)
DEVICE: iPhone 17 Pro 模拟器(iOS 26.4)  FLAG: -korbenShellV2
GLOBAL CHROME CONTINUITY: PASS(深链驱动 AUTOMATED,§7)/ 真实点按 UI 测试被环境弹窗阻断
ORB TAP: NOT COMPLETED(见下)      INTENT DOCK TAP: NOT COMPLETED
KEYBOARD: NOT TESTED               DOMAIN SCROLL END: 截图人工核(pad 已 +60px)
AUTH PERSISTENCE: DEVICE OPEN      BACKGROUND/FOREGROUND: PASS(AUTOMATED,§5)
VOICEOVER: DEVICE OPEN             DYNAMIC TYPE: NOT COMPLETED
WEBVIEW UNEXPECTED RELOADS: 0(全旅程 c1/c1/d0)
DUPLICATE CHROME: 0
P0: 无(未发现产品缺陷)
阻断原因: HealthKit 授权 sheet(另一会话新功能)每次启动由系统进程呈现,
盖住全部 UI;XCUITest 已定位需从 springboard 侧点掉,修复已写入
UITests/KorbenShellDeviceGateUITests.swift,最后一轮重跑被 Owner 中止。
DEVICE GATE: OPEN(交互项未收口)   STABILIZED: NO
```

已就绪资产:`KenosIOSUITests` scheme + 8 个 Device Gate UI 测试(真实点按/键盘/滚动/前后台/a11y/DynamicType,含 Health sheet 处理)。恢复方式:
`xcodebuild -project Kenos.xcodeproj -scheme KenosIOSUITests -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test`
或真机直接按 §8 手测。

## 8c. P2 System Strip + System Tray(已实现,2026-07-23;Owner 指示跳过 Device Gate 直接推进)

```
P2 SYSTEM STRIP: IMPLEMENTED
状态:编译绿;空态验收 AUTOMATED(无状态时 strip 完全隐藏、零占位);
有状态渲染(runtime/attention 单元、Tray 交互)为 CODE-PATH——
demo 未登录环境无法触发 focus/音乐/审批,待真机或登录环境复核。
```

- 新增 `KorbenSystemStrip.swift`:strip(≤36pt 胶囊,runtime 单元 tap→`activateLiveAccessory`、attention 单元 tap→Tray)+ `KorbenSystemTray`(顶部展开 overlay:正在进行 / 需要处理,非独立页面)。
- 数据源零新建:`model.liveAccessory`(focus 单元用 `focusStore.elapsedSeconds` TimelineView 每秒跳)+ `model.pendingApprovalCount`。
- **单一 chrome 规则**:Korben 壳内底部 `KenosLiveAccessoryBar` 移除,runtime chrome 归顶部 strip 独有;web 底部 accessory pad 归零。
- Insets:`topExtraPadPx` 参数穿线 `KenosWebSurfaceView`/`KenosDailyBetaSurface`/`KenosDomainModeShell`(legacy 默认 0 不受影响);strip 可见时全部 Space web 顶部 +44px,immersive 路由不加。
- 未做(按边界):Orb 手势、Intent 分类、Assist、App Group、Lens、strip 横滑/Hold 快捷控制(P2 后续打磨)。

## 8d. P3 Orb 手势语法(已实现,2026-07-23)

```
P3 ORB GESTURES: IMPLEMENTED
状态:编译绿;判定纯函数 5/5 单测(方向锁定角度/Fan 命中/弧线间距);
真实手势体验为 DEVICE OPEN(headless 无法注入拖拽)。
```

- 新增 `KorbenOrbGesture.swift`:`KorbenOrbGestureResolver`(纯函数状态机,规范参数:tap<250ms/<8pt、hold 280ms、方向锁 18pt/±25°、右拉 72/132pt)+ `KorbenFanTarget.recents`(recentSpaceIds ∩ spaceCatalog,≤4,冷启动回退目录前 4)+ Fan/AssistPreview overlay。
- 手势映射:**Tap**→Space Switcher(Peek 占位)· **Hold 280ms**→Recent Fan(soft haptic)· **Hold+Drag**→拖过目标 selection haptic、松手 medium haptic 切换(`kenos://domain/<id>` 深链复用)、无目标/拖回自然取消 · **Swipe Up**→Space Switcher(Center)· **Drag Right** ≥72pt 预览气泡、≥132pt 松手进 Ask(`kenos://assistant`;真 Assist P5 接管)。
- **可点击替代路径**:Orb 三个 VoiceOver accessibilityActions(切换器/最近空间/Ask);Fan overlay 对 VO 隐藏。
- **跳过项(记录)**:Double Tap→Today(会拖慢单击响应,规范也标 Power 可关;待 P8 定夺)。
- Reduce Motion:Fan 高亮不缩放、Orb 不缩放(沿用 KenosMotion 分支)。

## 8e. P4A Intent Dock + Quick Capture(已实现,2026-07-23)

```
P4A QUICK CAPTURE: IMPLEMENTED
状态:编译绿;Orb/IntentDock 真实点按 UI 测试结果见附注;
写入走现有可靠管线(CaptureDraft + 离线队列 + idempotencyKey),零新写路径。
```

- 新增 `KorbenQuickCapture.swift`:两档 sheet(`fraction(0.44)` Quick Capture / `fraction(0.82)` Korben Canvas 占位),系统 detent 承担档位切换与连续下滑(Canvas→Capture→Dock)。
- Layer 1 内容:标题 + **Scope chip**(ContextSnapshot 简版:当前 Space)+ 多行输入(自动聚焦)+ 识别行(P4A 静态口径「保存为 Capture 草稿」,不假装已分类)+ 取消/创建。创建 = `model.submitCapture()`(现有幂等入队管线)。
- Layer 2:Canvas 占位(P5 接真 Assist/Agent)。
- 入口:Intent Dock tap / 上滑(深上滑 >120pt 直达 Canvas 档);Korben 壳内旧 `showCaptureSheet` 代码路径重定向到新 sheet(Focus 分支不受影响)。
- **`kenos://compose` 深链保持 web 侧快速捕获弹窗**(现有产品行为,截图验证无回归)——两入口并存如实记录,收敛留 P4B。
- 未做(按边界):意图分类/CandidateAction/ConfirmationPolicy/Receipt-Undo 展示(P4B);语音;Scope 切换。

### 交互自动化阻断记录(环境,非产品缺陷)
UI 测试的真实点按持续被 **HealthKit 授权 sheet** 盖住:该 sheet 每次启动重现,由独立 Health 服务进程呈现,app 层级与 springboard 层级都查不到其按钮(两种 dismiss 策略均已尝试)。Orb/IntentDock/键盘交互项维持 **DEVICE OPEN**。解除方式(任选):
1. 真机/模拟器上**手动点一次 Don't Allow**,授权落定后永不再弹,UI 测试套件即可全量跑;
2. 请 HealthKit 会话给授权请求加测试跳过参数(如 `-kenosSkipHealthPrompt`,读 `kenos.healthkit.authPrompted` 之外再查 launch args)。

## 9. Device Gate 通过后的 P2 边界(预告,未开工)
只做 System Strip(Runtime + Attention 投影)+ System Tray:高度 ≤36pt、无状态 0pt、同一条最多 3 单元(`♪ Daily Mix · 1:42 | 专注 · 18:23 | 2 待确认`),不做大型顶部 Runtime 卡。**不碰**:Orb 新手势、Intent 分类、Korben Assist、App Group、Lens、Per-Space WebView Pool。能力支线并行:App Group closure(先于 Live Activity/Widget 扩展)、Music Runtime 审计(先于后台音频 entitlement)。
