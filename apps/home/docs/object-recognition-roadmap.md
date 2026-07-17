# HomeOS 扫描认亲 · 路线图与交接状态

> 2026-07-17。配套读 [`object-recognition-p0.md`](object-recognition-p0.md)(spike 数字/数据契约)。
> 本文是**战略重定位后**的活文档:下一个 agent 从这里接。

## 0. 战略重定位(用户 2026-07-17 定的方向,最高优先)

**不是把扫描做得更"严谨",而是做得安静、稳、可信。**

> Quick Scan 默认安静完成;Mac 在 15 分钟内精修;最后只把 ≤3–5 个有充分证据的难例交给用户。

- **手机 = 轻松扫完 + 静默收好帧**,不把系统的不确定性转嫁给用户(别再"请移动/靠近/还差一个角度")。
- **Mac = 扫描后精修**(embedding/matching/VLM),用户愿等 10–15 分钟。
- **确认 = 证据卡片**(新旧图 + 尺寸 + 位置 + 支持/反对证据 + 「暂时不确定」选项),不是模糊二选一。
- **大件先做牢**(桌椅柜床架/鸟笼/大电器),**小物件(杯子/泡泡玛特/宠物用品/柜内)进后续独立能力**,不拖垮房间主扫描。
- **Mac 永远是增强器,不是扫描前置**(用户选的路径 A):离线也能扫完、排队、回来自动增强。

产品规则调整(旧→新):扫时求完整→扫时求完成;不足就催用户→不足先记录;小东西同等处理→进后续模式;Mac 实时辅助→Mac 事后精修;模糊文字确认→证据卡片;不确定二选一→支持「暂不确定」;继续调阈值→先验证服务稳定与整体流程。

## 1. 当前实现状态(精确到「写了但没验证」)

| 项 | 状态 | 位置 |
|---|---|---|
| DINOv2 spike(门内检索 94%,配置定死 patch-mean@518) | ✅ 验证 | `scripts/vision/`(scratchpad `dino-spike/`) |
| 数据契约 migration(object_observations/object_embeddings) | ✅ **已应用生产 + 注册**(2026-07-17 用户授权;两表 RLS 开各 4 策略;version 20260717120000 入 schema_migrations)。回滚 = `drop table home.object_observations, home.object_embeddings cascade` | `supabase/migrations/20260717120000_*.sql` |
| Track B embedding 服务(桶→embedding→表) | ✅ **已 `--apply` 入库 + 加固 + 幂等验证**:5337591a 写 57 行/27 物体/dim768,近重复闸标 pl-16≈pl-18;加固=断点续跑(同 model_version 跳过已算,第2次跑续跑跳过57/入库0)+ 逐张容错(废图不毁整批)+ 瞬时错误重试 + 只写成功向量 + 运行摘要 | `scripts/vision/embed_objects.py` |
| 邻件主导拒拍闸(Track A 静默过滤坏裁剪) | ✅ 装机验证(unmerge/dom 遥测) | `ObjectShotCapture.swift` |
| **#2 整排柜 prior-informed un-merge** | ✅ **装机验证**(真机 ca217c8a `unmerge_split_added=1`) | `PlanProjector.unmergeByCanonical` |
| **认账免催(位置识别版)** | ✅ **装机验证**(ca217c8a `prior_matched_peak=5/17`) | `EvidenceGuide.matchPrior` + `ScanSessionController` |
| 认账遥测(prior_count/regOk/matched/closeness) | ✅ 装机 | `ScanSessionController` |
| #3 脏乱 VLM 扫后自动识别 | ⚠️ **写了,svelte-check 过,VLM 端到端未验证**(要本地网关+真实拉取) | `state.svelte.js autoDescribeScanScenes` |
| **Quick Scan 安静模式(默认关补拍引导)** | ✅ **装机验证通过**(真机 fb4a277b:`hint_viewpoint` 8→**0**、hint_evidence/tracking 全 0 = 全程安静;认账 `prior_matched_peak=8/14` 照常流,安静没关掉遥测) | `ScanSessionController.quietScan` + HUD 组装块 |
| **扫后质量摘要 UI(P1)** | ✅ **编译验证 + 装机**(预览页顶部安心总账「基础扫描已保存 · N 件已记录 · 其中 K 件认出是家里已有的」,技术细节降为下方分区)。真机肉眼观感待用户反馈 | `Views/ReviewView.swift` |
| 启动屏全屏修复 | ✅ 装机(2026-07-17 **真源迁移**:此前手改物理 `Info.plist` 加 `UILaunchScreen`,但 `xcodegen generate` 每次都按 `project.yml info.properties` 重写该文件、不在列表里的 key 全部冲掉——上机流程标准步骤第一步就是 `xcodegen generate`,等于自己把这个已验证修复冲了,用户看到 App 退回旧屏幕兼容模式居中缩小。真源已挪进 `project.yml`,扛得住 generate) | `project.yml info.properties.UILaunchScreen` |
| **P2 matcher 地基(跨扫描认亲)** | ✅ **写库验证**(2026-07-17):3 次设备扫描入 embedding(88 向量);`match_objects.py` 按时间序 populate object_observations + kind 硬门 + best-pair 余弦 + **全局一对一(Hungarian, scipy)**对齐 canonical_object_id + PATCH 回填 embeddings.canonical。真数据:**51 观察→32 canonical、17 个身份被 ≥2 次扫描认回**(冰箱/烤箱/炉边三抽柜/冰箱顶吊柜 0.85-0.96)、2 待复核、2 共享裁剪独立。阈值 HIGH=0.62/MID=0.50。**两处关键修正**:①只跟本扫描**之前**的 canonical 比 + 一对一指派 → 修掉旧贪心把同扫描两把办公椅并成一个(现 5 观察→3 canonical,欠合并是安全向,留 P3);②回填 canonical 从 upsert 改 **PATCH**(纯 UPDATE)—— upsert 的 INSERT 语义拿缺列元组过 NOT NULL 校验必炸 `scan_id`/`embedding`,即便终走 UPDATE。**③契约对齐**:`match` jsonb 已对齐 `types.js ObjectMatchDecision`(state=same/possibly_same/added、candidates={canonicalId,score,breakdown,label}、possibly/added 时 chosenCanonicalId 空、resolver=global-assignment),抽验三态键名/枚举无越界 | `scripts/vision/match_objects.py` · `src/lib/spatial/types.js` |
| **P1 快速/高精度双模式 UI 开关** | ✅ **已装机**(2026-07-17,真机 build+install 成功,手机上线后完成)—— HomeView 设置区「安静扫描」toggle(默认开)→ `@AppStorage(quietScanKey)` → startScanning 喂 `scanController.quietScan`。待用户肉眼确认开关可见+可切换,以及关掉后高精度补扫的真机观感 | `HomeView` + `ScanSessionController.quietScanKey` + `AppModel+ScanFlow` |

