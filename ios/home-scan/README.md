# HomeScan — HomeOS 的 iOS 扫描伴侣应用

用 iPhone Pro（LiDAR）+ Apple RoomPlan 扫描全屋：墙体、门窗、家具及**真实尺寸**，
外加拍照机位（ARKit 位姿）。扫描在设备端转换成 HomeOS plan-px 格式后上传
Supabase（`home.scans` + 私有桶 `home-scan-photos`），在 HomeOS 网页版
（home.kenos.space → 设置 → 云端扫描）拉取并替换当前户型。

本目录在 npm workspaces / turbo 之外，是独立的 Xcode 工程。

## 构建

```bash
cd ios/home-scan
xcodegen generate          # 生成 HomeScan.xcodeproj(不入库)
open HomeScan.xcodeproj    # 或 xcodebuild -scheme HomeScan -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

- 依赖：xcodegen（`brew install xcodegen`）、Xcode 26+，SPM 自动拉 supabase-swift。
- 真机部署：Signing & Capabilities 里选自己的 Team。RoomPlan **只能真机跑**
  （带 LiDAR 的 Pro 机型）；模拟器里「开始扫描」置灰，用 Mock 模式测转换/上传链路。

## 结构

| 路径 | 职责 |
|---|---|
| `HomeScan/Config.swift` | Supabase URL/key（与 `packages/sync/src/supabaseClient.js` 同源）、payload 契约版本 |
| `HomeScan/Services/SupabaseService.swift` | 登录、`home.scans` 读写、Storage 上传 |
| `HomeScan/Services/ScanSessionController.swift` | 共享 ARSession + 逐房 RoomCaptureSession + StructureBuilder 合并 |
| `HomeScan/Services/ViewpointCapture.swift` | 扫描中拍照：ARFrame 位姿 + JPEG（≤2048px） |
| `HomeScan/Services/AutoViewpointCapture.swift` | 机位自动拍照：视角稳/看得全/够新颖就自己拍（每间 ≤4 张），拍不上给站位引导 —— 扫描无脑化 |
| `HomeScan/Services/ObjectShotCapture.swift` | 家具自动抓拍：2Hz 给每件家具的当前视角打分（全身入画/占幅/居中/不甩动），最佳帧裁图 + k-means 提主色 |
| `HomeScan/Convert/` | CapturedStructure → HomeOS plan-px（契约见 `apps/home/supabase/README.md`）；iOS 17 样式属性 → 细分 kind/attrs |
| `HomeScan/Views/` | 登录 / 主页 / 扫描 / 预览 / 上传 |
| `HomeScan/Mock/` | 模拟器 mock 扫描（fixture 走全链路） |

## 数据流

```
RoomPlan 逐房扫描(共享 ARSession) ──合并──▶ CapturedStructure
    │ 拍照快门: ARFrame transform + intrinsics + JPEG
    │ 家具自动抓拍: 2Hz 打分挑最佳帧 → 每件家具一张裁剪图 + 主色
    ▼
Convert/ ──▶ HomeOS partial project(plan px, pxPerFt=36, y 向下)
    │        placement/fixture 带 attrs(样式/实测高/置信度/主色)
    ▼
上传: 机位照片 {uuid}.jpg + 家具图 obj-{id}.jpg → structure.json → home.scans 行(最后)
    ▼
HomeOS 网页 设置 → 云端扫描 → 拉取(照片落 IndexedDB,重铸 photoRef;
选中家具可看实拍图/样式/颜色,本地 VLM 可再「识别外观」补材质颜色)
```

## 真机 QA 清单

1. 扫 2 个房间 + 走廊，每房 ≥3 张机位照片
2. 预览页：门窗位置、家具、尺寸与现实比对
3. 上传后在网页端拉取：墙体/分区/家具/机位渲染、照片可打开、朝向正确
4. 实测一面墙，与平面图尺寸对比（预期 ±2 英寸）
5. 家具自动抓拍：扫描 HUD 的「N 件家具照」应随扫描增长；上传后网页端
   选中家具能看到实拍缩略图、主色点、样式（L形沙发/茶几/转椅…）与实测高；
   本地 VLM 在线时「识别外观」能补出材质/颜色人话
