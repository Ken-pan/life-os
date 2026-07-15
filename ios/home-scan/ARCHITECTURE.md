# HomeScan 架构

> 改代码前 5 分钟读完这页;改「同源契约」的东西必须双端同步(见下表)。

## 分层

```
Views(SwiftUI,傻渲染)
  │  只读 AppModel/控制器的 @Observable 状态,动作全是一行方法调用
  ▼
AppModel(@MainActor 状态机 + 职责扩展)
  │  AppModel.swift        —— 全部属性 + 账号/启动(想找状态只看这个文件)
  │  AppModel+ScanFlow     —— 扫描流程(开扫/合并/投影/现实核对/改类别)
  │  AppModel+Pending      —— 落盘与恢复
  │  AppModel+Upload       —— 上传路由与进度
  ▼
Services(有状态控制器 + 纯函数核)
  │  控制器(持 ARSession/Timer,@Observable):
  │    ScanSessionController —— 多房间 RoomPlan 会话、HUD、实时配准、降级
  │    ContainerScanController —— 柜内 AR 打点
  │    ARLocateController   —— 寻物定位(竖直平面当墙)
  │  纯函数核(无 IO,模拟器单测全覆盖):
  │    HomeFrame / ScanIdentity / RealityCheck / EvidenceGuide / ContainerGeometry
  │  本机存储:PendingScanStore / CanonicalHomeCache
  │  IO:SupabaseService(+ScanUploader/+ContainerUploader/+CanonicalHome)
  ▼
Convert(纯管线,CapturedStructure → HomeOS plan px)
     StructureFlattener → FlatScene → PlanProjector → HomeOSModels(契约类型)
```

铁律:

- **纯函数核不 import UIKit/不碰 IO** —— 这是单测能全覆盖的前提。
- **Views 不做业务判断**;判断进 AppModel 或纯函数核。
- **属性只住 AppModel.swift**(extension 不能存属性,别让状态散落)。

## 线程规则

- `AppModel` 整类 `@MainActor`。后台工作(落盘拷照片)用 `Task.detached`
  带**值快照**出去,不捎带 self。
- ARKit 硬约束:**CVPixelBuffer 同刻至多持有 1 个**(池被占 >10 掉帧冻屏)。
  `ObjectShotCapture` 打分在主线程(纯数学),编码走串行 `encodeQueue` +
  `encodeBusy` 单票;改抓拍链路前先读它的头注释。
- RoomPlan/ARSession delegate 回调是 `nonisolated`,回主线程一律
  `Task { @MainActor in ... }`。
- 控制器的 Timer 挂主 RunLoop;`reset()` 必须 invalidate 并清全部派生状态
  (新增状态字段时**同步补 reset**,漏了会串场到下一次扫描)。

## 同源契约(改一处必须同步改另一处)

| iOS | 对应 | 说明 |
|---|---|---|
| `Convert/HomeOSModels.swift` | web `spatial/scan-payload.js` + `apps/home/supabase/README.md` | payload 契约,formatVersion 1,只加可选字段 |
| `Services/HomeFrame.swift` | web `spatial/scan-register.js` | 墙体配准:常数/验收门/精修逐行对应(单位 米 vs px) |
| `Services/ScanIdentity.swift` | web `spatial/scan-identity.js` | 跨扫描身份:打分/同族/歧义边距逐行对应 |
| `Services/ContainerGeometry.swift` 的 Payload | `apps/home/supabase/README.md` 柜内节 | 桶内 JSON 契约 |
| `Config.swift` | `packages/sync/src/supabaseClient.js` | Supabase URL/key |

## 数据流(一次全屋扫描)

```
RoomPlan 逐房(共享 ARSession) ─合并→ CapturedStructure
  ├ 抓拍:ObjectShotCapture(方位桶/清晰度门控/12MP 高清帧)
  ├ 机位:AutoViewpointCapture(稳/亮/新颖自动快门)
  └ 实时:HomeFrame 配准(2s 节流)→ HUD 徽标 + 漏扫房间
StructureFlattener → FlatScene(米,含 elevM)
PlanProjector → HomeOSProject(plan px)+ 证据包裁剪(大3/中2/小1)
RealityCheck(配准+身份)→ 认出换真名/新发现/没扫到
PendingScanStore.save(先落盘,后上传 —— 断网被杀不丢)
ScanUploader(3 路并发,桶清单续传,photos 全成才写 scans 行)
```

## 测试策略

- 纯函数核 = 单测主场(`HomeScanTests/`,模拟器跑):几何、配准、身份、
  落盘 roundtrip。**新逻辑先问一句「能不能做成纯函数」**,能就能测。
- Mock 链路:`MockScan.scene()` 走 转换→现实核对→预览→落盘 全链(DEBUG)。
- 真机专项(模拟器测不了):RoomPlan 取景、平面检测手感、触感/语音、
  发热降级 —— 见 README「真机 QA 清单」。
- 跑法:`xcodebuild -scheme HomeScan -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test`

## 加新能力的清单

1. 新 payload 字段?→ 可选字段 + HomeOSModels/scan-payload.js/supabase README 三处同步。
2. 新扫描期逻辑?→ 纯函数核先行(可测),控制器只做接线;记得 `reset()`。
3. 新 UI 状态?→ 属性进 AppModel.swift 对应分组,方法进对应 +扩展文件。
4. 新后台工作?→ 值快照 + Task.detached;绝不在后台碰 @Observable 属性。
5. 上传新文件?→ 确定性定名(断点续传靠同名跳过),进 ScanUploader 的作业单。