**quietScan 验证进度(2026-07-17)**:✅ 三套测试全绿(EvidenceGuide 23/ObjectShotCapture 14/PlanProjector 29 = 66);✅ device build/签名/装机与真扫遥测通过（`hint_viewpoint` 8→0，evidence/tracking hint 为 0，`prior_matched_peak=8/14`）；剩余是用户对质量摘要观感反馈，以及高精度补扫模式。

## 2. 路线图(P0→P4,承接用户重定位)

### P0 · 基础服务稳定化(先于一切)
Track B 上生产前**先把地基做牢**:migration 可安全应用+回滚;embedding 写入**幂等**(同 model_version upsert,已按此设计 PK);任务可排队+重试+断网恢复;每次跑记 model_version;**失败任务不许覆盖已有正确结果**;保留原始 observations;一键导出诊断包。
**验收**:同批数据重复跑 3 次不产生重复对象/重复 embedding、输出一致、中途杀服务可续、Mac 离线不影响手机扫描。

### P1 · 降低扫描打扰(= 战略核心,已开工)
- **每房间主动提示 ≤2 次**;小物件不足不提示;邻件拒拍后台发生;**「还差几个角度」默认关**(← Quick Scan,🚧 刚写);扫描结束统一显示**质量摘要**(未做,预览页 UI)。
- 两个模式:**快速扫描(默认安静)/ 高精度补扫(仅针对系统指出的 1–3 个区域,不是重扫整个家)**。`quietScan` 已留开关口子,缺 UI 切换 + 「高精度补扫」只对指定区域引导的逻辑。
- 扫完的产品文案:「基础扫描已保存 · N 件已记录 · 正在用 Mac 增强」,别显示技术名词。

