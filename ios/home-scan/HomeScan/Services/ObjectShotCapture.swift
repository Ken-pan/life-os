import Foundation
import ARKit
import RoomPlan
import CoreImage
import UIKit

/// 扫描中的家具自动抓拍:定时(见 ScanSessionController)拿当前 ARFrame 与
/// RoomPlan 的实时物体列表,给每件家具的「这一眼」打分 —— 全身入画、占幅适中、
/// 居中、光线够、相机没在甩 —— 分数明显超过已存最佳时,把它在画面里的
/// 包围框裁下来存成 JPEG,并顺手提一个主色。
///
/// 线程模型(ARKit 官方告诫:CVPixelBuffer 池被占住会掉帧甚至冻屏):
/// - `consider()` 在主线程跑,只做**纯数学打分**(每件 8 次投影,微秒级);
/// - 真正的裁剪/编码/提色丢到串行后台队列,`encodeBusy` 保证**同一时刻
///   至多保留 1 个 pixelBuffer**,忙时直接跳过这次抓拍(下个 tick 再看);
/// - `shots` 只在主线程读写。
///
/// 产物按 RoomPlan object UUID 存(同一件家具越扫越好),扫完在
/// StructureFlattener 里对回合并后的物体(identifier 优先,类目+距离兜底)。
final class ObjectShotCapture {
    struct Shot {
        var objectId: UUID
        var category: String
        /// 世界系俯视中心 (x, z),米 —— 合并后 identifier 变了靠它找回来
        var worldCenter: SIMD2<Double>
        var score: Double
        var photoFileURL: URL
        var colorHex: String?
        /// 清晰度(裁剪图灰度拉普拉斯方差;越大越清楚)。
        /// 角速度门控挡不住「手稳但对焦没跟上」的糊图,这个挡。
        var sharpness: Double = 0
        /// 拍摄方位:物体中心 → 相机的俯视角(度,0..360)。
        /// 多视角证据的核心 —— 一张照片看不出 L 形沙发的另一侧。
        var azimuthDeg: Double
        /// 方位桶(0-3,每 90° 一桶);同桶只留最佳,跨桶各留一张
        var bin: Int
    }

    /// 抓拍参数。挑「能看清整件家具」的帧:太小看不清颜色,太大只剩局部。
    static let minAreaRatio = 0.015
    static let maxEdgePx: CGFloat = 1024
    static let jpegQuality: CGFloat = 0.72
    /// 新分数要比已存最佳高出这个倍数才值得重拍(防止同分抖动来回写盘)
    static let improveFactor = 1.18
    /// 相机角速度超过它(rad/s)视为甩动,画面必糊,直接跳过这帧
    static let maxAngularVelocity = 0.7
    /// 环境光低于它(lumen)不抓拍:暗光下曝光时间长(糊)且白平衡漂(偏色)
    static let minAmbientIntensity: CGFloat = 250
    /// 清晰度下限(96px 灰度拉普拉斯方差):已有照片时,低于它的新图不许顶位;
    /// 桶里还空着则糊图也先留(有总比没有强,之后有清楚的自然顶掉)
    static let minSharpness = 15.0

    /// 只在主线程读写:objectId → (方位桶 → 该桶最佳一张)
    private(set) var shots: [UUID: [Int: Shot]] = [:]

    /// EvidenceGuide 当前锁定引导的目标 —— 本帧优先拍它。
    ///
    /// 没有它,HUD 喊「对准床」而抓拍每帧只挑**增益最大**的一件:床旁边
    /// 任何一件没拍过的家具都会把机会抢走,用户对准了也拍不上,HUD 就一直
    /// 喊同一句。引导说了话,抓拍就得认账 —— 这是两者唯一的耦合点。
    var priorityTarget: (objectId: UUID, bin: Int)?
    private let encodeQueue = DispatchQueue(label: "homescan.objectshot.encode", qos: .utility)
    /// 后台是否正拿着一个 pixelBuffer(至多 1 个 —— 保护 ARKit 缓冲池)
    private var encodeBusy = false
    private let ciContext = CIContext()
    private var lastCameraTransform: simd_float4x4?
    private var lastFrameTime: TimeInterval = 0

