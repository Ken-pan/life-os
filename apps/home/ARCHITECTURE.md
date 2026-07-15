# HomeOS 网页端架构

动代码前先读这一页。iOS 伴侣应用另有 `ios/home-scan/ARCHITECTURE.md`,
云端契约在 `apps/home/supabase/README.md` —— 三份文档各管一层,别写重。

## 分层铁律

```
routes/          页面(Svelte 5 runes)。只做展示与交互,业务进下面两层
  ├─ /       概览(浏览模式,只读)
  ├─ /plan   平面编辑器(单一 activeTool,顶栏不许长高)
  ├─ /storage 储物审计(物品/柜内实测/搜索)
  ├─ /tidy   整理(动线/杂乱/布局方案/长期观察)
  └─ /settings
lib/             IO 与应用状态(可以碰 supabase/IndexedDB/DOM)
  ├─ state.svelte.js   全局状态 + 所有写路径(见下面「两条写路径」)
  ├─ cloud-scan.js     扫描拉取/照片下载/柜内数据/派生特征(哈希/主色)
  ├─ event-log.js      事件流本地仓(IndexedDB,append-only)+ 云同步
  ├─ photo-store.js    照片仓(IndexedDB,永不上传)
  └─ vlm.js            本地网关(127.0.0.1:18888)的 VLM 调用
lib/spatial/     纯函数层 —— 无 IO、无 DOM、node 单测直接跑。
                 所有几何/推理/契约校验都在这层;新逻辑优先落这里
```

**判断新代码放哪:** 能用 `node scripts/xxx-unit.mjs` 测的 → `spatial/`;
要碰网络/存储 → `lib/`;只是把数据摆上屏幕 → `routes/`。

## spatial/ 内部的依赖方向(只许朝下)

```
geometry.js  dimensions.js  types.js        ← 原语:几何/单位/typedef,谁都可用
    ↑              ↑
placements.js  zones.js  wall-graph.js ...  ← 词表与户型模型
    ↑
circulation.js  scan-register.js  scan-identity.js  photo-hash.js  color-lab.js
    ↑
scan-merge.js  scan-fuse.js  layout-solve.js  scene-graph.js  clutter-score.js
    ↑
tidy-plan.js  container-scan.js  event-derive.js  photo-coverage.js
```

- **几何原语只写在 `geometry.js`**(pointInPolygon/distToSegment/
  pointToRectDistance/boxesOverlap)。circulation/zones 里的同名导出是
  兼容 re-export,新代码直接 import geometry。
- **平面标尺只写在 `dimensions.js`**(PX_PER_IN=3 / PX_PER_FT=36 / PX_PER_CM)。
- 轴对齐墙段形状 `{vertical, at, lo, hi}` 是配准/锚定/求解共用的通用币,
  别再发明新形状。

## 两条写路径(state.svelte.js)——搞混会真丢数据

| 路径 | 用于 | 撤销 | 备注 |
|---|---|---|---|
| `applyEditSource(patch)` | 几何编辑:墙/门窗/分区/家具位置 | 进几何撤销栈 | 有 wallGraph 才是墙图模式,**不许**无条件翻模式 |
| `updateStorageZones(mutate)` | 储物物品/柜内实测/绑定 | **刻意绕开**撤销栈 | 否则挪一堵墙会把这期间新增的物品一起冲掉 |

其他不变量:
- `hydrateProject` 每次 `getActiveProject()` 都跑 —— 一切 normalize 必须
  **幂等 + 确定性**(随机 id 会churn `{#each}` key;快路径判脏必须覆盖
  新字段,否则一件脏数据触发整区重建时新字段被静默抹掉 —— level/purchase
  都踩过,单测锁死)。
- 结构锁(`isStructureLocked()`):改户型的功能一律挂在 `!structureLocked`
  后面;`fixed` 钉死件几何一律以本地为准。
- 事件流(`event-log.js`)只增不改;云表 home.events 在 DB 层没有
  update/delete 策略。事件是增强层:IDB 失败静默降级,绝不打断操作。

## 跨端同源点(改一处必须同步改)

| 契约 | 两端位置 |
|---|---|
| payload(formatVersion 1) | iOS `Convert/HomeOSModels.swift` ↔ `spatial/scan-payload.js` ↔ supabase/README.md |
| 配准数学(含点到线精修) | iOS `Services/HomeFrame.swift` ↔ `spatial/scan-register.js` |
| 柜内 JSON | iOS `Services/ContainerGeometry.swift` ↔ `spatial/container-scan.js` |
| 事件形状 | `spatial/event-derive.js` ↔ home.events 表(supabase/README.md) |

## 测试地图(改了什么就跑什么)

- 纯函数层:每个模块一个 `scripts/<名>-unit.mjs`,`npm run test:<名>`。
  **单测是唯一防线**:svelte-check 抓不到未导入引用,`vite build` 才抓得到。
- 改 circulation/scan-merge/placements 系:必跑
  `test:scan-merge test:circulation test:placement-snap test:plan-edit test:508-drag`。
- 改储物:`test:storage test:storage-ui test:storage-undo test:container-scan`。
- 浏览器验证走**用户真实路径**(浏览模式/真实页面),编辑模式和离线 SVG
  都绕过了渲染主线 —— 曾因此漏过「两套户型混渲染」。
- 求解器/动线的浏览器侧长计算必须分块(`yieldFn`),同步几百次迭代会把
  主线程冻半分钟(实测踩过)。

## 性能已知形状

- `analyzeCirculation`:栅格化(分区 point-in-polygon+墙距)是大头且只跟
  户型有关 —— 重复评估传 `{ base: buildCirculationBase(project) }`(求解器 8×)。
- 照片/哈希/主色派生都在**拉取时**做一次,匹配与渲染路径永不解码图片。
- 事件派生读最近 8000 条上限;IndexedDB 游标倒序取。
