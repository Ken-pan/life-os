#!/usr/bin/env python3
"""HomeOS 跨扫描认亲 matcher（Track B / P2 地基，Mac 事后精修，不碰 LAN）。

把 object_embeddings 里躺着的向量变成"真的认得出家具":按时间顺序处理设备扫描,
populate home.object_observations（payload per-object 规范化 + 永久身份），用
**kind 硬门 + best-pair 余弦 + 全局一对一(Hungarian)**给每件对齐 canonical_object_id
—— 先来的扫描播种 canonical,后来的对回去。只跟**本扫描之前**的 canonical 比(同一
扫描里两件必是不同物体),一对一指派杜绝同扫描两件抢同一旧 canonical。共享裁剪件
（近重复,视觉信号不可信）不采信视觉、独立成新 canonical（认亲交给几何/后续人工确认，P3）。

第一轮**不自动做**(roadmap P2)：不删漏扫件、不合并低置信(<HIGH 只记候选不自动认)、
不因位置变化新建、不让 VLM 定身份。只加正向视觉信号。

配置沿用 embed_objects（同 model_version 才可比）。默认 dry-run（打分+报告,不写库）,
--apply 才写 object_observations + 回填 object_embeddings.canonical_object_id。

用法:
  python3 match_objects.py --all-iphone            # 所有 iPhone 扫描按时间序,dry-run
  python3 match_objects.py --all-iphone --apply
"""
import argparse, json, sys, time, urllib.request, urllib.parse
import embed_objects as E  # 复用 service_role_key/rest/with_retry/scan_objects/MODEL_VERSION

MATCH_HIGH = 0.62   # best-pair 余弦 ≥ 此 → 自动认作同一件(同 kind 才比)
MATCH_MID = 0.50    # [MID,HIGH) → 记为候选(possibly_same)但不自动认,独立成新 canonical
REF = E.REF


def iphone_scans(sr):
    rows = E.rest(sr, "scans?select=id,updated_at,device&deleted=eq.false"
                      "&order=updated_at.asc&limit=50")
    return [(r["id"], r["updated_at"]) for r in rows if "iPhone" in (r.get("device") or "")]


def embeddings_for_scan(sr, scan_id):
    """{observation_id: [(photo_path, vec[]), ...]}（本 model_version）。"""
    import numpy as np
    q = (f"object_embeddings?select=observation_id,photo_path,embedding"
         f"&model_version=eq.{urllib.parse.quote(E.MODEL_VERSION)}&scan_id=eq.{scan_id}")
    out = {}
    for r in E.rest(sr, q):
        out.setdefault(r["observation_id"], []).append(
            (r["photo_path"], np.asarray(r["embedding"], dtype="float32")))
    return out


def obj_facts(sr, scan_id):
    """observation_id → payload 里的事实字段（供 populate observations）。"""
    rows = E.rest(sr, f"scans?select=payload,updated_at&id=eq.{scan_id}")
    p = rows[0]["payload"]; h = p.get("homeos", p); observed = rows[0]["updated_at"]
    facts = {}
    for o in (h.get("placements", []) + h.get("fixtures", [])):
        a = o.get("attrs") or {}
        photos = a.get("photos") or ([{"path": a["photoPath"]}] if a.get("photoPath") else [])
        facts[o.get("id")] = {
            "kind": o.get("kind"), "label": o.get("label"),
            "dims": {k: a[k] for k in ("measuredWIn", "measuredHIn", "heightIn", "elevIn") if a.get(k) is not None},
            "color_hex": a.get("colorHex"), "color_confidence": a.get("colorConfidence"),
            "kind_confidence": a.get("kindConfidence"), "dhash": a.get("photoHash"),
            "photo_paths": [x["path"] for x in photos if x.get("path")],
            "azimuths": [x.get("azimuthDeg") for x in photos if x.get("path")],
            "observed_at": observed,
        }
    return facts