    /// 已有照片的家具件数(HUD 用)
    var count: Int { shots.count }

    /// 一件家具的证据包:分数降序(第一张 = 最佳,兼容单图消费方)
    func shotList(for objectId: UUID) -> [Shot] {
        (shots[objectId] ?? [:]).values.sorted { $0.score > $1.score }
    }

    /// 这一帧「取景达标了吗」—— HUD 的准星用它变绿:达标 = 下一拍就是它。
    /// 光有箭头指着还不够,用户得知道**已经对准了、可以停手了**。
    func isWellFramed(_ object: CapturedRoom.Object, in frame: ARFrame) -> Bool {
        framing(of: object, in: frame) != nil
    }

    /// 全部证据(压平),给 StructureFlattener 做合并后匹配
    var allShots: [Shot] { shots.values.flatMap { $0.values } }

    /// 只清索引不删文件 —— finishScanning 拿走 shots 后才 reset(),
    /// 上传还要读这些 JPEG;临时目录由系统回收。
    func reset() {
        shots = [:]
        lastCameraTransform = nil
        lastFrameTime = 0
    }

    /// 一次评估(主线程):对每件置信度不低的物体打分,值得就抓拍。
    /// 本帧只挑**提升最大**的一件送去编码 —— 一次一个 buffer。
    /// `session` 传入时用 12MP 带外高清帧(captureHighResolutionFrame)拍证据 ——
    /// 远处柜子的裁剪区像素数翻几倍,主色/清晰度/后续识别全受益;
    /// 拿不到(格式不支持/失败)回退视频帧,证据不断供。
    func consider(objects: [CapturedRoom.Object], frame: ARFrame, session: ARSession? = nil) {
        guard case .normal = frame.camera.trackingState else { return }

        // 暗光:曝光拉长必糊、白平衡漂移偏色,这帧的颜色不可信
        if let lux = frame.lightEstimate?.ambientIntensity, lux < Self.minAmbientIntensity {
            return
        }

        // 相机在甩 → 运动模糊,整帧作废
        let now = frame.timestamp
        if let last = lastCameraTransform, now > lastFrameTime {
            let w = angularDelta(last, frame.camera.transform) / (now - lastFrameTime)
            lastCameraTransform = frame.camera.transform
            lastFrameTime = now
            if w > Self.maxAngularVelocity { return }
        } else {
            lastCameraTransform = frame.camera.transform
            lastFrameTime = now
        }

        let imgW = frame.camera.imageResolution.width
        let imgH = frame.camera.imageResolution.height
        let camPos = SIMD2(
            Double(frame.camera.transform.columns.3.x),
            Double(frame.camera.transform.columns.3.z)
        )

        var best: (object: CapturedRoom.Object, rect: CGRect, score: Double, gain: Double, az: Double, bin: Int)?
        /// 引导锁定的那件这一帧能不能拍 —— 能就无条件用它顶掉增益冠军
        var priority: (object: CapturedRoom.Object, rect: CGRect, score: Double, gain: Double, az: Double, bin: Int)?
        for object in objects {
            // 低置信度**更需要**照片证据(508 真扫:7 件 low 全是零照片,网页端
            // 没法人工复核) —— 不再跳过,只抬高取景门槛防误检刷屏
            let minScore = object.confidence == .low ? 0.18 : 0.05
            guard let framing = framing(of: object, in: frame) else { continue }

            // 拍摄方位 → 90° 一桶;每桶独立竞争,凑齐多视角
            let center = topCenter(object)
            let azRaw = atan2(camPos.y - center.y, camPos.x - center.x) * 180 / .pi
            let az = azRaw < 0 ? azRaw + 360 : azRaw
            let bin = min(3, Int(az / 90))

            let current = shots[object.identifier]?[bin]?.score ?? 0
            // 位置仍在更新,顺手把已有各桶的中心记新(合并兜底匹配用)
            if shots[object.identifier] != nil {
                for key in shots[object.identifier]!.keys {
                    shots[object.identifier]![key]!.worldCenter = center
                }
            }

            guard framing.score > max(minScore, current * Self.improveFactor) else { continue }
            let gain = framing.score - current
            let hit = (object, framing.rect, framing.score, gain, az, bin)
            if let pt = priorityTarget, pt.objectId == object.identifier, pt.bin == bin {
                priority = hit
            }
            if best == nil || gain > best!.gain {
                best = hit
            }
        }
        // 引导正指着的那件优先 —— 让「对准它」这句话说话算数
        guard let pick = priority ?? best, !encodeBusy else { return }

        // 裁剪框:投影 bbox 外扩 12%,夹回画面
        let margin = 0.12 * max(pick.rect.width, pick.rect.height)
        let crop = pick.rect
            .insetBy(dx: -margin, dy: -margin)
            .intersection(CGRect(x: 0, y: 0, width: imgW, height: imgH))
            .integral
        guard crop.width >= 64, crop.height >= 64 else { return }

        encodeBusy = true
        let objectId = pick.object.identifier
        let category = String(describing: pick.object.category)
        let center = topCenter(pick.object)
        let score = pick.score
        let az = pick.az
        let bin = pick.bin
        let pixelBuffer = frame.capturedImage // 只带走 buffer,不留整个 ARFrame

        // 编码入口:视频帧与高清帧共用(高清帧分辨率不同,裁剪框按比例缩放)
        let encode: (CVPixelBuffer, CGRect, CGFloat) -> Void = { [weak self] buffer, cropRect, imageH in
            guard let self else { return }
            self.encodeQueue.async { [weak self] in
                guard let self else { return }
                let out = self.writeCrop(
                    pixelBuffer: buffer,
                    cropTopLeftOrigin: cropRect,
                    imageHeight: imageH,
                    objectId: objectId,
                    bin: bin
                )
                self.finishShot(
                    out: out, objectId: objectId, category: category,
                    center: center, score: score, az: az, bin: bin
                )
            }
        }

        if let session {
            // 高清帧几十 ms 后才到,取景框仍用打分那一帧的投影 —— 物体是静物,
            // 裁剪框带 12% 外扩,这点延迟吃得下
            session.captureHighResolutionFrame { hiFrame, _ in
                if let hiFrame {
                    let s = hiFrame.camera.imageResolution.width / imgW
                    let scaled = CGRect(
                        x: crop.origin.x * s, y: crop.origin.y * s,
                        width: crop.width * s, height: crop.height * s
                    ).integral
                    encode(hiFrame.capturedImage, scaled, imgH * s)
                } else {
                    encode(pixelBuffer, crop, imgH)
                }
            }
        } else {
            encode(pixelBuffer, crop, imgH)
        }
    }

