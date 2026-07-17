#!/usr/bin/env python3
"""HomeOS 物体视觉 embedding 批处理服务(Track B,云端批处理,不碰 LAN)。

从 home-scan-photos 桶拉某次扫描的物体裁剪 → DINOv2 patch-mean@518 算 embedding
→ 写 home.object_embeddings。默认 dry-run(只产 NDJSON + 摘要),--apply 才写库。

配置/数字依据见 apps/home/docs/object-recognition-p0.md(spike 已验证门内检索 94.4%)。
embedding 配置定死:dinov2_vitb14 · forward_features x_norm_patchtokens.mean(1) ·
518 分辨率 · L2 归一化 · dim 768。CLS@224 与前景聚焦池化都更差(别改)。

取钥:钥匙串 'Supabase CLI' token → Management API service_role(同 vite.config.js)。
用法:
  python3 embed_objects.py --scan <scanId>          # dry-run
  python3 embed_objects.py --latest-iphone          # 最新 iPhone 扫描,dry-run
  python3 embed_objects.py --scan <scanId> --apply   # 写库(需先应用 migration 20260717120000)
依赖:torch/torchvision/pillow/numpy(自带 venv:见同目录 README.md)。
"""
import argparse, json, os, ssl, subprocess, sys, time, urllib.request

REF = "iueozzuctstwvzbcxcyh"
MODEL_VERSION = "dinov2-vitb14@2026-07"
# 裁剪配方版本:iOS ObjectShotCapture 当前配方(bbox +12% 矩形、长边≤1024、JPEG q0.72)。
# iOS 改前景隔离/去歧义后必须 bump,旧向量不与新裁剪混比。
CROP_RECIPE_VERSION = "ios-bbox12pct-1024-q72-v1"
DIM = 768
NEAR_DUP_COS = 0.98  # 不同物体 embedding 超过此值 = 共享裁剪(须 iOS 端去歧义)
CTX = ssl.create_default_context()


def service_role_key():
    tok = subprocess.check_output(
        ["security", "find-generic-password", "-s", "Supabase CLI", "-w"]
    ).decode().strip()
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/api-keys?reveal=true",
        headers={"Authorization": f"Bearer {tok}", "User-Agent": "homeos-vision/1.0"},
    )
    keys = json.load(urllib.request.urlopen(req, timeout=20, context=CTX))
    key = next((k["api_key"] for k in keys if k.get("name") == "service_role"), None)
    if not key:
        sys.exit("没拿到 service_role key")
    return key


def with_retry(fn, *, tries=3, base=1.0, what="request"):
    """瞬时网络/5xx 重试(指数退避);4xx 之类当场抛(重试没意义)。"""
    for i in range(tries):
        try:
            return fn()
        except urllib.error.HTTPError as e:
            if e.code < 500 or i == tries - 1:
                raise
            time.sleep(base * (2 ** i))
        except (urllib.error.URLError, ssl.SSLError, TimeoutError) as e:
            if i == tries - 1:
                raise
            time.sleep(base * (2 ** i))


def rest(sr, path, accept_profile="home"):
    def go():
        req = urllib.request.Request(
            f"https://{REF}.supabase.co/rest/v1/{path}",
            headers={"apikey": sr, "Authorization": f"Bearer {sr}", "Accept-Profile": accept_profile},
        )
        return json.load(urllib.request.urlopen(req, timeout=30, context=CTX))
    return with_retry(go, what=f"rest {path[:40]}")


def already_embedded(sr, scan_id):
    """断点续跑:这次扫描在**当前 model_version** 下已入库的 photo_path 集合。
    表还没应用(migration 20260717120000 未跑)→ 404/406,当作空集(全算)。"""
    try:
        rows = rest(sr, f"object_embeddings?select=photo_path"
                        f"&model_version=eq.{MODEL_VERSION}&scan_id=eq.{scan_id}")
        return {r["photo_path"] for r in rows}
    except urllib.error.HTTPError as e:
        if e.code in (404, 406):
            return set()
        raise


