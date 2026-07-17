# HomeOS 跨扫描认亲(物体识别层)· P0 findings + 实施规格

> 状态:2026-07-17 · P0 数据契约已应用生产并注册（但 migration/服务仍未提交）+ DINOv2 spike 已验证(真实数字)。
> 数据契约见 [`supabase/migrations/20260717120000_home_object_recognition.sql`](../supabase/migrations/20260717120000_home_object_recognition.sql)
> 与 [`src/lib/spatial/types.js`](../src/lib/spatial/types.js) 的 `ObjectObservation`/`ObjectEmbedding` typedef。

## 问题定性

「同一件家具跨多次扫描能不能认回来」是**实例检索(instance retrieval)**,不是语义分类。
两把同款办公椅的 VLM 描述几乎一样,文本 embedding 认不出「是不是同一把」。目标架构:
**DINOv2 视觉实例特征 + 多视角 gallery + 全局一对一(Hungarian)matching,VLM 只处理分类与难例。**

现状(2026-07-17 审计):跨扫描身份靠 [`scan-identity.js`](../src/lib/spatial/scan-identity.js) 现算
(kind 硬门 + 尺寸 0.45 + 位置 0.45 + 颜色/style/dHash≤10/层高 加分),逐件贪心、不落盘、
无历史累积。唯一视觉信号是粗糙的 dHash。多角度裁剪 JPEG **早已**端到端到 `home-scan-photos`
桶 + 网页 IndexedDB —— 采集管道在,缺的是实例级视觉特征 + 跨扫描历史 + 全局分配。

## DINOv2 spike:真实数字(真机扫描 5337591a,27 件 57 张裁剪,含 2 把办公椅)

| 度量 | 数字 | 结论 |
|---|---|---|
| 裸检索 CLS token @224 | 33% | 朴素配置,**弃用** |
| 裸检索 patch-mean @518 | 46% | 换对配置 +13pt |
| **门内检索(kind 硬门)patch-mean@518** | **94.4%(51/54)** | ← 真实匹配器面对的数字 |
| 门内检索放松到「同族」 | 76% | **反而更差**,视觉打分别放松到族 |
| 前景聚焦池化(CLS 注意力 / top50% mask) | 90.7% | **负结果**,不如朴素均值,别过度设计 |

**为什么裸检索 33% 是假信号**:被跨 kind 混淆(冰箱↔柜、洗碗机↔水槽)系统性压低,
而真实匹配器有 kind 硬门,永不做这些比较。只在同 kind 候选里认亲 = 94%,远高于 dHash-only。

**三个 MISS 全是裁剪质量,不是模型**:
1. `pl-19→pl-13`(两把办公椅):pl-19 有一张「角度」其实是**一堵空墙**(bbox 脱靶)、另一张运动模糊。
   但 pl-13 自己两角度 0.805 互认、pl-12 也自认 —— **两把相似办公椅在裁剪像样时分得开**。
2. `pl-16/pl-18` 逐像素相同裁剪(cos 1.000):叠放/紧邻件 bbox 投影错位张冠李戴(见
   [[home-scan-ios-pipeline]] 老坑;iOS `skipHash` 只压 dhash、没修裁剪本身)。
3. `pl-11 shelf→pl-9 shelf`、`pl-5 cabinet→pl-3 cabinet`:同 kind 里视觉相近的储物件。

## 三条硬结论(直接进实现)

1. **embedding 配置定死**:`model.forward_features(x)['x_norm_patchtokens'].mean(1)`(patch-mean 池化)
   + 518 分辨率 + L2 归一化(余弦=点积),`dinov2_vitb14`,dim 768。**不要 CLS@224,不要前景聚焦池化。**
2. **kind 硬门收紧**,视觉打分不放松到族(放松到族 94%→76%,把共享裁剪灾难放回来)。
3. **真正的 P0 前置 = 裁剪质量,排在接 DINOv2 之上。** 94% 已经是朴素 patch-mean 在当前
   不完美裁剪上的成绩;修好裁剪能把那 3 个 MISS(全裁剪质量)推向 ~100%。

## Mac 端能做什么、不能做什么(spike4 验证)

- **能检出、不能修复**:近重复闸(不同物体 embedding cos>0.98)**可靠**检出共享裁剪
  (pl-16/pl-18 稳定 1.0000)→ 隔离该物体视觉信号、退回几何。空墙闸(patch 内容方差)
  单独不靠谱(平白白柜/书桌也偏低,误伤)→ 须与现有 sharpness/colorConfidence 合用。
