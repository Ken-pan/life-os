# homeos-vision · 物体视觉 embedding 批处理(Track B)

Mac 端离线服务:从 `home-scan-photos` 桶拉扫描物体裁剪 → DINOv2 算 embedding →
写 `home.object_embeddings`。云端批处理路径(不碰 LAN/Bonjour)。

- 方向/真实数字/配置依据:[`../../docs/object-recognition-p0.md`](../../docs/object-recognition-p0.md)
- 数据契约:[`../../supabase/migrations/20260717120000_home_object_recognition.sql`](../../supabase/migrations/20260717120000_home_object_recognition.sql)

## embedding 配置(spike 验证,别改)

`dinov2_vitb14` · `forward_features()['x_norm_patchtokens'].mean(1)`(patch-mean 池化）·
518 分辨率 · L2 归一化(余弦=点积)· dim 768。CLS@224 与前景聚焦池化都实测更差。
门内检索(kind 硬门)94.4%。

## venv(不污染 app 的 node 依赖)

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python torch torchvision pillow numpy
```

首次运行会经 `torch.hub` 下 DINOv2 ViT-B/14 权重(~86MB,dl.fbaipublicfiles.com)。
Apple Silicon 走 MPS 自动加速。

## 用法

```sh
.venv/bin/python embed_objects.py --scan <scanId>       # dry-run:产 NDJSON + 摘要
.venv/bin/python embed_objects.py --latest-iphone       # 挑最新 iPhone 扫描,dry-run
.venv/bin/python embed_objects.py --scan <scanId> --apply # 写库(见下依赖)
```

取钥同 `vite.config.js`:钥匙串 `Supabase CLI` token → Management API service_role。

## dry-run vs --apply

- **默认 dry-run**:只算 embedding、跑近重复闸、写本地 `object_embeddings.ndjson`,不碰生产。
- **`--apply`**:upsert 到 `home.object_embeddings`(`on_conflict=user_id,model_version,photo_path`,
  同版本重算幂等)。**前置:migration `20260717120000` 必须先按
  [`../../supabase/README.md`](../../supabase/README.md) 安全步骤应用(禁 `db push`);表未应用前写库会 404。**

## 近重复闸

不同物体但 embedding cos>0.98 = 共享裁剪(叠放/紧邻件 bbox 投影错位,如 pl-16≈pl-18)。
服务标记 `_shared_crop`(非表列),matcher 消费时对这些物体不采信视觉分、退回几何。
**根因修复在 iOS 端**(前景隔离 / bbox 去歧义),Mac 端只能检出不能修复。

## 待办

- iOS 裁剪质量修好后 bump `CROP_RECIPE_VERSION`,旧向量不与新裁剪混比。
- observation 历史(`object_observations`)由 matcher 侧填(需跨扫描认亲后才有 canonical_object_id)。
- 定时/增量:目前按 scan 手动跑;接 local-ai 网关或 nightly 后自动化。
