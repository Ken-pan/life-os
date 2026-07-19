---
title: Kenos Apple Client Architecture
owner: kenpan
last_verified: 2026-07-18
doc_role: native-client-architecture
status: target-approved-foundation-pending
review_cadence: before-each-native-phase
---

# Kenos Apple Client Architecture

## 1. 产品结论

用户在 Apple 生态只安装一个产品名为 **Kenos** 的 App:

| 平台          | 产品角色                                 | 不是什么                |
| ------------- | ---------------------------------------- | ----------------------- |
| iPhone / iPad | 随身管家、捕获、提醒、现实感知、移动执行 | 全部 Web 管理页的缩小版 |
| macOS         | 深度工作中心、本地 AI 控制台、全局工作台 | 只把网页装进窗口的壳    |
| watchOS       | 即时状态、快速输入、提醒、训练与微操作   | 缩小版 Kenos 主应用     |

Assistant、Work、Plan、Library、Health、Training、Money、Home、Music、System 是同一 App 内的 Spaces，不是十个要单独安装的产品。

## 2. 当前原生资产盘点

这些资产在统一客户端可替代前不能删除:

| 现有资产            | 位置                                                | 当前价值                                | 目标处理                                               |
| ------------------- | --------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| AIOS Tauri          | `apps/aios/src-tauri`                               | 本地 AI 与现有 Mac 壳                   | 提炼 Runtime/Assistant 能力，逐步迁到 Kenos Mac        |
| KnowledgeOS Tauri   | `apps/knowledge/src-tauri`                          | Vault/RAG/本地文件                      | 先保持工作，抽 Library API 和文件契约                  |
| HealthOS Tauri      | `apps/health/src-tauri`                             | Mac Health/Focus                        | 保持到 Kenos Mac Health/System 能替代                  |
| Health companion    | `apps/health/companion/HealthOSCompanion.xcodeproj` | iOS/watchOS HealthKit 与 companion 原型 | 作为 Apple Foundation 取证来源，不直接 wholesale merge |
| Music Capacitor iOS | `apps/music/ios/App/App.xcodeproj`                  | Music iOS 壳和 now-playing 集成         | Music 控制能力迁移后再退役                             |
| PaperOS             | 独立仓库 `/Users/kenpan/「Projects」/paperos`       | 专用设备体验                            | 保持独立设备仓库，通过 contracts/API 接入              |

统一不是立即删除旧壳。每个旧壳都必须在 Migration Ledger 中证明功能、数据、deep link、权限和恢复入口被替代后才退役。

## 3. 推荐工程结构

最终目录在 `OPEN-006` 冻结。推荐概念结构:

```text
clients/apple/
├── Kenos.xcworkspace
├── Apps/
│   ├── iOS/
│   ├── macOS/
│   └── watchOS/
├── Extensions/
│   ├── ShareExtension/
│   ├── WidgetExtension/
│   ├── Intents/
│   └── Spotlight/
├── Packages/
│   ├── KenosCore/
│   ├── KenosModels/
│   ├── KenosAPI/
│   ├── KenosSync/
│   ├── KenosAssistant/
│   ├── KenosIntents/
│   ├── KenosSearch/
│   ├── KenosSecurity/
│   ├── KenosDesign/
│   └── KenosTestSupport/
└── PlatformModules/
    ├── KenosMobile/
    ├── KenosDesktop/
    └── KenosWatch/
```

### 3.1 三个 product target，而不是强行一个 target

- 共享模型、API、同步、安全、Actions、设计 tokens 和测试 fixture。
- iOS/iPadOS 自己拥有 Share Sheet、Camera、RoomPlan、Widget、Live Activity。
- macOS 自己拥有 Menu Bar、Command Bar、多窗口、Vault、Runtime、Spotlight。
- watchOS 自己拥有 Complication、Smart Stack、Workout、快速语音和 pending actions。
- 平台差异通过 module/adapter 表达，不在共享包里堆 `#if os(...)` 到无法维护。

### 3.2 依赖方向

```text
KenosModels <- KenosCore <- KenosAPI/KenosSync/KenosSecurity
                         <- KenosAssistant/KenosSearch/KenosIntents
                         <- Platform modules
                         <- Product targets / extensions
```

