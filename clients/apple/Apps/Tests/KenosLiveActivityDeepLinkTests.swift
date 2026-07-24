import XCTest
@testable import KenosIOS
#if canImport(ActivityKit)
import ActivityKit
#endif

/// 灵动岛/Live Activity 的**每会话深链**。用户报的 bug:点灵动岛去到了错误的
/// 训练日(练腹部却进了上肢)—— 根因是点击目标是静态通用链
/// `kenos://training/session`,经 resume 解析到「上一个挂起的会话」。修复让
/// web upsert 下发本会话的具体 `?path=` 深链,原生透传到 ContentState。
final class KenosLiveActivityDeepLinkTests: XCTestCase {

    func testSnapshotParsesKenosDeepLink() {
        let snap = KenosLiveActivityFoundation.Snapshot(dict: [
            "kind": "training",
            "title": "腹部",
            "subtitle": "3/5 sets",
            "deepLink": "kenos://training?path=/day/abs/focus",
        ])
        XCTAssertEqual(snap?.deepLink, "kenos://training?path=/day/abs/focus")
    }

    /// 非 kenos:// 一律拒绝(防注入任意 URL 到点击目标)。
    func testSnapshotRejectsNonKenosDeepLink() {
        for bad in ["https://evil.example/x", "javascript:alert(1)", "  ", "day/abs"] {
            let snap = KenosLiveActivityFoundation.Snapshot(dict: [
                "kind": "training", "title": "x", "subtitle": "y", "deepLink": bad,
            ])
            XCTAssertNil(snap?.deepLink, "不该接受非 kenos:// 深链: \(bad)")
        }
    }

    func testSnapshotMissingDeepLinkIsNil() {
        let snap = KenosLiveActivityFoundation.Snapshot(dict: [
            "kind": "training", "title": "x", "subtitle": "y",
        ])
        XCTAssertNil(snap?.deepLink)
    }

    #if canImport(ActivityKit)
    /// ContentState.tapURL:有具体链走具体链,无则回退到静态 kind 链。
    func testTapURLPrefersSessionDeepLink() {
        let fallback = URL(string: "kenos://training/session")!

        let withLink = KenosDomainActivityAttributes.ContentState(
            title: "腹部", subtitle: "3/5",
            deepLink: "kenos://training?path=/day/abs/focus"
        )
        XCTAssertEqual(
            withLink.tapURL(fallback: fallback).absoluteString,
            "kenos://training?path=/day/abs/focus"
        )

        let withoutLink = KenosDomainActivityAttributes.ContentState(
            title: "腹部", subtitle: "3/5"
        )
        XCTAssertEqual(withoutLink.tapURL(fallback: fallback), fallback)
    }
    #endif
}
