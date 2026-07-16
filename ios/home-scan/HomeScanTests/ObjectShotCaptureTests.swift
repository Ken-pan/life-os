import XCTest
@testable import HomeScan

/// 抓拍配额满短路的纯判定(2026-07-16 真扫 gate_quotaFull=607 空转的修复)。
/// consider() 本体要 ARFrame 只能真机验,这里锁死门槛判定与短路条件。
final class ObjectShotCaptureTests: XCTestCase {
    func testQuotaFullPerObject() {
        XCTAssertFalse(ObjectShotCapture.quotaFull(binsCovered: 0))
        XCTAssertFalse(ObjectShotCapture.quotaFull(binsCovered: 3), "还有空桶就继续打分")
        XCTAssertTrue(ObjectShotCapture.quotaFull(binsCovered: 4), "4 桶齐 = 配额满,跳过打分")
        XCTAssertEqual(ObjectShotCapture.binCount, 4, "每 90° 一桶的桶数是打分/引导共同前提")
    }

    func testAllQuotasFullShortCircuit() {
        XCTAssertFalse(ObjectShotCapture.allQuotasFull(binsCovered: []),
                       "空列表不算满:没家具的帧不该走这条短路")
        XCTAssertFalse(ObjectShotCapture.allQuotasFull(binsCovered: [4, 4, 3]),
                       "还有一件没满就不能整体短路")
        XCTAssertTrue(ObjectShotCapture.allQuotasFull(binsCovered: [4, 4, 4]))
    }
}
