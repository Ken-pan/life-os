import XCTest
@testable import HomeScan

/// KindMaps.refineKind 的纯判定:RoomPlan 只有一个 table 类目,靠尺寸/高度把
/// 升降桌/书桌/折叠桌/餐桌分出来,分不清的压低 kindConfidence 让用户复核。
/// 细分 kind 必须都在下游 PLACEMENT_KINDS 里(standing_desk/desk/folding_table/table)。
final class KindRefinementTests: XCTestCase {

    func testStandingDeskByHeight() {
        // 台面高 42″ 远超餐桌/书桌(~30″)→ 升降桌,高可信(高度是强信号)
        let r = KindMaps.refineKind(
            kind: "table", label: "桌", styleZh: nil, confidence: "high",
            longIn: 60, shortIn: 30, heightIn: 42
        )
        XCTAssertEqual(r.kind, "standing_desk")
        XCTAssertGreaterThan(r.kindConfidence, 0.8)
    }

    func testFoldingTableByShape() {
        // 72×24、不高 → 又长又窄(长宽比 3.0)= 折叠桌
        let r = KindMaps.refineKind(
            kind: "table", label: "桌", styleZh: nil, confidence: "medium",
            longIn: 72, shortIn: 24, heightIn: 29
        )
        XCTAssertEqual(r.kind, "folding_table")
    }

    func testDeskCompactIsLowConfidence() {
        // 55×28、不高,长宽比 1.96(<2.2 不算折叠)→ 书桌,但几何猜的 → 低可信
        let r = KindMaps.refineKind(
            kind: "table", label: "桌", styleZh: nil, confidence: "medium",
            longIn: 55, shortIn: 28, heightIn: 30
        )
        XCTAssertEqual(r.kind, "desk")
        XCTAssertLessThan(r.kindConfidence, 0.7, "书桌 vs 折叠桌本就难分 → 留复核余地")
    }

    func testDiningKeptWhenStyled() {
        // RoomPlan 已判餐桌(styleZh 含「餐」)→ 不猜工作桌,下游 table 即餐桌,高可信
        let r = KindMaps.refineKind(
            kind: "table", label: "餐桌", styleZh: "餐桌", confidence: "high",
            longIn: 60, shortIn: 38, heightIn: 30
        )
        XCTAssertEqual(r.kind, "table")
        XCTAssertGreaterThanOrEqual(r.kindConfidence, 0.8)
    }

    func testAmbiguousTableStaysLowConfidence() {
        // 进深 36″(>30 不像书桌)、不高、无餐桌样式 → 保留餐桌但压到复核档
        let r = KindMaps.refineKind(
            kind: "table", label: "桌", styleZh: nil, confidence: "medium",
            longIn: 60, shortIn: 36, heightIn: 30
        )
        XCTAssertEqual(r.kind, "table")
        XCTAssertLessThanOrEqual(r.kindConfidence, 0.5)
    }

    func testNonTableUsesBaseConfidence() {
        // 非 table 不细化;low 置信度 → 低 kindConfidence
        let r = KindMaps.refineKind(
            kind: "sofa", label: "沙发", styleZh: "L形", confidence: "low",
            longIn: 84, shortIn: 36, heightIn: 32
        )
        XCTAssertEqual(r.kind, "sofa")
        XCTAssertLessThan(r.kindConfidence, 0.5)
    }

    func testConfidenceBaselineOrdering() {
        XCTAssertGreaterThan(
            KindMaps.kindConfidenceBase("high"), KindMaps.kindConfidenceBase("medium"))
        XCTAssertGreaterThan(
            KindMaps.kindConfidenceBase("medium"), KindMaps.kindConfidenceBase(nil))
        XCTAssertGreaterThan(
            KindMaps.kindConfidenceBase(nil), KindMaps.kindConfidenceBase("low"))
    }
}