def locked_decisions(sr):
    """(scan_id, observation_id) → 整行,针对用户已在 P3 证据卡片裁决过的观察
    (match.userDecision 存在)。**matcher --apply 对这些行原样保留**——不拿重算结果
    冲掉用户裁决(认亲的 positive/hard-negative 得沉淀,不能每次精修就抹掉)。"""
    rows = E.rest(sr, "object_observations?select=scan_id,observation_id,canonical_object_id,match"
                      "&match->>userDecision=not.is.null")
    return {(r["scan_id"], r["observation_id"]): r for r in rows}


def best_pair(a_vecs, b_vecs):
    """两组向量的 best-pair 余弦（L2 归一化后余弦=点积），取最大对。"""
    import numpy as np
    A = np.stack([v for _, v in a_vecs]); B = np.stack([v for _, v in b_vecs])
    return float((A @ B.T).max())


def assign_one_to_one(objs, prior):
    """本扫描物体 → prior canonical 的**全局一对一(Hungarian)**分配。

    objs: [(oid, gallery, kind), ...]（已剔除共享裁剪件）。
    prior: {canonical_id: {kind, gallery, label}}，只含本扫描**之前**的 canonical。
    返回 {oid: {"candidates": [排序后候选], "match": (cid, score) | None}}。

    kind 硬门（不同 kind 不比）→ 全物体×全 canonical 打分矩阵 → linear_sum_assignment
    求最大总分的一对一指派 → 每对再过 MATCH_HIGH 阈值闸(低于阈值的指派丢回不认)。
    贪心逐件匹配会让同扫描两件抢同一 canonical;一对一从结构上杜绝。
    """
    import numpy as np
    from scipy.optimize import linear_sum_assignment
    result = {oid: {"candidates": [], "match": None} for oid, _, _ in objs}
    cids = list(prior.keys())
    n, m = len(objs), len(cids)
    if not n or not m:
        return result
    S = np.full((n, m), -1.0, dtype="float32")  # -1 = kind 不合/不可比
    for i, (oid, gallery, kind) in enumerate(objs):
        for j, cid in enumerate(cids):
            if prior[cid]["kind"] != kind:  # kind 硬门(spike:放族 94→76%)
                continue
            s = best_pair(gallery, prior[cid]["gallery"])
            S[i, j] = s
            # 契约同 types.js ObjectMatchDecision.candidates:{canonicalId,score,breakdown}。
            # 本 matcher 只有视觉一路信号,breakdown 就一项 vision;label 是便于证据卡片
            # 展示的务实附加字段(jsonb 容得下,消费方按需取)。
            result[oid]["candidates"].append(
                {"canonicalId": cid, "score": round(float(s), 4),
                 "breakdown": {"vision": round(float(s), 4)}, "label": prior[cid]["label"]})
        result[oid]["candidates"].sort(key=lambda x: -x["score"])
    # 最大化总分 = 最小化 -score;kind 不合处给大成本,不会被选中
    cost = np.where(S >= 0, -S, 1e3)
    rows, cols = linear_sum_assignment(cost)
    for i, j in zip(rows, cols):
        if S[i, j] >= MATCH_HIGH:  # 一对一里仍要过高置信闸才自动认
            result[objs[i][0]]["match"] = (cids[j], float(S[i, j]))
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all-iphone", action="store_true")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.all_iphone:
        ap.error("需 --all-iphone")

    sr = E.service_role_key()
    scans = iphone_scans(sr)
    locked = locked_decisions(sr)  # 用户 P3 裁决过的行,原样保留
    print(f"按时间序处理 {len(scans)} 次 iPhone 扫描" +
          (f"(其中 {len(locked)} 行用户已裁决,锁定不覆盖)" if locked else ""))

    # canonical 库:canonical_id → {kind, gallery:[(path,vec)], label}
    canon = {}
    obs_rows, emb_backfill = [], []  # 待写
    stats = {"observations": 0, "matched": 0, "new": 0, "shared_skip": 0, "possibly": 0, "locked": 0}

    for scan_id, _ in scans:
        embs = embeddings_for_scan(sr, scan_id)
        facts = obj_facts(sr, scan_id)
        # 共享裁剪(同扫描内不同物体向量近重复)标记 —— 这些不采信视觉
        shared = set()
        allv = [(oid, p, v) for oid, lst in embs.items() for p, v in lst]
        import numpy as np
        for i in range(len(allv)):
            for j in range(i + 1, len(allv)):
                if allv[i][0] != allv[j][0] and float(allv[i][2] @ allv[j][2]) > E.NEAR_DUP_COS:
                    shared.add(allv[i][0]); shared.add(allv[j][0])

        # 关键不变式:同一次扫描里两件是**不同的物理对象**,不能互相认亲。
        # 所以只跟**本次扫描之前**就存在的 canonical 比(prior 快照),本轮播种的
        # 新 canonical 不进比对池;再对 prior 做**全局一对一(Hungarian)**分配 ——
        # 避免同扫描两件都抢同一个旧 canonical(此前 2 把办公椅被并成一个的根因)。
        prior = dict(canon)
        visual_objs = [(oid, gallery, facts.get(oid, {}).get("kind"))
                       for oid, gallery in embs.items() if oid not in shared]
        assigned = assign_one_to_one(visual_objs, prior)

        for oid, gallery in embs.items():
            f = facts.get(oid, {})
            kind = f.get("kind")
            stats["observations"] += 1
            a = assigned.get(oid, {})
            candidates = a.get("candidates", [])
            match = a.get("match")  # (canonical_id, score) 或 None
            # 契约同 types.js ObjectMatchDecision.state:视觉 matcher 不评估位移,认亲即
            # "same"(移动与否交给几何 resolver);未认回的新件 = "added"(枚举无 "new")。
            state = "same" if match else ("possibly_same" if candidates and candidates[0]["score"] >= MATCH_MID else "added")
            if state == "possibly_same":
                stats["possibly"] += 1
            if match:
                cid = match[0]
                canon[cid]["gallery"] += gallery  # 累积多视角 gallery(喂后续扫描)
                stats["matched"] += 1
            else:
                cid = f"co-{scan_id[:8]}-{oid}"  # 播种新 canonical(确定式)
                canon[cid] = {"kind": kind, "gallery": list(gallery), "label": f.get("label")}
                if oid in shared:
                    stats["shared_skip"] += 1
                else:
                    stats["new"] += 1
            match_obj = {"state": state,
                         # chosenCanonicalId = 认回的**已有**身份;added/possibly 无(契约:added 时为空)
                         "chosenCanonicalId": cid if match else None,
                         "candidates": candidates[:5], "resolver": "global-assignment",
                         "modelVersion": E.MODEL_VERSION, "sharedCrop": oid in shared,
                         "score": round(match[1], 4) if match else None}
            # 用户裁决锁:这行在 P3 卡片上确认过 → 用库里存的 canonical + match 原样回写,
            # 不让本次重算覆盖(见 locked_decisions)。
            lock = locked.get((scan_id, oid))
            if lock:
                if lock.get("canonical_object_id"):
                    cid = lock["canonical_object_id"]
                if lock.get("match"):
                    match_obj = lock["match"]
                stats["locked"] += 1
            uid = gallery[0][0].split("/", 1)[0]
            obs_rows.append({
                "user_id": uid, "scan_id": scan_id, "observation_id": oid,
                "canonical_object_id": cid, "kind": kind, "label": f.get("label"),
                "dims": f.get("dims", {}), "color_hex": f.get("color_hex"),
                "color_confidence": f.get("color_confidence"), "kind_confidence": f.get("kind_confidence"),
                "dhash": f.get("dhash"), "photo_paths": f.get("photo_paths", []),
                "azimuths": [az for az in f.get("azimuths", []) if az is not None],
                "observed_at": f.get("observed_at", int(time.time() * 1000)),
                "match": match_obj,
                "v": 1,
            })
            for p, _ in gallery:
                emb_backfill.append({"user_id": uid, "photo_path": p, "canonical_object_id": cid})
            tag = f"→ {cid} @{match[1]:.3f}" if match else ("(共享裁剪,独立)" if oid in shared else "(新)")
            top = f" 最高 {candidates[0]['score']:.3f}«{candidates[0]['label']}»" if candidates else ""
            print(f"  [{scan_id[:8]}] {oid:6} {kind or '?':14} {state:13}{top} {tag if match else ''}")

    print(f"\n摘要: 观察 {stats['observations']} · 认回 {stats['matched']} · "
          f"新对象 {stats['new']} · 共享裁剪独立 {stats['shared_skip']} · "
          f"待复核(possibly) {stats['possibly']} · 用户锁定 {stats['locked']} · "
          f"最终 canonical {len(canon)}")

    if args.apply:
        # object_observations upsert(PK user_id,scan_id,observation_id)
        st1 = E.with_retry(lambda: _upsert(sr, "object_observations",
              "user_id,scan_id,observation_id", obs_rows), what="obs")
        # 回填 embeddings 的 canonical:向量行早由 embed_objects 写好(scan_id/embedding
        # 等 NOT NULL 都在),这里只**更新** canonical_object_id。必须走 PATCH(纯 UPDATE)——
        # upsert 的 INSERT 语义会拿缺列的元组过 NOT NULL 校验(即便终走 UPDATE),必炸
        # scan_id/embedding not-null。按 canonical 分组,一次 PATCH 一组 photo_path。
        by_canon = {}
        for r in emb_backfill:
            by_canon.setdefault(r["canonical_object_id"], []).append(r["photo_path"])
        st2 = 0
        for cid, paths in by_canon.items():
            E.with_retry(lambda cid=cid, paths=paths: _patch_canonical(sr, paths, cid), what="emb")
            st2 += len(paths)
        print(f"✔ 写库: object_observations {len(obs_rows)} 行 ({st1}) · "
              f"回填 canonical {st2} 行 / {len(by_canon)} 个身份 (PATCH)")
    else:
        print("dry-run(不写库)。写库加 --apply。")