共享包不得依赖具体 App target。Product target 不直接拼 SQL，不复制领域模型，不持有 service role。

## 4. 平台职责

### 4.1 iPhone / iPad

首层导航（Nav IA 第一刀，Web AIOS 同构）:

```text
Today · Assistant · Spaces · Inbox
```

- **Work** 归 Spaces（非顶层 Tab）；旧 deep link `kenos://work*` 映射到 Spaces → Work。
- **Approvals / Activity / Capture 目的地** 归 Inbox；Capture **不是** Tab，而是全局动作（Toolbar / ⌘N / Command Menu）。
- 本刀边界：只改壳层入口语义；不做 FocusContext / Focus Session、Watch 导航、完整 Space 局部 IA、生产 cutover。

#### Today

只回答:

- 当前状态是什么？
- 今天真正重要的是什么？
- 下一步是什么？
- 有什么需要决定？
- 系统已经处理了什么？

它不是 Portal 卡片启动器，不展示所有系统统计。

#### Assistant

支持文本、语音、图片、文件和当前分享上下文。所有写入走 Action Request；回答可展开来源、置信度和安全域。

#### Spaces

进入 Work、Plan、Library、Health、Training、Money、Home、Music 的专业轻量界面。复杂低频操作可打开对应 Web Space。

#### Inbox

收纳尚未归位或等待处理的事：Capture 目的地、Needs review、Approvals、Activity；Settings / System 可挂在 Inbox 或 Today 工具栏。

#### Capture（全局动作，非首层 Tab）

统一接收相机、文档扫描、照片、录音、文件、网页分享、截图、收据、房间扫描、物品和状态 check-in。先本地安全持久化，再分类/路由到 Inbox。

#### 原生优先能力

- Share Extension、Files import、Camera、Document Scanner、Photos、Voice。
- Widget / Lock Screen / Controls。
- Focus、Workout、整理计时等 Live Activities。
- Siri、Shortcuts、Action Button via App Intents。
- HealthKit、RoomPlan、Location、Barcode/OCR（按需授权）。

### 4.2 macOS

主窗口可显示完整 Sidebar:

```text
Assistant · Inbox
Work · Plan · Library
Health · Training · Money · Home · Music
System
```

核心原生价值:

- 全局 Command Bar（建议 `⌘⇧Space`）。
- 任意 Space 可打开的 context-aware Assistant side panel。
- Menu Bar: Focus、next event、Quick Capture、approvals、Runtime/Vault/Sync 状态。
- 多窗口、大屏多栏、拖放、Finder/Files、Spotlight。
- 本地 AI Runtime、8TB Vault、embedding/OCR/后台 job 管理。

Mac App 与 Runtime 分离:

```text
Kenos macOS App = UI + permission + approvals + observability
Kenos Runtime   = models + embedding + OCR + heavy jobs + Vault indexing
```

Runtime transport 在 `OPEN-005` 冻结。无论 XPC 还是受保护本地服务，都必须有双向身份校验、最小 capability、job audit、pause/stop、资源使用和错误恢复。

### 4.3 watchOS

首层结构:

```text
Today · Capture · Act · Training
```

适合:

- 看下一件事、日程、Focus、训练和一个最重要提醒。
- 语音 capture、状态 check-in、轻量支出/家庭/工作跟进。
- 完成、延后、标记等待、开始 Focus、批准低风险动作。
- 训练动作、组数、休息、心率和快速替换。

不适合:

- 管理复杂项目或知识库。
- 长文档阅读、完整财务分析和 Home 空间模型。
- 批量编辑或高风险审批。

Watch 不假设 iPhone 实时可达，必须有小型本地缓存、pending queue、WatchConnectivity 和恢复同步。

## 5. 跨平台能力矩阵

| 能力      | iPhone/iPad           | Mac                       | Watch             |
| --------- | --------------------- | ------------------------- | ----------------- |
| Assistant | 完整对话、多模态      | 完整 + 多上下文 + Runtime | 简短语音/回答     |
| Work      | 查看、捕获、轻编辑    | 完整深度工作              | 下一步/提醒       |
| Plan      | 日常使用              | 完整规划                  | 完成/延后         |
| Library   | 阅读、保存            | 完整研究与文件管理        | 默认不展示        |
| Health    | 状态、趋势、HealthKit | 分析、规则、诊断          | 实时记录/check-in |
| Training  | 训练执行              | 计划和分析                | 核心执行端        |
| Money     | 查看、决策            | 完整分析                  | 仅安全提醒        |
| Home      | 扫描、执行            | 布局、资产管理            | 小提醒            |
| Music     | 播放/场景             | 曲库管理                  | 播放控制          |
| System    | 连接摘要              | 完整控制面                | 极简阻塞状态      |

