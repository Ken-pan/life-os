import Foundation

/// 主线程卡顿探针 —— 让「我把重活挪到后台了」这句话**自己拿出证据**。
///
/// 为什么需要它:`finishScanning` 那条路只有**真机 + 真实房间**才走得到
/// (模拟器没 LiDAR,RoomPlan 的 mergeAll 拿不到数据;mock 路径绕开了它)。
/// 也就是说单测覆盖不到、模拟器跑不到、截图看不见 —— 它是整个 App 里最贵的一段
/// (USDZ 导出一整套房子的网格是秒级的),偏偏也是最没法验证的一段。
///
/// 做法很笨但有效:在主 RunLoop 上每 100ms 打一次卡。主线程如果被同步重活占住,
/// 这个 timer **就轮不上**,下一次打卡会迟到。迟到多久 = 冻了多久。
/// 这是直接测「UI 有没有反应」,不是测「我以为它有反应」。
///
/// 只在 DEBUG 编译。用 print 而不是 os.Logger:`devicectl --console` 抓的是
/// stdout,os_log 走统一日志系统,那条路在这台机器上拉不下来(macOS 的
/// `log stream` 已经不支持 --device-name)。要的是能落到手边的证据。
final class MainThreadStallProbe {
    private let label: String
    #if DEBUG
    private var timer: Timer?
    private var lastTick = Date()
    private var worst: TimeInterval = 0
    private var started = Date()
    /// 超过这个就算「人能感觉到卡」。250ms 是个保守线:
    /// 低于它像"有点顿",高于它就是"这 App 是不是死了"。
    private let stallThreshold: TimeInterval = 0.25
    #endif

    init(label: String) {
        self.label = label
    }

    @MainActor
    func start() {
        #if DEBUG
        started = Date()
        lastTick = Date()
        worst = 0
        // 挂主 RunLoop:它和 UI 抢同一个线程 —— 这正是我们要测的
        let t = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self else { return }
            let now = Date()
            let gap = now.timeIntervalSince(self.lastTick)
            self.lastTick = now
            if gap > self.worst { self.worst = gap }
            if gap > self.stallThreshold {
                print("⚠️ [\(self.label)] 主线程卡了 \(Int(gap * 1000))ms")
            }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
        print("⏱ [\(label)] 开始")
        #endif
    }

    @MainActor
    func mark(_ step: String) {
        #if DEBUG
        print("⏱ [\(label)] \(String(format: "%.2f", Date().timeIntervalSince(started)))s → \(step)")
        #endif
    }

    @MainActor
    func stop() {
        #if DEBUG
        timer?.invalidate()
        timer = nil
        let total = Date().timeIntervalSince(started)
        let worstMs = Int(worst * 1000)
        let verdict = worst > stallThreshold
            ? "❌ 最长卡顿 \(worstMs)ms —— 重活还在主线程上"
            : "✅ 最长间隔 \(worstMs)ms(<\(Int(stallThreshold * 1000))ms)—— 主线程全程没被占住"
        print("⏱ [\(label)] 结束 · 总耗时 \(String(format: "%.2f", total))s · \(verdict)")
        #endif
    }
}
