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
# ① embedding(embed_objects.py)
.venv/bin/python embed_objects.py --scan <scanId>        # dry-run:产 NDJSON + 摘要
.venv/bin/python embed_objects.py --latest-iphone        # 挑最新 iPhone 扫描,dry-run
.venv/bin/python embed_objects.py --scan <scanId> --apply  # 写库(见下依赖)
.venv/bin/python embed_objects.py --all-iphone --apply   # 所有 iPhone 扫描(断点续跑,auto-refine 用)

# ② 跨扫描认亲(match_objects.py):populate object_observations + Hungarian 对齐 canonical
.venv/bin/python match_objects.py --all-iphone           # dry-run:打分 + 报告
.venv/bin/python match_objects.py --all-iphone --apply   # 写库(+ PATCH 回填 embeddings.canonical)
```

matcher 尊重用户 P3 裁决:`match.userDecision` 存在的行 `--apply` 原样保留(不覆盖)。
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

## auto-refine(事后精修 · 战略「Mac 15 分钟内精修」)

`refine.sh` = 一键作业:`embed_objects.py --all-iphone --apply` 然后 `match_objects.py --all-iphone --apply`。
幂等(断点续跑 + 尊重用户裁决),原子锁防两轮叠跑,日志 `~/.local-ai/logs/vision-refine.log`。
possibly_same 难例落库后,网页 P3 证据卡片自动浮现(/plan 横幅 + 设置入口,一次最多 5 张最像的)。

**持久 venv**(launchd 不能用 scratchpad 的临时 venv):
```sh
uv venv ~/.local-ai/vision-venv --python 3.12
uv pip install --python ~/.local-ai/vision-venv/bin/python torch torchvision pillow numpy scipy
```

**手动跑一次**:`bash refine.sh`(默认用 `~/.local-ai/vision-venv`;可 `VISION_PY=... bash refine.sh`)。

**装成 launchd 定时任务**(每 15 分钟 + 登录即跑;LaunchAgent 在用户会话内 → 钥匙串可访问)。
⚠️ 这是常驻后台任务,需**你自己执行**(安全审批不允许 agent 自动装):
```sh
cp apps/home/scripts/vision/com.homeos.vision-refine.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.homeos.vision-refine.plist
launchctl print gui/$(id -u)/com.homeos.vision-refine   # 看状态
# 卸载:
launchctl bootout gui/$(id -u)/com.homeos.vision-refine && rm ~/Library/LaunchAgents/com.homeos.vision-refine.plist
```
plist 里是 `refine.sh` 的**绝对路径**,仓库若挪位置要同步改(或改软链)。

## 待办

- iOS 裁剪质量修好后 bump `CROP_RECIPE_VERSION`,旧向量不与新裁剪混比。
- auto-refine 现覆盖**全部** iPhone 扫描(首轮把历史全 embed;之后断点续跑近乎空转)。若嫌重可改成只跑近 N 次。
- P3 证据卡片一次上限 5 张(`recognition-review.js MAX_REVIEWS`),按候选相似度降序;处理完 reload 浮下一批。