    /// 编码完成的主线程收尾(视频/高清两条路共用)
    private func finishShot(
        out: (url: URL, colorHex: String?, sharpness: Double)?,
        objectId: UUID, category: String, center: SIMD2<Double>,
        score: Double, az: Double, bin: Int
    ) {
        DispatchQueue.main.async {
                self.encodeBusy = false
                guard let out else { return }
                if let existing = self.shots[objectId]?[bin] {
                    // 编码期间可能已有更好的一张进来(理论上 busy 挡住了;稳妥再比一次)
                    if existing.score > score { return }
                    // 取景分再高,糊图也不许顶掉已有的清楚图(对焦没跟上时常见)
                    if out.sharpness < Self.minSharpness,
                       existing.sharpness >= out.sharpness { return }
                }
                // 新方位第一次拍到 → 轻触一下:用户不用盯 HUD 也知道「这件拍上了」。
                // 只在新桶响,顶替更好一张的静默 —— 否则同一件家具嗒嗒响个不停
                if self.shots[objectId]?[bin] == nil {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    ScanLog.shared.counter { $0.count("object_shot_bins") }
                }
                // 每张真正入库的证据照都留档:分数/清晰度分布是打分门槛
                // (minScore/minSharpness)长期调优的数据底座
                ScanLog.shared.log("scan", "shot_stored", [
                    "category": .string(category),
                    "bin": .num(Double(bin)),
                    "score": .num((score * 100).rounded() / 100),
                    "sharpness": .num((out.sharpness * 100).rounded() / 100),
                    "replaced": .bool(self.shots[objectId]?[bin] != nil),
                ])
                self.shots[objectId, default: [:]][bin] = Shot(
                    objectId: objectId,
                    category: category,
                    worldCenter: center,
                    score: score,
                    photoFileURL: out.url,
                    colorHex: out.colorHex,
                    sharpness: out.sharpness,
                    azimuthDeg: (az * 10).rounded() / 10,
                    bin: bin
                )
        }
    }

