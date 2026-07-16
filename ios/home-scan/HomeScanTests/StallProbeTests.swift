import XCTest
@testable import HomeScan

/// 探针必须**真的抓得到卡顿** —— 否则它只是个永远说 OK 的摆设,
/// 而我们会拿着它的"通过"去相信一件没验证过的事。
final class StallProbeTests: XCTestCase {

    /// 故意把主线程占住,探针必须察觉
    @MainActor
    func testProbeDetectsRealStall() async {
        let probe = MainThreadStallProbe(label: "自检-故意卡")
        probe.start()
        // 让 timer 先跑起来
        try? await Task.sleep(for: .milliseconds(250))
        // 同步阻塞主线程 600ms —— timer 这段时间一次都轮不上
        Thread.sleep(forTimeInterval: 0.6)
        try? await Task.sleep(for: .milliseconds(250))
        probe.stop()
        // 这条主要靠控制台输出人工核对;能跑到这里说明探针不会自己崩
    }

    /// 不卡的时候别乱报
    @MainActor
    func testProbeQuietWhenMainThreadFree() async {
        let probe = MainThreadStallProbe(label: "自检-不卡")
        probe.start()
        // 全程 await,主线程随时可用
        for _ in 0..<5 { try? await Task.sleep(for: .milliseconds(100)) }
        probe.stop()
    }
}