## 6. Action 与 App Intents

跨平台语义由 Kenos Action Contract 定义，App Intents 是 Apple adapter，而不是另一套业务实现。

首批 Actions:

```text
plan.create_task
plan.complete_task
capture.content
assistant.ask
focus.start
health.log_state
training.start_workout
library.save_source
system.approve_action
automation.run
work.open_project
```

同一 action 可由 App 内按钮、Siri、Shortcuts、Widget、Control、Action Button、Watch 或 Assistant 发起。它们必须共享 idempotency、risk、approval 和 Activity 结果。

## 7. 本地数据与同步

### 7.1 每端只保存缓存和待同步操作

| 端          | 本地内容                                                |
| ----------- | ------------------------------------------------------- |
| iPhone/iPad | Today/近期实体缓存、Capture inbox、Outbox、搜索索引子集 |
| Mac         | 完整缓存、Library/Vault 索引、Outbox、Runtime jobs      |
| Watch       | Today/Training 最小快照、pending actions                |

### 7.2 操作路径

```text
user action
  -> validate locally
  -> persist local mutation/outbox
  -> immediate UI state
  -> sync to domain owner
  -> reconcile authoritative version
  -> Activity / conflict / retry state
```

不允许点击后等待网络才反馈，也不允许乐观 UI 在失败后悄悄保留错误状态。

### 7.3 凭据与敏感数据

- token 存 Keychain，不存 plist、UserDefaults 或明文文件。
- HealthKit、照片、相机、位置、麦克风按功能逐项申请，不因 Kenos 综合性而一次索取全部权限。
- `restricted_local_only` 不进入 Supabase 或云端模型。
- Work 数据按公司政策决定本地模型和云同步，默认拒绝。

## 8. Web 与原生的边界

### Web 长期保留

- 复杂表格、深度分析、实验性新领域、跨平台 fallback。
- Design Catalog、Admin/System 深度页、快速产品迭代。
- 现有 Web Spaces 在原生替代通过真实使用 gate 前继续作为生产真源界面。

### 原生优先

- Assistant、Capture、通知、Widgets、Health/Training、Room scan、Share、文件、Local AI、Watch、Focus 和后台动作。

### WebView 规则

- 可作为未迁移复杂功能的临时入口。
- 必须标注 source Space、登录状态、离线限制和返回路径。
- 不允许在 WebView 和 native 同时实现独立写入逻辑。
- 每个 WebView migration entry 有替代条件和 expiry，不成为终局导航默认。

## 9. Mac Runtime 与 Vault

移动端不直接访问 8TB 路径。重型任务流程:

```text
iPhone/Mac UI submits job
  -> Supabase/System queue
  -> Mac Runtime claims with capability
  -> local model/Vault processing
  -> result + provenance written to authorized storage
  -> client receives status/result
```

Mac 离线时，根据 capability 显示:

- 本地轻量结果。
- 云端 fallback（仅 policy 允许）。
- `queued_waiting_for_mac`。

任何状态都不能伪装成成功。

## 10. Spotlight、Files 与扩展顺序

### Core Spotlight

在 Library/Work/Plan 的实体 ID 和 deep link 稳定后，可索引 Project、Task、Document、Decision、Meeting、Person、Home Item 和 Automation。索引是本地搜索投影，不是同步真源。

### File Provider

只有 Library 文件身份、版本、冲突、离线下载和权限模型稳定后才做。当前阶段明确延后，避免把不稳定模型暴露给 Finder/Files。

### Share Extension

优先于 File Provider。它只创建 Capture Envelope，不直接写多个领域表，适合作为第一阶段原生价值验证。

## 11. 迁移旧原生壳的顺序

每个壳逐能力迁移，不按整个 app wholesale 重写:

