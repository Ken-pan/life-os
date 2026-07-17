import XCTest
import CoreImage
@testable import HomeScan

/// 抓拍配额满短路的纯判定(2026-07-16 真扫 gate_quotaFull=607 空转的修复)。
/// consider() 本体要 ARFrame 只能真机验,这里锁死门槛判定与短路条件。
final class ObjectShotCaptureTests: XCTestCase {

    // MARK: 主色 + 可信度

    private func shot(_ hex: String?, _ conf: Double) -> ObjectShotCapture.Shot {
        ObjectShotCapture.Shot(
            objectId: UUID(), category: "table", worldCenter: .zero, score: 1,
            photoFileURL: URL(fileURLWithPath: "/tmp/x.jpg"),
            colorHex: hex, colorConfidence: conf, azimuthDeg: 0, bin: 0
        )
    }

    func testDominantColorSolidIsConfident() {
        let img = CIImage(color: CIColor(red: 1, green: 0, blue: 0))
            .cropped(to: CGRect(x: 0, y: 0, width: 120, height: 120))
        let out = ObjectShotCapture().dominantColor(of: img)
        XCTAssertEqual(out?.hex, "#FF0000")
        XCTAssertGreaterThan(out?.confidence ?? 0, 0.9, "纯色物体主色应高可信")
    }

    func testHexParse() {
        XCTAssertEqual(ObjectShotCapture.rgb(fromHex: "#FF8000"), SIMD3(255, 128, 0))
        XCTAssertNil(ObjectShotCapture.rgb(fromHex: "nope"))
        XCTAssertNil(ObjectShotCapture.rgb(fromHex: "#GGGGGG"))
    }

    func testConsensusDropsOutlierCoverShot() {
        // 三张白 + 一张红(罩布只糊住一个方位)→ 共识回到白,红被离群丢掉
        let out = ObjectShotCapture.consensusColor([
            shot("#FAFAFA", 0.9), shot("#FFFFFF", 0.9),
            shot("#F5F5F5", 0.85), shot("#CC0000", 0.6),
        ])
        let rgb = ObjectShotCapture.rgb(fromHex: out!.hex)!
        XCTAssertGreaterThan(rgb.y, 230, "绿通道应仍是白,红离群被剔除")
        XCTAssertGreaterThan(out!.confidence, 0.7, "多张互证 → 高可信")
    }

    func testConsensusLowWhenViewsDisagree() {
        // 三张互相打架的色 → 没有共识,可信度低
        let out = ObjectShotCapture.consensusColor([
            shot("#FF0000", 0.5), shot("#00FF00", 0.5), shot("#0000FF", 0.5),
        ])
        XCTAssertNotNil(out)
        XCTAssertLessThan(out!.confidence, 0.4, "各方位色不一致 → 不敢信")
    }

    func testConsensusSingleShotCapped() {
        let out = ObjectShotCapture.consensusColor([shot("#123456", 0.95)])
        XCTAssertEqual(out?.hex, "#123456")
        XCTAssertEqual(out?.confidence ?? 0, 0.9, accuracy: 0.001, "单视角无互证,可信度封顶 0.9")
    }

    func testConsensusEmptyOrNoColorIsNil() {
        XCTAssertNil(ObjectShotCapture.consensusColor([]))
        XCTAssertNil(ObjectShotCapture.consensusColor([shot(nil, 0)]), "没抓到颜色 → nil,下游不显示颜色")
    }

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
