import XCTest
@testable import KenosIOS

/// P1-3 Canvas 拆分。这层的风险不是"拆得不够聪明",而是**吞掉用户写的东西** ——
/// 下面一半的用例锁的是这条。
final class KorbenCanvasCompositionTests: XCTestCase {

    func testSingleLineStaysOneItem() {
        let items = KorbenCanvasComposition.parse("买跑鞋")
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items[0].text, "买跑鞋")
    }

    func testBlankLinesAreDropped() {
        let items = KorbenCanvasComposition.parse("A\n\n  \nB")
        XCTAssertEqual(items.map(\.text), ["A", "B"])
    }

    func testBulletMarkersAreStripped() {
        let items = KorbenCanvasComposition.parse("- A\n* B\n• C\n1. D\n2) E")
        XCTAssertEqual(items.map(\.text), ["A", "B", "C", "D", "E"])
    }

    /// 不许把正文里的连字符/年份当清单符号吃掉。
    func testNonListHyphensAndNumbersSurvive() {
        let items = KorbenCanvasComposition.parse("跨-应用同步\n2026. 计划")
        XCTAssertEqual(items.map(\.text), ["跨-应用同步", "2026. 计划"])
    }

    /// 每条各自分类 —— 整段一起分类会让「明天…」的时间语义被其它行淹掉。
    func testEachLineIsClassifiedIndependently() {
        let items = KorbenCanvasComposition.parse("买跑鞋\n明天下午过一遍预算")
        XCTAssertEqual(items.count, 2)
        XCTAssertEqual(items[1].routing.intent, .planTaskCandidate)
    }

    /// 超出上限**并入最后一条**,一个字都不能丢。
    func testOverflowIsMergedNotDropped() {
        let lines = (1...25).map { "第\($0)条" }
        let items = KorbenCanvasComposition.parse(lines.joined(separator: "\n"))
        XCTAssertEqual(items.count, KorbenCanvasComposition.maxItems)
        let all = items.map(\.text).joined(separator: "\n")
        for line in lines {
            XCTAssertTrue(all.contains(line), "\(line) 被静默丢弃了")
        }
    }

    func testEmptyInputProducesNothing() {
        XCTAssertTrue(KorbenCanvasComposition.parse("   \n\n ").isEmpty)
    }

    func testSummaryReportsCountAndRoutedShare() {
        let items = KorbenCanvasComposition.parse("买跑鞋\n明天下午过一遍预算")
        let s = KorbenCanvasComposition.summary(items: items, chinese: true)
        XCTAssertTrue(s.contains("2 条"), s)
        XCTAssertTrue(s.contains("识别去向"), s)
    }

    func testSummaryForSingleItemDoesNotBrag() {
        let items = KorbenCanvasComposition.parse("买跑鞋")
        XCTAssertEqual(
            KorbenCanvasComposition.summary(items: items, chinese: true),
            "将创建 1 条草稿"
        )
    }
}
