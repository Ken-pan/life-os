import Foundation
import simd

/// 柜内扫描的几何核心 —— 六个引导点(左壁/右壁/内底/内顶/后壁/门框前沿)
/// 拟合内腔盒子,层板 y 值切分「层」。纯数学,无 ARKit 依赖,模拟器单测全覆盖。
///
/// 坐标:ARKit 世界系(y 朝上,米)。这次 AR 会话与主扫描不同世界系 ——
/// 绝对位置没有意义,**只有相对尺寸可信**;与户型的绑定靠 placementId。
enum ContainerGeometry {
    /// 引导测量的六个点(世界系)+ 相机水平前向样本(指向柜内)
    struct Taps {
        var left: SIMD3<Double>?
        var right: SIMD3<Double>?
        var bottom: SIMD3<Double>?
        var top: SIMD3<Double>?
        var back: SIMD3<Double>?
        var front: SIMD3<Double>?
        /// 打点时的相机水平前向(俯视 2D,已归一化) —— 平均后定开口朝向
        var forwards: [SIMD2<Double>] = []

        var complete: Bool {
            left != nil && right != nil && bottom != nil
                && top != nil && back != nil && front != nil
        }
    }

    /// 拟合出的内腔盒子
    struct InteriorBox {
        var widthM: Double   // 沿开口面的横向
        var depthM: Double   // 开口 → 后壁
        var heightM: Double  // 内底 → 内顶
        /// 开口朝向(俯视 2D,指向柜外/用户,归一化)
        var normal: SIMD2<Double>
        /// 横向轴(与 normal 垂直,归一化)
        var lateral: SIMD2<Double>
        var bottomY: Double
        var topY: Double
        /// 横向/进深方向上的投影区间(dot(p, lateral) / dot(p, normal))
        var lateralRange: ClosedRange<Double>
        var depthRange: ClosedRange<Double>
    }

    /// 内腔尺寸合法区间(米):比它小是误触,比它大是点到了柜外
    static let dimRange = 0.03...3.5
    /// 层板 y 合并容差:两次打点/两块锚点 4cm 内算同一块
    static let shelfMergeTol = 0.04
    /// 层板必须离内底/内顶这么远才算「层板」(贴着的就是底/顶本身)
    static let shelfEndMargin = 0.05

    /// 六点 → 内腔盒子。任何一维出 dimRange 返回 nil(引导用户重测)。
    /// 左右/顶底点错顺序无所谓 —— 全部按投影取 min/max。
    static func fitBox(_ taps: Taps) -> InteriorBox? {
        guard
            let left = taps.left, let right = taps.right,
            let bottom = taps.bottom, let top = taps.top,
            let back = taps.back, let front = taps.front,
            !taps.forwards.isEmpty
        else { return nil }

        // 开口朝向:相机前向指向柜内,取反、归一化
        var sum = SIMD2<Double>.zero
        for f in taps.forwards { sum += f }
        let len = simd_length(sum)
        guard len > 1e-9 else { return nil }
        let normal = -sum / len
        let lateral = SIMD2(-normal.y, normal.x)

        func flat(_ p: SIMD3<Double>) -> SIMD2<Double> { SIMD2(p.x, p.z) }
        let la = simd_dot(flat(left), lateral)
        let lb = simd_dot(flat(right), lateral)
        let na = simd_dot(flat(back), normal)
        let nb = simd_dot(flat(front), normal)
        let widthM = abs(lb - la)
        let depthM = abs(nb - na)
        let bottomY = min(bottom.y, top.y)
        let topY = max(bottom.y, top.y)
        let heightM = topY - bottomY

        guard dimRange.contains(widthM),
              dimRange.contains(depthM),
              dimRange.contains(heightM)
        else { return nil }

        return InteriorBox(
            widthM: widthM,
            depthM: depthM,
            heightM: heightM,
            normal: normal,
            lateral: lateral,
            bottomY: bottomY,
            topY: topY,
            lateralRange: min(la, lb)...max(la, lb),
            depthRange: min(na, nb)...max(na, nb)
        )
    }

    /// 打点过程中的「已测出几维」—— 边点边给用户看,点歪当场发现
    struct PartialDims {
        var widthM: Double?
        var depthM: Double?
        var heightM: Double?
    }

