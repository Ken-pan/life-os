import Foundation

/// 自动机位「拍不拍」的判定 —— 纯函数(无 ARKit),模拟器单测全覆盖。
///
/// 为什么把它从 AutoViewpointCapture 里抽出来:原来六道门全是 `return`,
/// 每一道都静默。用户按 HUD 说的「退后、站稳」照做,却因为**另一道**门
/// (太暗 / 这个角度拍过了)被拒,屏幕上还是那句「站稳就会自动拍」——
/// 人唯一能做的事就是干等。实测卡死路径,而且无法自救。
///
/// 两条铁律:
/// 1. **拒绝必须有名字**(`Block`),HUD 照着它说人话 —— 让用户知道该干嘛。
/// 2. **不许有永久拒绝**:这间迟迟一张都没有时逐级放宽,最后无条件放行。
///    一张偏暗/偏冗余的照片,永远好过「这一区网页端完全瞎」。
enum ViewpointGate {
    /// 两张之间的最小间隔(秒)—— 防止走一步拍一张
    static let minIntervalS: TimeInterval = 6
    /// 视角新:与已有机位至少挪开这么远(米)
    static let minTravelM = 1.0
    /// 或者至少转开这么多度
    static let minHeadingDeltaDeg = 40.0
    /// 每间配额(面积未知时的退路)。真机教训:650 sqft 的开放式单间
    /// 也只给 4 张,人走快一点每个分区就剩 1 张 —— 网页端等于半瞎。
    static let fallbackQuota = 4
    /// 配额按面积伸缩:约每这么多 sqft 给 1 张
    static let sqftPerShot = 80.0
    /// 配额上下限:小卫生间 2 张就够,再大的房也别连拍成监控
    static let quotaRange = 2...6
    /// 环境光下限(lumen):暗光曝光长(糊)且白平衡漂(偏色)
    static let minAmbient = 250.0
    /// 相机角速度上限(rad/s):超了画面必糊
    static let maxAngularVelocity = 0.5

    /// 这间零照片、等到这么久 → 放宽「看得全」的要求(玄关/走廊没家具)
    static let starveRelaxFurnitureS: TimeInterval = 20
    /// …到这么久 → 光照与视角新度门槛同时放宽(小房间挪不开 1m)
    static let starveRelaxGatesS: TimeInterval = 25
    /// …到这么久 → 除了「糊」以外全部让路。没有照片比不完美的照片糟得多。
    static let starveForceS: TimeInterval = 40

    /// 被拒的原因 —— 每一个都对应一句「你该怎么办」
    enum Block: Equatable {
        /// 刚拍过,冷却中(短暂,不提示)
        case cooldown
        /// 配额满(这间够了,不提示)
        case quotaFull
        case shaky
        case dark
        /// 画面里数不出家具 —— 多半是怼着墙角
        case noFurniture
        /// 这个位置/朝向和已拍过的太像
        case notNovel
    }

    enum Verdict: Equatable {
        case capture
        case wait(Block)
    }

    /// 这间的配额:约每 80 sqft 1 张,夹在 [2, 6];面积拿不到退回 4。
    /// RoomPlan 的地板面积扫描中途才出得来,所以 nil 是常态,不是异常。
    static func quota(roomAreaSqFt: Double?) -> Int {
        guard let area = roomAreaSqFt, area > 0 else { return fallbackQuota }
        return min(max(Int((area / sqftPerShot).rounded()), quotaRange.lowerBound), quotaRange.upperBound)
    }

    struct Input {
        /// 环境光估计;nil = 拿不到(不因此拒绝)
        var lux: Double?
        var angularVelocity: Double
        /// 画面中央区能数出的家具件数
        var inViewCount: Int
        var capturedInRoom: Int
        /// 当前房间地板面积(sqft);nil = RoomPlan 还没给出地板 → 配额退 4
        var roomAreaSqFt: Double? = nil
        /// 进这间多久了
        var secondsInRoom: Double
        var secondsSinceLastCapture: Double
        /// 与最近的已有机位的距离/朝向差;nil = 还没有任何机位
        var nearestPoseDistanceM: Double?
        var nearestPoseHeadingDeltaDeg: Double?
    }

    static func evaluate(_ i: Input) -> Verdict {
        if i.capturedInRoom >= quota(roomAreaSqFt: i.roomAreaSqFt) { return .wait(.quotaFull) }
        if i.secondsSinceLastCapture < minIntervalS { return .wait(.cooldown) }
        // 糊是唯一不肯让步的:糊掉的整屋照片没得裁、没得救
        if i.angularVelocity > maxAngularVelocity { return .wait(.shaky) }

        // 这间还一张都没有 = 饿着。饿着的房间逐级放宽,别把人锁死在原地。
        let starving = i.capturedInRoom == 0
        if starving && i.secondsInRoom > starveForceS { return .capture }

        let luxFloor = starving && i.secondsInRoom > starveRelaxGatesS
            ? minAmbient * 0.5
            : minAmbient
        if let lux = i.lux, lux < luxFloor { return .wait(.dark) }

        // 本间第一张只要求 1 件家具入画,之后要 2 件(≈ 真的对着房间而不是墙角)
        let need = starving ? 1 : 2
        let skipFurniture = starving && i.secondsInRoom > starveRelaxFurnitureS
        if i.inViewCount < need && !skipFurniture { return .wait(.noFurniture) }

        // 视角新。饿着且等久了就把两个门槛都砍到四成 —— 小卫生间里
        // 「挪 1 米 + 转 40°」物理上做不到,不放宽就永远拍不上。
        let relax = starving && i.secondsInRoom > starveRelaxGatesS
        let travel = relax ? minTravelM * 0.4 : minTravelM
        let heading = relax ? minHeadingDeltaDeg * 0.4 : minHeadingDeltaDeg
        if let d = i.nearestPoseDistanceM,
           let dh = i.nearestPoseHeadingDeltaDeg,
           d < travel, dh < heading {
            return .wait(.notNovel)
        }
        return .capture
    }

    /// 拒绝 → HUD 人话。nil = 这个拒绝是短暂的/正常的,不该打扰用户。
    ///
    /// 「站稳就会自动拍」这种万金油提示是上一版卡死的元凶:它把
    /// **六种**不同的拒绝说成同一件事,而其中四种站到天亮也不会好。
    static func hintText(for block: Block) -> String? {
        switch block {
        case .cooldown, .quotaFull:
            return nil
        case .shaky:
            return "手机还在晃 —— 停下脚步,举稳一秒就会自动拍"
        case .dark:
            return "这里太暗,拍出来的颜色不可信 —— 开个灯,或换个亮些的角度"
        case .noFurniture:
            return "镜头里还看不到家具 —— 后退两步,让大半个房间进画面"
        case .notNovel:
            return "这个角度和拍过的太像 —— 换个角落站,或转个身"
        }
    }
}