def _upsert(sr, table, conflict, rows):
    if not rows:
        return "跳过"
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        f"https://{REF}.supabase.co/rest/v1/{table}?on_conflict={conflict}",
        data=body, method="POST",
        headers={"apikey": sr, "Authorization": f"Bearer {sr}",
                 "Content-Type": "application/json", "Content-Profile": "home",
                 "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=90, context=E.CTX) as r:
        return r.status


def _patch_canonical(sr, paths, cid):
    """把一组 photo_path 的 embedding 行的 canonical_object_id 更新成 cid(纯 UPDATE)。
    photo_path 全库唯一(PK 含它),用 in.(...) 一次更新一组;值含 / . -,双引号包起来
    避免 PostgREST 把逗号/括号当语法(路径无逗号,安全)。model_version 限定当前模型。"""
    quoted = ",".join('"' + p + '"' for p in paths)
    q = (f"object_embeddings?model_version=eq.{urllib.parse.quote(E.MODEL_VERSION)}"
         f"&photo_path=in.({urllib.parse.quote(quoted)})")
    req = urllib.request.Request(
        f"https://{REF}.supabase.co/rest/v1/{q}",
        data=json.dumps({"canonical_object_id": cid}).encode(), method="PATCH",
        headers={"apikey": sr, "Authorization": f"Bearer {sr}",
                 "Content-Type": "application/json", "Content-Profile": "home",
                 "Prefer": "return=minimal"})
    with urllib.request.urlopen(req, timeout=90, context=E.CTX) as r:
        return r.status


if __name__ == "__main__":
    main()