    // MARK: - 打分

    private struct Framing {
        var rect: CGRect  // capturedImage 像素系,原点左上
        var score: Double
    }

    /// 物体 3D 包围盒 8 角投影进画面 → 可见度 × 占幅 × 居中 的综合分。
    /// projectPoint 用 .landscapeRight + imageResolution —— 与 capturedImage
    /// 的传感器原生朝向一致,产出即像素坐标(原点左上)。
    private func framing(of object: CapturedRoom.Object, in frame: ARFrame) -> Framing? {
        let t = object.transform
        let half = object.dimensions / 2
        let camInv = frame.camera.transform.inverse
        let res = frame.camera.imageResolution

        var pts: [CGPoint] = []
        var inFront = 0
        for sx: Float in [-1, 1] {
            for sy: Float in [-1, 1] {
                for sz: Float in [-1, 1] {
                    let world = t * SIMD4(sx * half.x, sy * half.y, sz * half.z, 1)
                    let cam = camInv * world
                    if cam.z < -0.1 { inFront += 1 }
                    let p = frame.camera.projectPoint(
                        SIMD3(world.x, world.y, world.z),
                        orientation: .landscapeRight,
                        viewportSize: res
                    )
                    pts.append(p)
                }
            }
        }
        // 有角在身后:投影会翻转乱飞,这帧不可用
        guard inFront == 8 else { return nil }

        let xs = pts.map(\.x)
        let ys = pts.map(\.y)
        let raw = CGRect(
            x: xs.min()!, y: ys.min()!,
            width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!
        )
        let full = CGRect(x: 0, y: 0, width: res.width, height: res.height)
        let vis = raw.intersection(full)
        guard !vis.isNull, raw.width > 0, raw.height > 0 else { return nil }

        // 可见比例:框被画面裁掉越多越差
        let visFrac = Double((vis.width * vis.height) / (raw.width * raw.height))
        guard visFrac > 0.55 else { return nil }

        // 占幅:2%~50% 之间最好(太小看不清,太大只剩局部)
        let areaRatio = Double((vis.width * vis.height) / (full.width * full.height))
        guard areaRatio > Self.minAreaRatio else { return nil }
        let areaScore: Double
        switch areaRatio {
        case ..<0.06: areaScore = areaRatio / 0.06
        case ..<0.5: areaScore = 1
        default: areaScore = max(0.3, 1 - (areaRatio - 0.5))
        }

        // 居中:框中心离画面中心越近越好
        let dx = Double(vis.midX - full.midX) / Double(full.width / 2)
        let dy = Double(vis.midY - full.midY) / Double(full.height / 2)
        let centerScore = 0.5 + 0.5 * max(0, 1 - (dx * dx + dy * dy).squareRoot())

        return Framing(rect: vis, score: visFrac * areaScore * centerScore)
    }