def pick_scan(sr, args):
    if args.scan:
        return args.scan
    rows = rest(sr, "scans?select=id,device,updated_at&order=updated_at.desc&limit=20")
    iph = [r for r in rows if "iPhone" in (r.get("device") or "")]
    if not iph:
        sys.exit("没有 iPhone 扫描可选")
    return iph[0]["id"]


def scan_objects(sr, scan_id):
    """从 payload 提每个带裁剪的物体:(observation_id, user_id, kind, [photo_paths])。"""
    rows = rest(sr, f"scans?select=payload&id=eq.{scan_id}")
    if not rows:
        sys.exit(f"扫描 {scan_id} 不存在")
    h = rows[0]["payload"].get("homeos", rows[0]["payload"])
    out = []
    for o in (h.get("placements", []) + h.get("fixtures", [])):
        a = o.get("attrs") or {}
        photos = a.get("photos") or ([{"path": a["photoPath"]}] if a.get("photoPath") else [])
        paths = [p["path"] for p in photos if p.get("path")]
        if paths:
            uid = paths[0].split("/", 1)[0]
            out.append({"observation_id": o.get("id"), "user_id": uid,
                        "kind": o.get("kind"), "paths": paths})
    return out


def download(sr, path):
    def go():
        req = urllib.request.Request(
            f"https://{REF}.supabase.co/storage/v1/object/home-scan-photos/{path}",
            headers={"apikey": sr, "Authorization": f"Bearer {sr}"},
        )
        return urllib.request.urlopen(req, timeout=30, context=CTX).read()
    return with_retry(go, what="download")


