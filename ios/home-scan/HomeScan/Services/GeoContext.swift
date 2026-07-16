import CoreLocation
import Foundation

/// 扫描现场的地理上下文:GPS 定位一次到位,罗盘全程采样。
///
/// 为什么在扫描时采:网页端的「阳光模拟」要经纬度/海拔算太阳角、要
/// 平面图北向定窗户朝向 —— 这些数据人站在现场时唾手可得,回到网页端
/// 就只能手填。扫描本来就要举着手机走遍全屋,顺手把地理上下文带回来。
///
/// 罗盘的室内读数会被钢结构/家电磁铁带偏(网页端 compass.js 同款教训),
/// 处理原则:
///   1. 全程采样,配对「罗盘真北航向 ↔ 同一瞬间相机在扫描坐标系里的朝向」,
///      得到一批「场景系 → 真北」的偏移角样本;
///   2. 精度差的样本(headingAccuracy > 30° 或无效)直接丢;
///   3. 圆均值聚合(角度不能算术平均:359° 和 1° 的均值是 0° 不是 180°);
///   4. 产出只当**初值**:网页端仅在北向未校准时回填,用户随时可改。
/// 非 @MainActor:CLLocationManager 在创建线程(主线程)回调,采样也来自
/// 主线程的帧定时器 —— 全程单线程访问,加隔离只会跟 ScanSessionController
/// 的非隔离定时器闭包打架。
final class GeoContext: NSObject, CLLocationManagerDelegate {
    /// 一次扫描的地理摘要。offsetDeg 为空 = 罗盘样本不够,只有 GPS。
    struct Summary {
        var lat: Double
        var lon: Double
        var elevM: Double?
        var horizAccM: Double?
        /// 场景系航向 → 真实方位角的偏移:bearing = sceneYaw + offsetDeg
        var offsetDeg: Double?
        /// 有效罗盘样本的精度中位数(度)
        var headingAccDeg: Double?
        var headingSamples: Int
    }

    private let manager = CLLocationManager()
    private var latestHeading: CLHeading?
    private var bestLocation: CLLocation?
    /// (offsetDeg, headingAccuracy) 有效样本
    private var samples: [(deg: Double, acc: Double)] = []
    private var running = false

    /// 罗盘精度差于此的样本不要 —— 钢结构旁的读数能偏 60°+,混进来毒化圆均值
    private static let maxHeadingAccDeg = 30.0
    /// 罗盘读数比相机帧旧于此就不配对(转身瞬间两者会脱节)
    private static let maxPairAgeS = 1.5
    /// 至少凑够这么多有效样本才敢给北向初值
    private static let minSamples = 6

    func start() {
        guard !running else { return }
        running = true
        manager.delegate = self
        // 扫描全程竖持(Info.plist 锁 Portrait),罗盘航向按竖持机头方向读
        manager.headingOrientation = .portrait
        manager.desiredAccuracy = kCLLocationAccuracyBest
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        manager.startUpdatingLocation()
        if CLLocationManager.headingAvailable() {
            manager.headingFilter = 2
            manager.startUpdatingHeading()
        }
    }

    func stop() {
        guard running else { return }
        running = false
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
    }

    /// 由扫描的帧定时器调用:相机此刻在场景系(x 右、z 作 y 向下,
    /// yaw 0=场景上方、顺时针)的水平朝向。与最近的罗盘读数配对出一个偏移样本。
    func recordSample(cameraSceneYawDeg: Double) {
        guard let h = latestHeading else { return }
        guard h.trueHeading >= 0, h.headingAccuracy >= 0,
              h.headingAccuracy <= Self.maxHeadingAccDeg,
              Date().timeIntervalSince(h.timestamp) <= Self.maxPairAgeS
        else { return }
        let offset = Self.normalizeDeg(h.trueHeading - cameraSceneYawDeg)
        samples.append((deg: offset, acc: h.headingAccuracy))
    }

    /// 扫描结束时取摘要;没拿到定位返回 nil(纯室内深处 GPS 可能全程拿不到)。
    func summary() -> Summary? {
        guard let loc = bestLocation else { return nil }
        var offsetDeg: Double? = nil
        var accDeg: Double? = nil
        if samples.count >= Self.minSamples {
            // 圆均值:角度转单位向量求和再回角度
            var sx = 0.0
            var sy = 0.0
            for s in samples {
                let r = s.deg * .pi / 180
                sx += cos(r)
                sy += sin(r)
            }
            if sx * sx + sy * sy > 0.01 {
                offsetDeg = Self.normalizeDeg(atan2(sy, sx) * 180 / .pi)
                let sorted = samples.map(\.acc).sorted()
                accDeg = sorted[sorted.count / 2]
            }
        }
        return Summary(
            lat: loc.coordinate.latitude,
            lon: loc.coordinate.longitude,
            elevM: loc.verticalAccuracy >= 0 ? loc.altitude : nil,
            horizAccM: loc.horizontalAccuracy >= 0 ? loc.horizontalAccuracy : nil,
            offsetDeg: offsetDeg,
            headingAccDeg: accDeg,
            headingSamples: samples.count
        )
    }

    static func normalizeDeg(_ d: Double) -> Double {
        let m = d.truncatingRemainder(dividingBy: 360)
        return m < 0 ? m + 360 : m
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(
        _ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]
    ) {
        guard let loc = locations.last, loc.horizontalAccuracy >= 0 else { return }
        // 留最准的一发 —— 公寓楼里 GPS 精度起伏大,别让晚到的差读数顶掉好的
        if let best = bestLocation,
           best.horizontalAccuracy <= loc.horizontalAccuracy {
            return
        }
        bestLocation = loc
    }

    func locationManager(
        _ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading
    ) {
        latestHeading = newHeading
    }

    func locationManager(
        _ manager: CLLocationManager, didFailWithError error: Error
    ) {
        // 拿不到定位不是错误路径:摘要为 nil,payload 里就没有 geo,网页端照旧
    }
}