1. 建立 capability inventory 和数据真源表。
2. 把跨端模型/Action/Sync 抽成稳定契约。
3. Kenos target 实现同一能力，旧壳仍是唯一 writer 或仅作兼容读取。
4. 用真实数据做 parity、离线、权限和恢复验证。
5. 切换 deep link/通知/系统入口到 Kenos。
6. 旧壳进入只读或 redirect。
7. 观察一个明确周期无旧写入。
8. 删除旧 target、权限、后台任务和安装包。
9. 删除兼容层并更新 ledger。

禁止把旧 Tauri/Capacitor 数据目录直接复制到新 App 后同时写入。

## 12. Apple 实施阶段

### A0 Foundation

交付:

- 一个 workspace，iOS/macOS/watchOS targets。
- Shared Models、Auth、API、Keychain、SQLite、Sync Outbox、Deep Link。
- Kenos Action client 与 App Intents adapter。
- Design token 转换和最小组件。
- CI、fixture parity、writer lock 操作约定。

出口标准: 三个 target 使用同一账户，对同一个测试任务完成读取、创建、离线排队、重试去重和 Activity 展示。

### A1 iPhone Companion

交付 Today、Assistant、Spaces、Inbox（含 Approvals/Activity/Capture 目的地）、Reminders、Share Extension、Widget 和通知。Capture 为全局动作而非首层 Tab。先不重写 Money/Home/Work 全页。

### A2 Mac Command Center

交付 Assistant、Command Bar、Menu Bar、Work/Plan/Library、Runtime/Vault/Connections/Activity。首先替代高频 AIOS/Knowledge/Health 控制入口，不急于删除旧壳。

### A3 Watch Companion

交付 Today、Quick Capture、Task actions、Reminders、Focus、Training、Health check-in 和 complications。必须在 Action/Sync 已稳定后开始。

### A4 逐领域原生化

按原生价值排序: Training → Health → Home Capture/Room Scan → Work Capture/Meeting → Plan → Library Reader → Money Decision → Music Controls。复杂低频管理继续走 Web。

## 13. Foundation 验收矩阵

| 场景             | iPhone          | Mac              | Watch         | 预期                            |
| ---------------- | --------------- | ---------------- | ------------- | ------------------------------- |
| 在线创建任务     | 发起            | 可观察           | 可读取        | 仅一个 Plan task，Activity 一条 |
| 离线完成任务     | 排队            | 暂未见           | 发起          | 恢复后一次生效，不重复          |
| 版本冲突         | 可展示          | 可裁决           | 保守失败      | 不静默覆盖                      |
| token 失效       | 重新认证        | 重新认证         | 提示需 iPhone | 队列不丢                        |
| 跨域拒绝         | 拒绝            | 拒绝并解释       | 不展示        | Activity/Audit 有记录           |
| Mac Runtime 离线 | queued/fallback | 明确 unavailable | 不适用        | 不显示假成功                    |
| 删除/高风险      | 强确认          | 强确认           | 不允许        | 备份、影响、审批齐备            |

## 14. 明确不做

- 新建 `kenos-ios`、`kenos-macos`、`kenos-watch` 三个仓库。
- 第一阶段复制全部 Web 导航和页面。
- 用 CloudKit/iCloud 数据库建立第二领域真源。
- 让 App Intents 直接写数据库。
- 在 Watch 上实现复杂管理和高风险批量动作。
- 在统一客户端通过真实使用 gate 前删除现有壳。
- 在 Library/文件冲突模型稳定前做 File Provider。

## 15. 官方参考

- [App Intents](https://developer.apple.com/documentation/appintents): 向 Siri、Shortcuts、Widgets、Controls 等系统入口暴露 App 行为。
- [Human Interface Guidelines - Privacy](https://developer.apple.com/design/human-interface-guidelines/privacy/): 使用系统安全能力、Keychain、最小化敏感访问。
- [Human Interface Guidelines - Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications/): 高价值、简洁、避免重复和敏感内容。
- [HealthKit](https://developer.apple.com/documentation/healthkit): 健康与健身数据及逐项授权。
- [WatchConnectivity](https://developer.apple.com/documentation/watchconnectivity): iPhone 与 Watch 的后台传输和可达性约束。
- [Core Spotlight](https://developer.apple.com/documentation/corespotlight): 设备上的私有内容索引。
