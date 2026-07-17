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

    // MARK: - 邻件占幅(叠放/紧邻件裁剪去歧义,2026-07-17)

    private func frame(_ id: UUID, _ r: CGRect) -> (id: UUID, rect: CGRect) { (id, r) }

    func testNeighborDominanceCleanCrop() {
        let me = UUID(), other = UUID()
        let crop = CGRect(x: 0, y: 0, width: 100, height: 100)
        // 邻件只压到角上一小块 → 占幅低,正常拍、出哈希
        let d = ObjectShotCapture.neighborDominance(
            crop: crop,
            objFrames: [frame(me, crop), frame(other, CGRect(x: 90, y: 90, width: 20, height: 20))],
            excluding: me
        )
        XCTAssertEqual(d, 0.01, accuracy: 0.001)
        XCTAssertLessThan(d, ObjectShotCapture.ambiguousHashFrac, "干净 crop:照常出哈希")
    }

    func testNeighborDominanceAmbiguousSkipsHash() {
        let me = UUID(), other = UUID()
        let crop = CGRect(x: 0, y: 0, width: 100, height: 100)
        // 邻件压掉 60% → 混进别件:仍存但不出哈希,不到拒拍线
        let d = ObjectShotCapture.neighborDominance(
            crop: crop,
            objFrames: [frame(me, crop), frame(other, CGRect(x: 0, y: 0, width: 100, height: 60))],
            excluding: me
        )
        XCTAssertEqual(d, 0.60, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(d, ObjectShotCapture.ambiguousHashFrac, "≥55%:skipHash")
        XCTAssertLessThan(d, ObjectShotCapture.rejectShotFrac, "<80%:仍拍,不拒")
    }

    func testNeighborDominanceRejectsWhenNeighborOwnsCrop() {
        let me = UUID(), other = UUID()
        let crop = CGRect(x: 0, y: 0, width: 100, height: 100)
        // 邻件几乎占满 crop(叠放件投影重合:两件不同柜子拿到同一裁剪的根因)→ 拒拍
        let d = ObjectShotCapture.neighborDominance(
            crop: crop,
            objFrames: [frame(me, crop), frame(other, CGRect(x: 0, y: 0, width: 100, height: 95))],
            excluding: me
        )
        XCTAssertGreaterThanOrEqual(d, ObjectShotCapture.rejectShotFrac, "≥80% 是别人 → 拒拍")
    }

    func testNeighborDominanceIgnoresSelfAndDisjoint() {
        let me = UUID()
        let crop = CGRect(x: 0, y: 0, width: 100, height: 100)
        // 只有自己 + 完全不相交的邻件 → 0(自己不算、不相交不算)
        let d = ObjectShotCapture.neighborDominance(
            crop: crop,
            objFrames: [frame(me, crop), frame(UUID(), CGRect(x: 200, y: 200, width: 50, height: 50))],
            excluding: me
        )
        XCTAssertEqual(d, 0, "自己不占、不相交的邻件不占")
    }

    func testDominanceBucketKeys() {
        // 固定桶(不随阈值走):QA 一扫看分布,升/降阈才有依据
        XCTAssertEqual(ObjectShotCapture.dominanceBucketKey(0.0), "dom_lt55")
        XCTAssertEqual(ObjectShotCapture.dominanceBucketKey(0.54), "dom_lt55")
        XCTAssertEqual(ObjectShotCapture.dominanceBucketKey(0.55), "dom_55_70")
        XCTAssertEqual(ObjectShotCapture.dominanceBucketKey(0.69), "dom_55_70")
        XCTAssertEqual(ObjectShotCapture.dominanceBucketKey(0.70), "dom_70_80")
        XCTAssertEqual(ObjectShotCapture.dominanceBucketKey(0.79), "dom_70_80")
        XCTAssertEqual(ObjectShotCapture.dominanceBucketKey(0.80), "dom_80_90", "拒拍线:落进拒拍桶")
        XCTAssertEqual(ObjectShotCapture.dominanceBucketKey(0.95), "dom_90_100")
        XCTAssertEqual(ObjectShotCapture.dominanceBucketKey(1.0), "dom_90_100")
    }

    // MARK: - dHash 与网页 photo-hash.js 逐位同源(2026-07-16)

    /// 同一 9×8 RGBA 像素向量,dhashBits 必须与网页 dhashFromImageData 输出一字不差。
    /// 期望值由 photo-hash.js 在 node 上对同一向量算出(furniture 侧单测同源)。
    func testDhashBitsMatchesWebVector() {
        // 灰度 v=(x*23 + y*13) & 0xff,R=G=B=v,A=255
        var pixels = [UInt8](repeating: 0, count: 9 * 8 * 4)
        for y in 0..<8 {
            for x in 0..<9 {
                let o = (y * 9 + x) * 4
                let v = UInt8((x * 23 + y * 13) & 0xff)
                pixels[o] = v; pixels[o + 1] = v; pixels[o + 2] = v; pixels[o + 3] = 255
            }
        }
        XCTAssertEqual(ObjectShotCapture.dhashBits(pixels, width: 9, height: 8),
                       "0000000000000101", "与网页 photo-hash.js 逐位一致")

        // 每行左→右递增 → 全 0(left<right)
        var inc = [UInt8](repeating: 255, count: 9 * 8 * 4)
        for y in 0..<8 {
            for x in 0..<9 {
                let o = (y * 9 + x) * 4
                let v = UInt8(x * 20)
                inc[o] = v; inc[o + 1] = v; inc[o + 2] = v
            }
        }
        XCTAssertEqual(ObjectShotCapture.dhashBits(inc, width: 9, height: 8),
                       "0000000000000000", "递增行全 0")

        // 尺寸不对 → nil(中立)
        XCTAssertNil(ObjectShotCapture.dhashBits([UInt8](repeating: 0, count: 8), width: 9, height: 8))
    }
}