    static func partialDims(_ taps: Taps) -> PartialDims {
        var out = PartialDims()
        if let bottom = taps.bottom, let top = taps.top {
            out.heightM = abs(top.y - bottom.y)
        }
        guard !taps.forwards.isEmpty else { return out }
        var sum = SIMD2<Double>.zero
        for f in taps.forwards { sum += f }
        let len = simd_length(sum)
        guard len > 1e-9 else { return out }
        let normal = -sum / len
        let lateral = SIMD2(-normal.y, normal.x)
        func flat(_ p: SIMD3<Double>) -> SIMD2<Double> { SIMD2(p.x, p.z) }
        if let l = taps.left, let r = taps.right {
            out.widthM = abs(simd_dot(flat(r) - flat(l), lateral))
        }
        if let b = taps.back, let f = taps.front {
            out.depthM = abs(simd_dot(flat(f) - flat(b), normal))
        }
        return out
    }

    /// 内腔盒子的 12 条棱(世界系线段)—— AR 里画线框,用户一眼核对框没框对
    static func wireframeEdges(
        _ box: InteriorBox
    ) -> [(a: SIMD3<Double>, b: SIMD3<Double>)] {
        // 8 角:lateral × depth × y 各取区间两端
        func corner(_ l: Double, _ n: Double, _ y: Double) -> SIMD3<Double> {
            let flat = box.lateral * l + box.normal * n
            return SIMD3(flat.x, y, flat.y)
        }
        let ls = [box.lateralRange.lowerBound, box.lateralRange.upperBound]
        let ns = [box.depthRange.lowerBound, box.depthRange.upperBound]
        let ys = [box.bottomY, box.topY]
        var edges: [(SIMD3<Double>, SIMD3<Double>)] = []
        // 竖棱 ×4
        for l in ls {
            for n in ns {
                edges.append((corner(l, n, ys[0]), corner(l, n, ys[1])))
            }
        }
        // 横棱(沿 lateral)×4 + 进深棱(沿 normal)×4
        for y in ys {
            for n in ns {
                edges.append((corner(ls[0], n, y), corner(ls[1], n, y)))
            }
            for l in ls {
                edges.append((corner(l, ns[0], y), corner(l, ns[1], y)))
            }
        }
        return edges.map { (a: $0.0, b: $0.1) }
    }

    /// 一块层板面的位置与朝向(AR 半透明面):中心、绕 +y 的偏航角
    static func shelfPlacement(
        y: Double,
        box: InteriorBox
    ) -> (center: SIMD3<Double>, yawRad: Double) {
        let l = (box.lateralRange.lowerBound + box.lateralRange.upperBound) / 2
        let n = (box.depthRange.lowerBound + box.depthRange.upperBound) / 2
        let flat = box.lateral * l + box.normal * n
        // RealityKit 平面局部 +x 要对齐 box.lateral:绕 y 转 -atan2(lat.y, lat.x)
        return (SIMD3(flat.x, y, flat.y), -atan2(box.lateral.y, box.lateral.x))
    }

    /// 一个候选点(ARKit 水平面锚点中心/手动打点)是不是这个柜子的层板:
    /// y 在内腔中段、水平位置落在内腔脚印(允许小外扩)里。
    static func isShelfCandidate(
        _ p: SIMD3<Double>,
        box: InteriorBox,
        footprintMargin: Double = 0.10
    ) -> Bool {
        guard p.y > box.bottomY + shelfEndMargin,
              p.y < box.topY - shelfEndMargin else { return false }
        let flat = SIMD2(p.x, p.z)
        let l = simd_dot(flat, box.lateral)
        let n = simd_dot(flat, box.normal)
        return l >= box.lateralRange.lowerBound - footprintMargin
            && l <= box.lateralRange.upperBound + footprintMargin
            && n >= box.depthRange.lowerBound - footprintMargin
            && n <= box.depthRange.upperBound + footprintMargin
    }

    /// 层板 y 值集合(自动候选 + 手动打点)→ 去重排序。
    /// 4cm 内的合并成一块(取均值),超出内腔中段的丢弃。
    static func mergedShelfYs(_ ys: [Double], box: InteriorBox) -> [Double] {
        let valid = ys
            .filter { $0 > box.bottomY + shelfEndMargin && $0 < box.topY - shelfEndMargin }
            .sorted()
        var out: [[Double]] = []
        for y in valid {
            if var group = out.last, let last = group.last, y - last < shelfMergeTol {
                group.append(y)
                out[out.count - 1] = group
            } else {
                out.append([y])
            }
        }
        return out.map { $0.reduce(0, +) / Double($0.count) }
    }