### P2 · 大件家具认亲(Track B 主战场)
应用 embedding migration → 给已有裁剪写 embedding → matcher 消费视觉信号 + 尺寸/位置/类别/邻接 → **全局一对一(Hungarian)分配** → 低置信不自动合并 → 产出证据卡片所需 evidence。
**第一轮不自动做**:不自动删漏扫件、不自动合并低置信、不因位置变化就新建对象、不让 VLM 单独定身份。

### P3 · 证据式确认 UI ✅ 已建 + 端到端验证(2026-07-17)
默认确认 0–5 件;新旧图 + 支持/反对证据 + 选其他历史候选 + **「暂时不确定」**;确认后沉淀成训练数据(positive/hard-negative)。
**已落地**(浏览器实测真机生产数据 2 件难例,4 张裁剪签名图全加载,截图为证):
- `src/lib/recognition-review.js`:`loadRecognitionReviews()` 拉 `object_observations` 筛 `match->>state=possibly_same` + 按 `candidates[0].canonicalId` 配代表旧图 + 批量 `createSignedUrls` 签名裁剪;`resolveRecognition(review, decision)` 回写 `match`+`canonical_object_id`。
- `src/lib/components/RecognitionReview.svelte`:模态证据卡片(新裁剪 vs 候选旧裁剪 + 相似度 + 「是同一件/不是/暂不确定」),仿 `ScanMergeReview` 设计与 token。
- `src/routes/settings/+page.svelte`:「云端扫描」区加「认亲确认」入口(登录后 `$effect` 加载,有难例才显示,badge 带件数)。
- **决策持久化闭环**:裁决落 `match.userDecision`(same/different/unsure)+ state(same/added/deferred),`match_objects.py` 的 `locked_decisions()` 让 `--apply` 对带 userDecision 的行**原样保留**——Mac 每次精修不会冲掉用户裁决(P3 要求的 positive/hard-negative 沉淀)。契约 `types.js` 加了 `deferred` state + `userDecision`/`decidedAt` 字段。
- **结构现实**:权威副本零照片→零 embedding,故这套认亲是**设备扫描之间**的身份图,不走 `scan-identity.js`(那条是 scan-vs-权威、纯几何);两条并行,P3 卡片消费的是 matcher 这条。
- **已补(2026-07-17 续)**:①**/plan 认亲横幅** `RecognitionBanner.svelte`(浏览器实测:横幅「N 件待认亲确认 · 看看/忽略」→ 开同一模态,忽略按 pending key 集合压下、出新难例再冒泡);②**上限 5 张**:auto-refine embed 全部 17 次历史扫描后 possibly_same 涨到 **21**,违反「≤3-5 件」→ `recognition-review.js MAX_REVIEWS=5` 按候选相似度降序取前 5(浏览器实测横幅 21→5);③**auto-refine 管线** `refine.sh`(embed --all-iphone --apply + match --all-iphone --apply,幂等+原子锁+日志)+ launchd plist(每 15 分钟,= 战略「Mac 15 分钟精修」)——脚本/venv/pipeline 端到端验证过(手动跑写 286 观察/218 认回/68 canonical),**launchd 激活需用户手动**(安全审批不许 agent 装常驻任务;命令见 `scripts/vision/README` auto-refine 节)。
- **待做(follow-up)**:①「是同一件」目前只 relink 被确认的**单行**观察,不牵动同 canonical 的兄弟观察(group-merge 留后续);②横幅/入口显示的是「本批 ≤5」不是总待确认数(21),要不要露总数待定;③auto-refine 现覆盖全部历史扫描,可改成只跑近 N 次减负。

### P4 · 小物件专项(等 L1/L2 稳)
区域照片识别 / 架柜内容摘要 / 小物件库存 / 收藏品(泡泡玛特)/ 器材档案 / 收纳容器–内容关系。**独立能力,不塞进房间主扫描。**

## 3. Quick Scan 改动细节(给下一个 agent 接手 🚧)

`ScanSessionController` HUD 组装(约 226 行)优先级本是:跟踪异常 > 机位走位(exitNudge) > **补拍引导(evidenceHint)** > 机位站位(viewpoint hint)。
改动:加 `var quietScan = true`;安静模式下 **evidenceHint 仍调用**(设 evidenceTarget 给抓拍定优先级 + 记缺口 + 认账遥测),但**不弹进 hudHint**;机位站位也不弹。只留**跟踪异常 + exitNudge**。VoiceGuide 因此只念这两类,不念逐件补拍。
**已闭环（勿再估）：** `HOME.RECOG.0` 版本史 · matcher/证据 UI · **/plan 横幅** · **auto-refine 管线**（`refine.sh` + launchd plist；激活待用户）。  
**仍属 `HOME.RECOG.1r` 残余：** ①质量摘要观感用户签收；②「高精度补扫」只对指定 1–3 区域引导（现仅有全局安静 toggle）；③用户手动 `launchctl bootstrap` 常驻精修。

