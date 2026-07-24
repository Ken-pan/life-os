import XCTest
@testable import KenosIOS

final class KorbenCaptureRouterTests: XCTestCase {
    func testPlainTextIsCaptureDraftNoHint() {
        let r = KorbenCaptureRouter.classify("随手记一个想法")
        XCTAssertEqual(r.intent, .captureDraft)
        XCTAssertNil(r.targetHint)
    }

    func testTimePhraseBecomesPlanCandidate() {
        let r = KorbenCaptureRouter.classify("明天上午 10点 跟进官网改版")
        XCTAssertEqual(r.intent, .planTaskCandidate)
        XCTAssertEqual(r.targetHint, "plan")
    }

    func testEnglishTimePhrase() {
        let r = KorbenCaptureRouter.classify("follow up tomorrow")
        XCTAssertEqual(r.intent, .planTaskCandidate)
    }

    func testDomainKeywordGivesHint() {
        XCTAssertEqual(KorbenCaptureRouter.classify("记录今晚的训练 深蹲 5x5").targetHint, "training")
        XCTAssertEqual(KorbenCaptureRouter.classify("买咖啡花了 32").targetHint, "money")
    }

    /// 「买」单字不构成记账信号 —— 「买跑鞋」是一件待办,不是一笔账。
    /// 真机实拍里它被判进财务,这条锁住修复后的门槛。
    func testFuturePurchaseIsNotMoney() {
        XCTAssertNil(KorbenCaptureRouter.classify("买跑鞋").targetHint)
        XCTAssertNil(KorbenCaptureRouter.classify("买点牛奶").targetHint)
        // 已发生的记账语气仍要认出来。
        XCTAssertEqual(KorbenCaptureRouter.classify("买了跑鞋 899").targetHint, "money")
        XCTAssertEqual(KorbenCaptureRouter.classify("这个月预算还剩多少").targetHint, "money")
    }

    func testAmbiguousDomainsDropHint() {
        // 训练 + 花费同现 → 歧义,宁可无倾向。
        let r = KorbenCaptureRouter.classify("健身房年卡花了 3000")
        XCTAssertNil(r.targetHint)
        XCTAssertEqual(r.intent, .captureDraft)
    }

    func testEmptyTextIsDraft() {
        XCTAssertEqual(KorbenCaptureRouter.classify("  ").intent, .captureDraft)
    }
}