def embed_all(crops, failed):
    """crops: list[(photo_path, jpeg_bytes)] → list[(photo_path, np.ndarray[768])]。
    单张解码/推理失败**不拖垮整批**:记进 failed(path→原因),跳过继续。"""
    import io, warnings
    warnings.filterwarnings("ignore")
    import numpy as np, torch
    from PIL import Image
    import torchvision.transforms as T
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    model = torch.hub.load("facebookresearch/dinov2", "dinov2_vitb14", verbose=False).eval().to(dev)
    tf = T.Compose([T.Resize(518, interpolation=T.InterpolationMode.BICUBIC), T.CenterCrop(518),
                    T.ToTensor(), T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    res = []
    for path, raw in crops:
        try:
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            x = tf(img).unsqueeze(0).to(dev)
            with torch.no_grad():
                p = model.forward_features(x)["x_norm_patchtokens"].mean(dim=1)  # patch-mean
            v = torch.nn.functional.normalize(p, dim=1).cpu().numpy()[0]
            res.append((path, v))
        except Exception as e:  # noqa: BLE001 一张废图不该毁整次任务
            failed[path] = f"embed:{type(e).__name__}"
    return res


def near_dup_flags(vecs, path2obs):
    """不同物体但 embedding cos>阈 = 共享裁剪。返回受影响的 photo_path 集合。"""
    import numpy as np
    paths = [p for p, _ in vecs]
    V = np.stack([v for _, v in vecs])
    S = V @ V.T
    flagged = set()
    pairs = []
    for i in range(len(paths)):
        for j in range(i + 1, len(paths)):
            if path2obs[paths[i]] != path2obs[paths[j]] and S[i, j] > NEAR_DUP_COS:
                flagged.update((paths[i], paths[j]))
                pairs.append((paths[i], paths[j], float(S[i, j])))
    return flagged, pairs


def upsert(sr, rows):
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        f"https://{REF}.supabase.co/rest/v1/object_embeddings"
        "?on_conflict=user_id,model_version,photo_path",
        data=body, method="POST",
        headers={"apikey": sr, "Authorization": f"Bearer {sr}",
                 "Content-Type": "application/json", "Content-Profile": "home",
                 "Prefer": "resolution=merge-duplicates,return=minimal"},
    )
    with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan")
    ap.add_argument("--latest-iphone", action="store_true")
    ap.add_argument("--apply", action="store_true", help="写库(否则 dry-run)")
    ap.add_argument("--force", action="store_true", help="重算已入库的(默认断点续跑跳过)")
    ap.add_argument("--out", default="object_embeddings.ndjson")
    args = ap.parse_args()
    if not args.scan and not args.latest_iphone:
        ap.error("需 --scan <id> 或 --latest-iphone")

    sr = service_role_key()
    scan_id = pick_scan(sr, args)
    objs = scan_objects(sr, scan_id)
    path2obs = {p: o["observation_id"] for o in objs for p in o["paths"]}
    all_paths = [p for o in objs for p in o["paths"]]
    print(f"scan {scan_id}: {len(objs)} 物体, {len(all_paths)} 裁剪")

    # 断点续跑:已入库的(同 model_version)跳过 —— 同批重跑不重算、中途杀了可续、
    # 输出一致(--force 强制重算)。表未应用则 already_embedded 返回空集,照旧全算。
    done = set() if args.force else already_embedded(sr, scan_id)
    todo = [p for p in all_paths if p not in done]
    if done:
        print(f"续跑:已入库 {len(done)} 张,本次算 {len(todo)} 张"
              + ("(--force 全重算)" if args.force else ""))

    # 逐张容错下载:桶里丢一张不该毁整次任务
    failed = {}
    crops = []
    for p in todo:
        try:
            crops.append((p, download(sr, p)))
        except Exception as e:  # noqa: BLE001
            failed[p] = f"download:{type(e).__name__}"
    vecs = embed_all(crops, failed)
    flagged, pairs = near_dup_flags(vecs, path2obs) if vecs else (set(), [])
    if pairs:
        print(f"⚠ 近重复(共享裁剪,视觉信号不可信,须 iOS 端去歧义): {len(pairs)} 对")
        for a, b, s in pairs:
            print(f"    {path2obs[a]} ≈ {path2obs[b]} cos={s:.4f}")

    now = int(time.time() * 1000)
    obs_of = {p: o for o in objs for p in o["paths"]}
    rows = []
    for path, v in vecs:
        o = obs_of[path]
        rows.append({
            "user_id": o["user_id"], "photo_path": path, "model_version": MODEL_VERSION,
            "scan_id": scan_id, "observation_id": o["observation_id"],
            "canonical_object_id": None, "dim": DIM, "embedding": [round(float(x), 6) for x in v],
            "calibration_version": None, "source": "mac-dinov2",
            "crop_recipe_version": CROP_RECIPE_VERSION, "created_at": now,
            # 服务侧近重复标记(非表列,供 matcher/审阅参考;写库时剔除)
            "_shared_crop": path in flagged,
        })

    shared = sum(1 for r in rows if r["_shared_crop"])
    if args.apply:
        # 只有成功算出向量的才写库 —— 失败任务绝不覆盖已有正确结果(P0 红线)
        payload = [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]
        status = with_retry(lambda: upsert(sr, payload), what="upsert") if payload else "跳过"
        print(f"✔ 已写 object_embeddings: {len(payload)} 行 (HTTP {status})")
    else:
        with open(args.out, "w") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"dry-run: {len(rows)} 行 → {args.out}  (dim={DIM}, 共享裁剪标记={shared})")
        print("  写库加 --apply(需先应用 migration 20260717120000_home_object_recognition.sql)")

    # 运行摘要(一次任务的健康档:续跑跳过/失败/共享裁剪)——诊断包与调阈都看它
    print(f"摘要: 入库 {len(rows)} · 续跑跳过 {len(done)} · 失败 {len(failed)} · 共享裁剪 {shared}")
    if failed:
        print("  失败明细(不影响其余,可重跑续上):")
        for p, why in list(failed.items())[:10]:
            print(f"    {why}  {p}")


if __name__ == "__main__":
    main()