- **背景污染修不了**:DINOv2 patch token 本身带场景上下文,池化重新加权救不回 →
  **根因裁剪修复在 iOS 端**(前景隔离 / 修 bbox 投影),需真机 QA。

## 两条 track

### Track A — iOS 裁剪管线(根因,需真机 QA)

**⚠ 前景 mask 已证伪(spike4/spike5,别再试)**:后处理去背景对 embedding **没用、反而略降** ——
patch 重加权 94→91%、收紧-22% →89%、外围中性填充 →85%。原因:①DINOv2@518 本就抗背景;
②失手件不是背景问题 —— pl-16/pl-18 是**逐字节相同的裁剪**(同样收紧还是相同),pl-11/pl-5 是
真·同类相近物(物体本身就是混淆源)。**结论:问题在"捕获时存了错裁剪",不是"裁剪没处理好"。**

已落地(`ObjectShotCapture.swift`,纯函数 + 单测):
- **邻件主导即拒拍**:`neighborDominance()` 算 crop 里被别的家具投影框占的最大比;
  ≥0.80 → 拒拍(主体根本是别人,如两件不同柜子拿到同一裁剪的根因),≥0.55 → 仍存但 skipHash
  (保留原语义)。`ObjectShotCaptureTests` 5 项锁死。
- **QA 遥测(一次真机扫描即可验证/调阈,不必装一版调一次)**:
  - **占幅直方图** `dom_lt55 / dom_55_70 / dom_70_80 / dom_80_90 / dom_90_100`(固定桶,随
    `meta.scanDiagnostics` 上传)—— 看 0.80 是否落在自然间隙、升/降阈会波及多少件。
  - **每次拒拍明细** JSONL 事件 `shot_rejected_neighbor {category, dominance}`(首页「导出诊断日志」
    可分享)—— 眼验拒的是不是叠放件、有没有误伤正常家具。
  - `gate_neighborDominant` 拒拍总数。
- **扫描后看什么**:①`dom_80_90`+`dom_90_100` 应主要落在真实叠放/紧邻件(炉边柜叠冰箱顶柜等);
  ②`shot_rejected_neighbor` 的 category 不该出现孤立摆放的大件(那是误伤,阈值要抬);
  ③`dom_70_80` 若很多,说明 0.80 偏松,可考虑降到 0.75;若 `dom_80_100` 稀少且都对,阈值合适。

待做(需真机深度数据,未写):
- **脱靶/空墙拒绝**:pl-19 那种投影到位但物体被墙挡住 → 裁到空墙。需 `frame.sceneDepth`
  比对期望深度(遮挡),模拟器测不了,留给装机。
- **多视角聚合**:per-object 取 best-pair(0.6×最相似角度对 + 0.4×多视角中心),别简单平均 ——
  一张废图不拖垮整件。这条属 matcher 侧(P1),不在裁剪管线。

### Track B — Mac 批处理 embedding 服务(云端,不碰 LAN)
- 挂进现有 local-ai 网关那套([[local-ai-gateway-manages-services]]),从 `home-scan-photos`
  桶拉裁剪 → patch-mean@518 算 embedding → 写 `home.object_embeddings`,走现有云链路。
  提案的 iPhone↔Mac Bonjour 实时是 P1,P0 不需要。
- 写入带 `model_version='dinov2-vitb14@…'`、`dim=768`、`crop_recipe_version`(裁剪配方变即重算)。
- 近重复闸:入库时标记共享裁剪对,matcher 消费时对这些物体不采信视觉分。
- **依赖状态**:migration `20260717120000` 已按 [`supabase/README.md`](../supabase/README.md)
  安全步骤应用并注册（禁 db push）；当前 P0 是把已生效生产 schema 与服务代码纳入版本史并锁定复现/回滚证据。

### 之后(P1)
matcher 消费 embedding 作正向 bonus → 全局一对一(Hungarian)assignment → observation 历史累积
→ 个性化 positive/hard-negative 校准 + regression benchmark(防规则越改越差)。

## spike 复现

scratchpad `dino-spike/`:`spike.py`(裸检索基线)/`spike2.py`(分辨率+池化变体)/
`spike3.py`(门内检索,money metric)/`spike4.py`(前景池化+废图闸)。
裁剪是用户家实拍;live service_role 凭证跑完即删。uv venv + torch 2.13 MPS。