## 4. 运维(命令 + 遥测键)

**真机装机**(设备 Ken's 17 Pro UDID `8097F071-CAB6-5AF0-8258-BCD985E9D79E`,WiFi 无线配对,不用插线;个人签名 7 天过期):
```
cd ios/home-scan && xcodegen generate
DD=<scratchpad>/dd-device
xcodebuild -project HomeScan.xcodeproj -scheme HomeScan -destination 'platform=iOS,id=<UDID>' \
  -derivedDataPath "$DD" -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
xcrun devicectl device install app --device <UDID> "$DD/Build/Products/Debug-iphoneos/HomeScan.app"
```
装完**手机上划掉 app 重开**(启动屏有缓存)。
**测试**:`xcodebuild ... -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:HomeScanTests/<Suite> test`。
⚠️ **`Info.plist` 手改的 key 一律同步进 `project.yml` 的 `info.properties`**:`xcodegen generate`(第一步)每次都按 `properties` 重写物理 `Info.plist`,不在里面的 key 全被冲掉(2026-07-17 吃过一次:启动屏全屏修复被自己的标准装机流程冲没,App 退回旧屏幕居中缩小)。

**拉扫描诊断**(判功能通没通):service_role 从钥匙串 `Supabase CLI` token → Management API `/v1/projects/<ref>/api-keys?reveal=true`(**urllib 要带 User-Agent 否则 Cloudflare 403**);REST 带 `Accept-Profile: home`;诊断在 `payload.homeos.meta.scanDiagnostics`。
关键遥测键:`prior_count`(权威加载数)/`prior_regOk`(配准在线)/`prior_matched_peak`÷`prior_objects_peak`(原位识别率)/`prior_closeness`(=300−nearest_cm)/`unmerge_split_added`(整排拆几件)/`dom_*`(邻件占幅直方图)/`gate_neighborDominant`(拒拍数)。

**migration 应用(禁 db push)**:`scripts/supabase-sql.sh -f <file>` 再注册 schema_migrations,见 `supabase/README.md`「从零复现」;home schema 已 exposed。

## 5. 关键教训(别再重踩)

1. **优化副本(server-optimized)零张 attrs.photos**(v23:37 placements 全空;photoRef 是网页本地键)→ 任何依赖它照片覆盖的设备端逻辑静默失效。认账改成**纯位置识别**(与照片无关)才通。
2. **坐标链已验证准**:`HomeFrame.toHome(scan米,reg)`→户型米,权威件 `px/pxPerM`(pxPerFt/0.3048)同帧,真机最近件 **4cm**。别再怀疑换算。
3. **matchPrior 只在 `reg.ok`(P95≤15cm/中位≤7cm)时跑** → 匹配天然只在良好对齐下发生,不需额外配准质量闸。**残缺扫描 reg.ok 窗口短 → 识别率低,不是 bug**;全扫一房才准。
4. **合并是 RoomPlan 框架层**(整排上柜→一只 12.3ft 巨柜),dedupMapped 只二选一从不拆;un-merge 用权威副本拆回。
5. **后处理去背景对 embedding 没用甚至更差**(patch 重加权/收紧/中性填充三法都验证过)。共享裁剪(pl-16/pl-18 逐字节相同)是**捕获时投影错位**,后处理救不回,靠 iOS 邻件拒拍 + 下游同 hash 中和 + Mac 近重复闸三层兜。
6. **embedding 配置定死**:`dinov2_vitb14` patch-mean@518 L2 dim768;kind 硬门收紧别放族(放族 94→76%)。
7. 契约三处同源:`HomeOSModels.swift` · `spatial/scan-payload.js`+`supabase/README.md`;`HomeFrame.swift`↔`scan-register.js`;`ScanIdentity.swift`↔`scan-identity.js`。改一处同步。
8. 共享工作树多会话并发,提交要外科式,别 `git add -A` 扫走别人改动(见记忆 [[shared-worktree-concurrent-sessions]])。