    /// 物体俯视中心 (x, z)
    private func topCenter(_ object: CapturedRoom.Object) -> SIMD2<Double> {
        SIMD2(Double(object.transform.columns.3.x), Double(object.transform.columns.3.z))
    }

    /// 两个位姿的旋转差(弧度)
    private func angularDelta(_ a: simd_float4x4, _ b: simd_float4x4) -> Double {
        let qa = simd_quatf(simd_float3x3(
            SIMD3(a.columns.0.x, a.columns.0.y, a.columns.0.z),
            SIMD3(a.columns.1.x, a.columns.1.y, a.columns.1.z),
            SIMD3(a.columns.2.x, a.columns.2.y, a.columns.2.z)
        ))
        let qb = simd_quatf(simd_float3x3(
            SIMD3(b.columns.0.x, b.columns.0.y, b.columns.0.z),
            SIMD3(b.columns.1.x, b.columns.1.y, b.columns.1.z),
            SIMD3(b.columns.2.x, b.columns.2.y, b.columns.2.z)
        ))
        let d = abs((qa.inverse * qb).angle)
        return Double(d > .pi ? 2 * .pi - d : d)
    }

    // MARK: - 裁剪落盘 + 主色(后台队列)

    /// projectPoint 的坐标原点在左上,CIImage 在左下 —— 这里翻转 y。
    /// 每件家具固定文件名(重拍原地覆盖,不攒垃圾)。
    private func writeCrop(
        pixelBuffer: CVPixelBuffer,
        cropTopLeftOrigin crop: CGRect,
        imageHeight: CGFloat,
        objectId: UUID,
        bin: Int
    ) -> (url: URL, colorHex: String?, sharpness: Double)? {
        let ciCrop = CGRect(
            x: crop.origin.x,
            y: imageHeight - crop.origin.y - crop.height,
            width: crop.width,
            height: crop.height
        )
        var image = CIImage(cvPixelBuffer: pixelBuffer).cropped(to: ciCrop)
        let colorHex = dominantColorHex(of: image)
        let sharpness = laplacianVariance(of: image)

        // 竖持方向 + 限长边
        image = image.oriented(.right)
        let longEdge = max(image.extent.width, image.extent.height)
        if longEdge > Self.maxEdgePx {
            let scale = Self.maxEdgePx / longEdge
            image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        }
        guard
            let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
            let data = ciContext.jpegRepresentation(
                of: image,
                colorSpace: colorSpace,
                options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: Self.jpegQuality]
            )
        else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("obj-\(objectId.uuidString.lowercased())-b\(bin).jpg")
        do {
            try data.write(to: url, options: .atomic)
            return (url, colorHex, sharpness)
        } catch {
            return nil
        }
    }

    /// 清晰度:灰度拉普拉斯方差(长边缩到 96px 再算,糊图纹理被抹平 → 方差小)。
    /// 后台队列跑,9k 像素级别,微秒–毫秒级。
    private func laplacianVariance(of image: CIImage) -> Double {
        guard image.extent.width > 8, image.extent.height > 8 else { return 0 }
        let target = 96.0
        let scale = target / Double(max(image.extent.width, image.extent.height))
        let small = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let w = max(8, Int(small.extent.width.rounded(.down)))
        let h = max(8, Int(small.extent.height.rounded(.down)))
        var pixels = [UInt8](repeating: 0, count: w * h * 4)
        ciContext.render(
            small,
            toBitmap: &pixels,
            rowBytes: w * 4,
            bounds: CGRect(
                x: small.extent.origin.x, y: small.extent.origin.y,
                width: CGFloat(w), height: CGFloat(h)
            ),
            format: .RGBA8,
            colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
        )
        var luma = [Double](repeating: 0, count: w * h)
        for i in 0..<(w * h) {
            let o = i * 4
            luma[i] = 0.299 * Double(pixels[o]) + 0.587 * Double(pixels[o + 1]) + 0.114 * Double(pixels[o + 2])
        }
        var sum = 0.0
        var sum2 = 0.0
        var n = 0
        for y in 1..<(h - 1) {
            for x in 1..<(w - 1) {
                let i = y * w + x
                let lap = 4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - w] - luma[i + w]
                sum += lap
                sum2 += lap * lap
                n += 1
            }
        }
        guard n > 0 else { return 0 }
        let mean = sum / Double(n)
        return sum2 / Double(n) - mean * mean
    }

    /// 主色:只采样**中央 72% 区域**(裁剪框带 12% 外扩,中央基本是物体本体),
    /// 过滤过曝/欠曝像素(反光高光和阴影都不是家具的颜色),
    /// 再做 k-means(k=3,最远点确定性初始化 —— k-means++ 思路)取最大簇。
    /// 平均色会把棕沙发+白墙混成脏灰,聚类 + 采样收紧才拿得到「这件家具的颜色」。
    func dominantColorHex(of image: CIImage) -> String? {
        let inset = 0.14 // 每边收 14% ≈ 中央 72%
        let inner = image.extent.insetBy(
            dx: image.extent.width * inset,
            dy: image.extent.height * inset
        )
        let src = inner.width >= 8 && inner.height >= 8 ? image.cropped(to: inner) : image

        let side = 20
        let scaleX = CGFloat(side) / src.extent.width
        let scaleY = CGFloat(side) / src.extent.height
        let small = src.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))
        var pixels = [UInt8](repeating: 0, count: side * side * 4)
        ciContext.render(
            small,
            toBitmap: &pixels,
            rowBytes: side * 4,
            bounds: CGRect(
                x: small.extent.origin.x, y: small.extent.origin.y,
                width: CGFloat(side), height: CGFloat(side)
            ),
            format: .RGBA8,
            colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
        )
        var all: [SIMD3<Double>] = []
        all.reserveCapacity(side * side)
        for i in stride(from: 0, to: pixels.count, by: 4) {
            all.append(SIMD3(Double(pixels[i]), Double(pixels[i + 1]), Double(pixels[i + 2])))
        }
        guard !all.isEmpty else { return nil }

        // 过曝(反光)/欠曝(阴影)不是家具本色;滤太狠(剩 <30%)就退回全量
        let usable = all.filter { p in
            let luma = 0.299 * p.x + 0.587 * p.y + 0.114 * p.z
            return luma > 16 && luma < 240
        }
        let samples = usable.count >= all.count * 3 / 10 ? usable : all

        // 最远点初始化(确定性):c0=首样本,c1=离 c0 最远,c2=离 {c0,c1} 最远
        var centers = [samples[0]]
        while centers.count < 3 {
            var farthest = samples[0]
            var farD = -1.0
            for s in samples {
                let d = centers.map { simd_length_squared(s - $0) }.min()!
                if d > farD {
                    farD = d
                    farthest = s
                }
            }
            centers.append(farthest)
        }

        var assign = [Int](repeating: 0, count: samples.count)
        for _ in 0..<8 {
            for (i, s) in samples.enumerated() {
                var bi = 0
                var bd = Double.infinity
                for (c, center) in centers.enumerated() {
                    let d = simd_length_squared(s - center)
                    if d < bd { bd = d; bi = c }
                }
                assign[i] = bi
            }
            var sums = [SIMD3<Double>](repeating: .zero, count: 3)
            var counts = [Int](repeating: 0, count: 3)
            for (i, s) in samples.enumerated() {
                sums[assign[i]] += s
                counts[assign[i]] += 1
            }
            for c in 0..<3 where counts[c] > 0 {
                centers[c] = sums[c] / Double(counts[c])
            }
        }
        var counts = [Int](repeating: 0, count: 3)
        for a in assign { counts[a] += 1 }
        let biggest = counts.firstIndex(of: counts.max()!)!
        let c = centers[biggest]
        return String(
            format: "#%02X%02X%02X",
            Int(c.x.rounded()), Int(c.y.rounded()), Int(c.z.rounded())
        )
    }
}