    /// 层板切分出的「层」(自下而上;没有层板 = 一整层)
    struct Compartment {
        var level: Int
        /// 距内底(米)
        var y0M: Double
        var y1M: Double
        var heightM: Double { y1M - y0M }
    }

    static func compartments(shelfYs: [Double], box: InteriorBox) -> [Compartment] {
        let bounds = [box.bottomY] + mergedShelfYs(shelfYs, box: box) + [box.topY]
        var out: [Compartment] = []
        for i in 0..<(bounds.count - 1) {
            out.append(
                Compartment(
                    level: i,
                    y0M: bounds[i] - box.bottomY,
                    y1M: bounds[i + 1] - box.bottomY
                )
            )
        }
        return out
    }

    // MARK: - 上传契约

    /// `{uid}/{scanId}/container-{placementId}.json` 的内容(私有桶,与
    /// 扫描照片同路径前缀;契约文档见 apps/home/supabase/README.md)。
    /// 尺寸用英寸 —— 与 payload 的 attrs.heightIn 等一致。
    struct Payload: Codable {
        var formatVersion: Int = 1
        var scanId: String
        var placementId: String
        /// 冗余存人话名,查看 JSON 时不用回表对
        var placementLabel: String?
        var capturedAt: String
        var device: String
        /// 最终内腔尺寸(用户在确认页微调过的话就是调整值)
        var interiorIn: Dims
        /// 用户微调过才有:AR 原始实测(能力19 —— 修改值与原始测量都留)
        var measuredInteriorIn: Dims?
        /// 层板高度(相对内底,英寸,自下而上;始终是实测,不随微调缩放)
        var shelfHeightsIn: [Double]
        var compartments: [Level]
        var interiorVolumeL: Double
        /// 桶内路径(正面、斜侧;上传时回填)
        var photos: [String]

        struct Dims: Codable {
            var w: Double
            var d: Double
            var h: Double
        }

        struct Level: Codable {
            var level: Int
            var y0In: Double
            var y1In: Double
            var heightIn: Double
        }
    }

    static let mToIn = 1 / 0.0254

    /// 盒子 + 层板 → 上传 payload(photos 上传时回填)。
    /// `adjustedM` 传用户在确认页微调后的米制尺寸;确认页以整 cm 播种
    /// (舍入本身带来 ≤5mm 差),所以差 >6mm 才算真调过 ——
    /// interiorIn 用调整值、实测进 measuredInteriorIn,容积随最终值。
    static func payload(
        scanId: String,
        placementId: String,
        placementLabel: String?,
        capturedAt: String,
        device: String,
        box: InteriorBox,
        shelfYs: [Double],
        adjustedM: (w: Double, d: Double, h: Double)? = nil
    ) -> Payload {
        let levels = compartments(shelfYs: shelfYs, box: box)
        let round1 = { (v: Double) in (v * 10).rounded() / 10 }
        let dims = { (w: Double, d: Double, h: Double) in
            Payload.Dims(w: round1(w * mToIn), d: round1(d * mToIn), h: round1(h * mToIn))
        }
        let measured = dims(box.widthM, box.depthM, box.heightM)
        let final: (w: Double, d: Double, h: Double)
        var measuredKept: Payload.Dims?
        if let adj = adjustedM,
           abs(adj.w - box.widthM) > 0.006
            || abs(adj.d - box.depthM) > 0.006
            || abs(adj.h - box.heightM) > 0.006 {
            final = adj
            measuredKept = measured
        } else {
            final = (box.widthM, box.depthM, box.heightM)
            measuredKept = nil
        }
        return Payload(
            scanId: scanId,
            placementId: placementId,
            placementLabel: placementLabel,
            capturedAt: capturedAt,
            device: device,
            interiorIn: dims(final.w, final.d, final.h),
            measuredInteriorIn: measuredKept,
            shelfHeightsIn: mergedShelfYs(shelfYs, box: box)
                .map { round1(($0 - box.bottomY) * mToIn) },
            compartments: levels.map {
                .init(
                    level: $0.level,
                    y0In: round1($0.y0M * mToIn),
                    y1In: round1($0.y1M * mToIn),
                    heightIn: round1($0.heightM * mToIn)
                )
            },
            interiorVolumeL: (final.w * final.d * final.h * 1000 * 10).rounded() / 10,
            photos: []
        )
    }
}
