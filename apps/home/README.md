# Home OS（实验）

**URL：** [home.kenos.space](https://home.kenos.space) · **Workspace：** `home-os` · **数据：** `localStorage` key `homeos_spatial_v1`（暂无云同步）

居家空间 **平面浏览/编辑** + **储藏清单**（S1–S8）。Life OS SSO ✅；Portal 实验卡 ✅。

## 快速开始

```bash
cd apps/home
npm install          #  monorepo 根目录 npm install 亦可
npm run dev          # http://127.0.0.1:5173 默认；QA 常用 5874（launch.json 的 "home"）
npm run build
npm run check
```

## 路由

| 路径 | 用途 |
|------|------|
| `/` | 概览 |
| `/plan` | 顶视平面 · 浏览 / 编辑 |
| `/storage` | 储藏区清单 · **物品搜索/增删改/移动** · 支持 `?zone=S3` 深链 |
| `/settings` | 账号 · 外观 · **户型编辑模式**（508 ↔ 墙图） |

## 平面编辑：两种模式

| 模式 | 说明 | 编辑方式 |
|------|------|----------|
| **508 参数** | 默认 · Avalon #508 参数化 | 拖内墙/门窗；Delete 软隐藏门窗 |
| **墙图** | 设置页一次性转换 | 左侧工具面板选工具，直接在画布上画 |

墙图模式下 **门窗** 挂在墙边（`graphOpenings[]`，英寸 `offsetIn`/`spanIn`），移墙跟墙走、删墙级联删开口（toast 可撤销）。

### 工具面板（`PlanEditToolbar.svelte`）

**一个面板管全部**，桌面竖排在画布左侧、手机横排在左上角 —— 同一份工具、同一套标签。
按工作流顺序分组（结构 → 划分 → 布置 → 记录），分组线即引导；数字键 `1`–`7` 对应从上到下。

| 键 | 工具 | 工具选项（面板旁的上下文条） |
|----|------|------|
| `1` | 选择 | 选哪一层：墙体 / 分区 / 家具 / 机位 |
| `2` | 建墙 | 起链后可输精确长度（直接敲数字即开始输入） |
| `3` | 门窗 | 门 / 窗 |
| `4` | 画区 | 自动识别房间 |
| `5` | 家具 | 类型选择器（7 组 54 类，弹窗） |
| `6` | 标储藏 | — |
| `7` | 视角 | 批量导入 · 北向校准 |

设计约束（改动前请先读）：

- **`activeTool` 是唯一真源**，`editStep` / `graphTool` / `zoneTool` / `placementTool` / `viewpointTool` 全部由它 `$derived`，**不允许直接赋值** —— 否则又会出现两个控件对「当前工具是什么」各执一词。
- **没有「删墙 / 删区」这类常驻删除模式**：一律 选择 → 点中 → `Delete` 或选中条的「删除」。
- **顶栏永远只有一行**：工具选项挂在面板旁，不进页头 —— 页头一长高，画布就跟着缩，切工具时视口会跳。
- **破坏性操作（清空户型）只在「详情」抽屉的「危险操作」区**，不进工具面板。

## ④ 视角：把实拍照片钉到平面图上

标注「这张照片是站在哪、朝哪拍的」。平面上是**一个点 + 朝向 + 视锥扇形**（`viewpoints[]`）。
放机位 → 拖圆点改位置 → 拖手柄转朝向 → 选中后拍照/挂图。

**照片存 IndexedDB（`homeos_photos`），永不上传。** `homeos_spatial_v1` 里只留 `photoRef` 字符串 ——
localStorage 装不下 blob（5MB 配额），且家里内景不该离开本机。代价：换设备照片不跟随。
存入时长边降采样到 2048、转 JPEG。**EXIF 必须在降采样之前读** —— canvas 重编码会把元数据全丢掉。
删视角**不删** blob（撤销要能找回），孤儿由 `pruneViewpointPhotos()` 回收。

`openDb()` 带 `onblocked` + 8s 超时：IndexedDB 被别的标签页占住时 `indexedDB.open`
**永不 resolve**，没有这两道会静默挂死、UI 停在「存入中…」。失败的 `dbPromise` 也必须清出缓存，
否则一次失败会永久毒化后续每一次调用。

### 三个自动化助手，可信度天差地别

| 来源 | 给什么 | 可信吗 |
|------|--------|--------|
| **EXIF**（[`photo-exif.js`](src/lib/photo-exif.js)） | 视锥张角、拍摄时间、机型 | ✅ 张角由 35mm 等效焦距精确算出；时间按 `OffsetTimeOriginal` 还原拍摄地时区 |
| **EXIF / 手机罗盘**（[`compass.js`](src/lib/compass.js)） | 朝向（兜底） | ⚠️ **室内罗盘受钢结构/家电磁铁干扰，偏 20–40° 常见**。仅作初值，UI 标「朝向粗估」，必须人工确认 |
| **本机 VLM**（[`vlm.js`](src/lib/vlm.js)） | 分区 · **位置** · **朝向** · 状态 | ✅ 实测 qwen3-vl-8b：识别 ~1.2s/张、定框 ~0.7s/件；认不出会老实拒答（不瞎猜）；把握 <0.5 只提示不动机位 |

### 定位精度：能到分米，**到不了厘米**

三档降级，实测数字（`test:localize` 会打印，改动后会自己报警）：

| 档 | `headingSource` | 位置误差 | 朝向误差 | 触发条件 |
|----|----|----|----|----|
| **三边定位** | `solved` | **~17–32cm** | **~3°** | 分区认准 + 该区 **≥2 件固定设施**被认出框 |
| 锚点定朝向 | `anchor` | 分区中心（米级） | 较准 | 只认出画面正中一件固定设施 |
| EXIF/罗盘 | `exif`/`compass` | 分区中心 | **偏 20–40°** | 兜底 |

**厘米级做不到，原因不在算法在输入**（`test:localize` 逐项量过）：

| 只注入这一项误差 | 位置误差 |
|---|---|
| 无（只考验算法） | **0.02cm** ← 算法本身是精确的 |
| VLM 框宽误差（实测 1.9–5%） | 11.3cm |
| **设施尺寸与目录差 5%** | **13.9cm** ← 最大单项 |
| 实测叠加 | **31.7cm** / 7.2° |
| 若设施尺寸已实测录入 | **11.3cm / 1.75°** ← 本方法下限 |

所以：**想更准就去量固定设施**（灶台/水槽/冰箱位的实际宽深），32cm → 11cm。
再往下要靠拍摄当下的 ARKit 位姿，事后从一张照片拿不回来 ——
学术界 SOTA（[F³Loc](https://openaccess.thecvf.com/content/CVPR2024/papers/Chen_F3Loc_Fusion_and_Filtering_for_Floorplan_Localization_CVPR_2024_paper.pdf) / [LASER](https://arxiv.org/pdf/2204.00157)）单图平面图定位也在**分米–米级**。

⚠️ **`fixResidual` 不能当唯一可信度**：系统性尺寸偏差（所有家具都按目录、都偏同一方向）会解出
「自洽但整体偏移」的答案，残差反而很小。实测 D 档残差 2.09cm 而真实误差 31.7cm。

### ⚠️ 定位基准只能是 `fixtures[]`，绝不能是 `placements[]`

这是正确性红线，不是偏好。

| | 是什么 | 能当基准吗 |
|---|---|---|
| `fixtures[]` | 户型自带：灶台/水槽/冰箱位/马桶/洗手台/淋浴/洗衣机… `types.js` 明写 **cannot be dragged** | ✅ |
| `placements[]` | 用户随手摆的家具：床/沙发/桌/椅… 随时会挪 | ❌ |

拿可移动家具当基准 = 把坐标系建在会跑的东西上。**你挪一次沙发，所有以它为基准的机位就全错，
而且平面图上看不出任何异常** —— 静默失准比不定位更糟，因为你不知道该重算。

`fixtures` 没有 `zoneId`（它们比分区更早存在），所以 `anchorsByZone()` 按中心点落在哪个多边形里归属。
508 户型自带 11 件，厨房区内就有 4 件（洗碗机/水槽/灶台/冰箱），够三边定位。

⚠️ fixtures 是**按 508 原始布局摆的**（`wall-graph.js`：「ride along unchanged」）。
墙图模式下大改过墙的话，fixtures 不会跟着走 —— 那时它们作为基准也就不可信了。

### 三边定位怎么做的（`spatial/localize.js`）

固定设施的**真实尺寸和平面坐标都是已知的**（`fixtures[]`）。VLM 给出它在画面里的框后：
- 框中心横向偏移 → 相对光轴的**方位偏角**（实测框中心误差仅 1–4px/1024，**方位角几乎无损**）
- 框宽 → 张角 → **距离** `d = f_px · W_轮廓 / w_px`

两件家具的两个距离交出机位，朝向随之而出。

⚠️ **必须算轮廓宽**（`apparentWidth`）：家具是有朝向的矩形，正对看是 `w`、侧对是 `h`。
不算这步，斜看的冰箱会被当成"更窄→更远"，距离直接错几十厘米。而轮廓宽又依赖视线方向、
视线方向又依赖机位 —— 互相依赖，所以**迭代**（实测 3 轮内收敛）。

⚠️ **必须一件一问框**。实测让 qwen3-vl-8b「一次返回所有物体的 JSON 数组」会被截断、格式崩坏；
逐件问稳定，约 700ms/件。

### 朝向：靠家具锚点几何解，不靠罗盘

室内罗盘不可用是这个功能最大的痛点。**VLM 能认出「画面正中是冰箱」，而冰箱在平面图上的
坐标是已知的（`fixtures[]`）** —— 于是朝向可以纯几何解出来：

```
heading = 机位 → 该家具中心的方向        // headingSource: 'anchor'
```

**完全不经罗盘。** 实测：机位在厨房中心 (240,240)、冰箱在 (400,240) 正右 → 解出精确 **90°**。
`describeScene()` 一次调用同时返回分区 + 锚点 + 状态（省一轮推理）；锚点必须落在它自己判定的
那个分区里，否则自相矛盾，丢弃。

⚠️ **距离守卫**（`ANCHOR_MIN_SEPARATION_FT = 2ft`）：机位离锚点太近时，「指向它」的方向是噪声——
差 2px 就能翻 180°。分区中心恰好落在大件家具上（床占半个卧室）时就是这种情况，实测机位与床心
只差 10px，此时**宁可不定朝向**。`test:viewpoint` 里有这条的噪声演示。

### 状态标注：每块地方是什么样

VLM 同时给出 `state`（**整洁/一般/杂乱/堆满/空置**，枚举——自由文本没法聚合）、一句话
`note`、`items[]`。平面图上机位右上角挂一个**状态色点**（整洁→堆满 由冷到暖），扫一眼全图就知道
哪块该收拾了，不用逐个点开。选中条里显示徽章 + 描述。

### 批量导入（流水线）

「④ 视角」工具栏 →「批量导入」，一次丢 N 张。**解码在 worker（CPU）、VLM 在本机网关（另一进程），
两者不抢资源**，所以第 n 张跑 VLM 的同时就解第 n+1 张。串行是 N×(解码+识别)，流水线是
N×max(解码,识别)。实测 3 张 2.4s。机位先按序号排开，识别成功的挪进对应分区，识别不了的留在
原地等人拖 —— 不会凭空消失。

⚠️ **竖拍陷阱**：同一颗镜头，竖构图的水平张角远窄于横构图（4:3 主摄 f35=26：横 67°、竖 53°）。
照抄一个「横拍公式」会让每张竖拍都宽出三成。

⚠️ **iPhone 竖拍不能靠比像素判断**。真机竖拍的像素维度**仍是传感器横向**（4032×3024），
靠 `Orientation=6` 表示要转 90°。只比 `h > w` 会把每一张竖拍都判成横拍。
更阴的是 exifr **默认把 Orientation 翻译成字符串**（`6` → `'Rotate 90 CW'`），
数值判断静默失效 —— 所以 `EXIF_OPTS` 里的 `translateValues: false` 是**必须的，不是优化**，
`orientationSwapsAxes()` 还额外兼容字符串形态兜底。`test:viewpoint` 里两道都有覆盖
（去掉任一仍绿，同时去掉则 3 条红）。

### 张角：等对角模型（`horizontalFovDeg` / `refineFovDeg`）

`FocalLengthIn35mmFilm` 的定义是「在 36×24 画幅上给出**相同对角视角**的焦距」。
所以只要 **f35 + 交付画幅宽高比**：

```
hFov = 2·atan( (43.267·a / √(a²+1)) / (2·f35) )      a = 交付宽/高
```

**不需要传感器尺寸、不需要 Orientation、也不需要判断裁没裁。** 重采样也不影响（只用比例）。

⚠️ **Apple 按交付画幅重算 f35。** 同一颗超广角：4:3 出图 f35=13（对角 120°，官方宣传值），
相机设成 16:9 拍则 **f35=14**（对角 115.7°）—— 实测真机照片正是 14。所以 f35 **已经把画幅算进去了**，
再按传感器像素比做「裁剪修正」会**重复扣一次**（我踩过这个坑）。
自洽性检查：3:2 画幅代入本式得 `2·atan(18/f35)`，与经典 36mm 公式完全一致。

⚠️ **`ExifImageWidth/Height` 是「原始采集」尺寸，和交付图可能对不上。**
真机实测：交付 **3213×5712（竖）**，EXIF 仍写 **5712×4284（横）+ Orientation=1**。
只信 EXIF 会判成横拍给 104°，真值 **74°**。所以张角在 `attachViewpointPhoto` 里用
`putPhoto` 回传的 `sourceWidth/Height`（**降采样前的真实解码尺寸**）经 `refineFovDeg` 重算；
`readPhotoHints` 里那个只是解码前的 EXIF 初值。合成夹具造不出这个，是真实照片暴露的。

### HEIC（iPhone 默认格式）

**Chrome/Firefox 原生解不了 HEIC**（`createImageBitmap` 抛 `InvalidStateError`，WebCodecs 也不支持；
Safari 可以）。从 iPhone 直接上传没问题（iOS 会自动转 JPEG），但 AirDrop 到 Mac 再用 Chrome 传
就是原始 HEIC。

- 解码走 **[`heic-to`](https://www.npmjs.com/package/heic-to)（libheif wasm，2.9MB，LGPL-3.0）**，
  且**只在检测到 HEIC 时 `import('heic-to')` 动态加载** —— 已验证它被打成独立 chunk、
  首页/plan 页均不预加载，传 JPEG 的人一个字节都不下载。
- **解码 + 缩放都在 Web Worker 里**（[`photo-decode-worker.js`](src/lib/photo-decode-worker.js)，
  OffscreenCanvas 出图）。实测 5712×3213 一张：主线程 **2488ms**、worker **1470ms**（各预热后 3 次均值），
  **快 1.7×**，主线程长任务 35ms → **0**。worker 里的 `import('heic-to')` 也必须留在函数内，
  提到顶层会让 wasm 变成 worker 的静态依赖。不支持 OffscreenCanvas 时回落主线程，
  **回落会 `console.warn`** —— 静默回落等于把性能回归藏起来。
- 识别走**魔数**（`ftyp` + brand）不看 MIME：Chrome 对 .heic 常给空 `type`。
- ⚠️ **HEIC 必须重编码，哪怕它小于 `MAX_EDGE_PX`**。`downscale` 里是否重编码由 `mustReencode`
  语义（`needsResize || heic`）决定、**不由尺寸决定** —— 早先「小图原样返回」的短路会把小 HEIC
  原样存回，Chrome 照样显示不了。三处 `return file` 的兜底同理都要拦住 HEIC。
- 解不开就**抛 `PhotoDecodeError`，绝不原样存回** —— 存回只会得到一张永远裂着的缩略图，
  而用户以为标注好了。
- EXIF **能穿过 HEIC 容器读出来**（exifr 支持），所以哪怕图要转码，标注数据仍是准的。
  `test:viewpoint` 里有一张真 HEIC 夹具（`fixtures/iphone-portrait.heic`，sips 造）守这条。

⚠️ **高频输入绝不能直连 store**。`updateViewpoint` → `applyEditSource` 会**无条件 `pushGraphUndo`**，
而罗盘 ~60Hz、滑杆 `oninput` 更密：实测直连 1 秒就把撤销栈从 5 顶到 24（撑满）、写进 118KB，
并烧掉 137ms/s 做全量 hydrate + 落盘 —— 用户真实编辑的历史一秒内被冲光。
罗盘与 FOV 滑杆因此走 **`onPreview` 预览通道**（只画 `previewViewpoints`，不碰 store），
松手才提交一次。旁边的 `PlanPlacementSelectionBar` 是用 `onchange`（而非 `oninput`）躲开同一个坑。
`test:viewpoint-ui` 专门守这条。

### 北向校准（EXIF/罗盘朝向的前提）

平面图的「上」≠ 真北。未校准时 EXIF 朝向和罗盘按钮都是死的（工具栏显示「北向 !」）。
校准值存 `meta.planNorthDeg`，**不进撤销栈** —— 它是相机与世界的对齐参数，不是户型几何。

### 手机上用（推荐姿势）

拿着手机在家走一圈边拍边标最顺。**必须连 `dev` 而不是 `preview`** —— VLM 代理只在 vite dev 里：

```bash
npm run dev:lan          # 0.0.0.0，手机连 http://<Mac 局域网 IP>:5173/plan
```

local-ai 网关（`127.0.0.1:18888`）只绑回环，手机直连不到；`vite.config.js` 的 `/upstream/vlm`
代理把请求经 Mac 转过去，所以手机也能用「认房间」。生产是静态站，该路径 404 → 按钮自动隐藏（`probeVlm()`）。
注意 `dev:lan` 会让同局域网的任何设备都能经这个代理打到你的本机 VLM。

### 编辑 UX 要点（2026-07-08）

- 墙图编辑色：`--graph-accent`（`app.css`）
- 手机编辑：**immersive**（收起 bottom nav + 隐藏 AppBar 副标题）
- 选中条：墙图 / 508 均在手机端 compact 底栏
- 删墙：橙色级联高亮 + 8s「撤销」toast
- 帮助：`?` · `PlanShortcutsHelp`（墙图/508 分支 · ⌘/Ctrl 自适应）

## 数据模型

```text
SpatialProject
├── layoutMode: 'parametric508' | 'wallGraph'
├── layoutConfig?          # 508 参数（安全气囊）
├── wallGraph?             # 顶点/边 SSOT
├── graphOpenings[]        # 挂边门窗
├── zones[]                # 手绘分区（polygon + stale）
├── placements[]           # 矩形家具（8 类）
├── storageZones[]         # S1–S8 · 可 zoneId/placementId 指派
│   └── items[]            # v4：实体 { id, name, qty?, tags?, note?, updatedAt }
├── viewpoints[]           # 照片机位 { x, y, heading, fovDeg, photoRef, zoneId?,
│                        #   headingSource:'manual|exif|compass|anchor', anchorId?,
│                        #   state?（整洁/一般/杂乱/堆满/空置）, items?, note? }
├── meta.planNorthDeg?     # 平面图上方对应的真实方位角（校准值，不进撤销栈）
└── rooms/walls/openings…  # hydrate 派生，勿手编
```

> ⚠️ **加字段必改三处白名单**，漏一处就会被 ⌘Z 吃掉：
> [`applyEditSource`](src/lib/state.svelte.js) / [`snapshotEditSource`](src/lib/state.svelte.js) /
> [`buildFromWallGraph`](src/lib/spatial/wall-graph.js)（外加 [`model.js`](src/lib/spatial/model.js) 的 508 分支）。
> 这四处都是**显式字段列举**，不是展开继承。另外 `parseEditSnapshot` 要给老快照补默认值，
> 否则 `?? raw.x` 会把当前值带回来、撤销永远撤不动。挂在 `meta` 上的字段则自动随 carry 走。

### 储藏物品（v4 起）

v3 的 `items: string[]` 在 hydrate 时**自动迁移**为实体（[`storage-items.js`](src/lib/spatial/storage-items.js)），无需手动升级存档。迁移不看 `schemaVersion`，只按形状归一，所以对后续版本自动兼容：

- 迁移 id 由 `zoneId + 下标` 推导（`s7-i0`），**确定且幂等** —— `hydrateProject` 每次 `getActiveProject()` 都跑，随机 id 会让 `{#each}` key 每帧抖动
- **数据已干净时 `normalizeStorageItems` 原样返回入参数组**（不重建）。它在 hydrate 里，重建会让 hydrate 随物品数劣化：实测 5000 件时占 hydrate 的 97%。因此它**不再推进 id 计数器**（快路径会跳过扫描）——`createStorageItem` 之前必须先 `syncStorageItemIdSeq()`，否则新装载的模块会把 `si-1` 发到已有的 `si-1` 上。同区内 id 撞车会**直接崩** Svelte 的 keyed `{#each}`，慢路径遇到重复 id 会重新发号
- 新物品走 `si-N` 序号（同 `placements.js` 的 `pl-N` 约定）
- `qty ≤ 1` 归一为 `undefined`（UI 只在 >1 时显示 `×N`）；上限 9999，挡住 `1e9` 撑爆版面
- 搜索结果列表上限 `MAX_SEARCH_HITS`（100），但 `total` 会如实告诉用户「还有 N 个未显示」，`zoneCodes` 覆盖全部命中所以区筛选不受上限影响

**为什么不再往下优化：** 剩余成本是穿过 `$state` 深代理读属性（实测代理让同一份扫描慢 **14.2×**：1000 件 0.107ms → 1.53ms）。加 WeakSet 缓存能抹掉它，但只要有人原地改数组就会读到脏缓存 → item 无 id → keyed `{#each}` 崩。真实规模（31 件）下 normalize 约 0.05ms，**不值得拿健壮性换**。同理，把 normalize 移出 hydrate 只在 `load()` 跑也能省，但迁移就不再是「任何入口都自动生效」。

⚠️ 储物 CRUD 走 `updateStorageZones()`，**不要复用 `applyEditSource()`** —— 后者硬编码 `layoutMode: 'wallGraph'`，会让 508 模式下改个物品就把户型 SSOT 翻掉。`test:storage-ui` 里有一条专门守这个回归。

⚠️ 组件 `<style>` 里**不能用 `@media (--life-os-phone)`** —— Svelte 单独过 PostCSS，看不到 `layout.css` `@import` 进来的 `@custom-media` 定义，会原样输出被浏览器整块忽略（`check`/`build` 不报错）。写字面值 `(max-width: 599px)`。

持久化 key 不变（`homeos_spatial_v1`）；undo 栈 key `homeos_wall_graph_undo_v1`（编辑源快照 JSON）。

## 验收命令

```bash
npm run test:storage       # 储藏物品实体 / 迁移 / 搜索单测（无需 server）
npm run test:storage-ui    # /storage smoke（20 checks：v3 迁移 / CRUD / 搜索定位 / 手机触摸目标 / 打字不写 store）
npm run test:viewpoint     # 视角/锚点几何 + iPhone EXIF/HEIC/等对角张角模型单测（81 checks，无需 server）
npm run test:localize      # 三边定位精度实测（19 checks，会打印各误差源贡献多少厘米）
npm run test:viewpoint-ui  # 视角 smoke（14 checks：罗盘/滑杆不得直连 store）
npm run test:viewport      # 508 模式定位回归（49 checks）
npm run test:plan-edit     # 墙图 smoke（墙/门窗/分区/储藏）—— ⚠️ 见下
node scripts/qa-ui-screenshots.mjs   # UI/UX 截图（可选）
```

⚠️ 写 Playwright 时**不要**在 `page.evaluate` 里 `import('/src/lib/state.svelte.js')` 读写状态 ——
那拿到的是与组件不同的模块实例（`S` 是空的），测试会读到平行宇宙、给出假的红/绿。
只点真实 UI，只从 localStorage 读真值（`viewpoint-smoke.mjs` / `plan-edit-smoke.mjs` 是范本）。

需 server 的脚本默认连 `127.0.0.1:5197`，但**该端口现在归 aios**，要显式传地址：
`node scripts/plan-viewport-stress.mjs http://127.0.0.1:5874`。
另外 vite **冷启动首跑会假性失败**（500ms 等待不够编译），server 跑热后再测。

⚠️ `test:plan-edit` 目前在 HEAD 上就是红的：它在 1280px 桌面视口等一个「删墙」按钮，
而该按钮只存在于手机端 compact select（`max-width:599px`）。测试与 UI 长期不同步，非回归。

## 文档

| 文档 | 用途 |
|------|------|
| [`docs/roadmap/apps/home-spatial-editor.md`](../../docs/roadmap/apps/home-spatial-editor.md) | HOME.SPATIAL.0–W5 执行方案 |
| [`docs/roadmap/apps/home.md`](../../docs/roadmap/apps/home.md) | App 排期 |
| [`docs/qa/home-spatial-editor-audit-2026-07-08.md`](../../docs/qa/home-spatial-editor-audit-2026-07-08.md) | 功能验收 |
| [`docs/qa/home-spatial-uiux-audit-2026-07-08.md`](../../docs/qa/home-spatial-uiux-audit-2026-07-08.md) | UI/UX 审核（Wave A/B/C） |
| [`docs/qa/home-storage-audit-2026-07-14.md`](../../docs/qa/home-storage-audit-2026-07-14.md) | 储藏功能 + UI/UX 验收（HOME.STORAGE.19） |

**当前进度（2026-07-14）：** HOME.SPATIAL.0–W5 ✅ · Wave A/B/C UX ✅ · 四步编辑器（墙体/划分/布置/**视角**）已发货
