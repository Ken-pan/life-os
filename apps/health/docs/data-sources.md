# HealthOS 数据源接入(macOS)

HealthOS 的目标是「尽量自动感知,不要求你手填所有内容」。但 **macOS 上能拿到的健康信号和 iOS 完全不是一回事**——这份文档诚实梳理每条路径的可行性、门槛和当前状态,避免过度承诺。

## 关键现实:Mac 上没有 HealthKit

`HealthKit` 是 iOS / watchOS 独占框架,**macOS 从不支持第三方访问**([Apple 开发者论坛确认](https://developer.apple.com/forums/thread/94937))。所以 Mac 上拿 Apple Health 数据只有三条路:

1. **导出 XML 导入**(已实现)—— iOS「健康」导出 `export.xml`,离线解析。**唯一无需额外权限、当天可用的现实路径。**
2. iOS 伴侣 app + HealthKit + 设备间同步 —— 需要单独维护一个 iOS app,体验割裂,暂不做。
3. 向 Apple 提 enhancement request —— 不指望。

## 连接器分层(按可行性)

| 数据源 | 拿到什么 | 可行性 | 门槛 | 状态 |
| --- | --- | --- | --- | --- |
| **Focus 代理** | AI 工具 CPU / 前台 app / 键鼠空闲 | ✅ 原生 | 无(本机进程) | 已上线(HLT-1) |
| **系统睡眠/唤醒** | 合盖休息 → 计时清零 | ✅ 原生 | 无(NSWorkspace 通知) | 已上线 |
| **Apple Health 导出** | 睡眠时长 / 静息心率 / HRV / 步数 | ✅ 离线 | 手动导出一次 | **已上线(本次)** |
| **Screen Time(knowledgeC.db)** | 全设备 app 使用时长(含 iOS/iPad,经 iCloud 同步) | ⚠️ 可读 | **需授予 Full Disk Access** | 规划中 |
| **Calendar(EventKit)** | 会议负荷 / 下一场会议 → Recovery/Stress | ⚠️ 原生 API | 需 app bundle + entitlement + TCC 授权 | 规划中 |
| **系统信号** | 电量 / 显示器亮灭 / Now Playing | ✅ 原生 | 部分需轮询 | 规划中 |
| **HomeOS 环境** | 室温 / 噪音 / 光线 | ✅ 经 contracts 事件 | 跨 OS 事件契约 | 规划中(HLT-4+) |

## 已实现:Apple Health 导出导入

**导出**:iPhone「健康」app → 右上角头像 → 最下方「导出所有健康数据」→ 得到 `export.zip`,解压出 `export.xml`,拷到 Mac。

**导入**(离线,无需守护进程在跑):

```bash
"$HOME/Library/Application Support/HealthOS/bin/healthos-focus-agent" \
  --import-health ~/Downloads/apple_health_export/export.xml
```

`FocusAgent.swift` 的 `HealthExportDelegate` 用 `XMLParser`(SAX)流式解析——`export.xml` 常有几十万到上百万条 `<Record>`,不建 DOM,内存恒定。抽取近 30 天:

- **睡眠**:`HKCategoryTypeIdentifierSleepAnalysis` 里 `Asleep*` 段(不含 InBed/Awake),按「醒来日 ≈ 入睡 + 6 小时的日期」聚合成每晚小时数。
- **静息心率 / HRV(SDNN) / 步数**:按天聚合。

结果写 `~/Library/Application Support/HealthOS/health.jsonl`,经代理 `GET /health` 端点供 web 消费。State Engine 把测量睡眠**按日覆盖手动记录**(`recentSleeps` 去重,`source:'health'` 优先),睡眠债/身体准备度维度因此从「手动」升级为「Apple Health 测量」。

> 更新方法:重新导出 → 重跑 `--import-health`(整文件覆盖,幂等)。可后续做成 launchd 定时 + iCloud Drive 里放 export.xml 自动重扫。

## 规划中连接器

### Screen Time / knowledgeC.db
`~/Library/Application Support/Knowledge/knowledgeC.db`(SQLite)的 `ZOBJECT` 表 `/app/usage` 流记录全设备 app 使用,**含 iCloud 同步来的 iOS/iPadOS 数据**——这是 Mac 上少有的能看到「手机上刷了多久」的入口。时间戳是 Cocoa 纪元(+978307200 转 Unix)。**门槛**:读它需要给读取进程授予 Full Disk Access(TCC),代理是裸编译二进制、非 app bundle,授权体验不理想,需先做一个带 bundle 的读取 helper。

### Calendar / EventKit
`EventKit` 在 macOS 原生可用,能读会议 → 推导 Recovery/Stress 负荷、下一场会议距离。**门槛**:需要 app bundle + `NSCalendarsUsageDescription` + 首次 TCC 授权弹窗;同样受「代理非 bundle」限制,宜由 Tauri 壳侧(HealthOS.app 有 bundle + Info.plist)承接,再经 IPC/端点喂给状态引擎。

## 隐私原则(全数据源通用)

- **本地优先**:原始健康数据只落在 `~/Library/Application Support/HealthOS/`,不自动上云。
- **Raw ≠ Interpretation ≠ Recommendation**:代理只落原始观察(health.jsonl / events.jsonl),推导和建议在 State Engine;算法迭代不污染原始数据。
- **最小暴露**:未来其他 OS 经 contracts 事件只拿结果(如 `focus_capacity=reduced`),不直读健康明细。
- **可关断**:每个连接器都应能单独关闭;导入数据可删(删对应 jsonl 即可)。
