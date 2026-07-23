import XCTest
import KenosDesign
@testable import KenosIOS

/// 锁住底部遮挡的**共享计算**(Today 与 Domain 同源)——
/// 防止后续 dock 高度 / 安全区 / 胶囊尺寸变化时再次出现「最后一项被压」回归。
final class KorbenShellMetricsTests: XCTestCase {
    /// Kenos 态(无域胶囊):遮挡 = Orb/Dock 行高 + 距安全区间距 + 呼吸。
    func testKenosObstructionComposition() {
        let expected = max(KorbenShellMetrics.intentDockHeight, KorbenShellMetrics.minHitTarget)
            + KorbenShellMetrics.bottomSafeAreaGap
            + KorbenShellMetrics.contentBreathingRoom
        XCTAssertEqual(KorbenShellMetrics.bottomObstruction(hasDomainCapsule: false), expected)
    }

    /// 域态再加一层胶囊行 + 两层间距。
    func testDomainObstructionAddsCapsuleRow() {
        let kenos = KorbenShellMetrics.bottomObstruction(hasDomainCapsule: false)
        let domain = KorbenShellMetrics.bottomObstruction(hasDomainCapsule: true)
        XCTAssertEqual(
            domain - kenos,
            KorbenShellMetrics.domainCapsuleRowHeight + KorbenShellMetrics.chromeRowGap
        )
    }

    /// Orb 命中框(60)高于 Dock(56)——遮挡必须按较大者算,否则少 4pt。
    func testUsesTallerOfOrbHitAndDock() {
        XCTAssertGreaterThanOrEqual(KorbenShellMetrics.minHitTarget, KorbenShellMetrics.intentDockHeight)
        XCTAssertGreaterThanOrEqual(
            KorbenShellMetrics.bottomObstruction(hasDomainCapsule: false),
            KorbenShellMetrics.minHitTarget
        )
    }

    /// 传给 web 的是**差额**(chrome 枚举已贡献 dockScrollEndPadPx),不可双计。
    func testWebExtraIsDeltaOverChromeBase() {
        for capsule in [false, true] {
            let needed = Int(KorbenShellMetrics.bottomObstruction(hasDomainCapsule: capsule).rounded(.up))
            let extra = KorbenShellMetrics.webBottomExtraPadPx(hasDomainCapsule: capsule)
            XCTAssertEqual(extra + KenosGlass.dockScrollEndPadPx, max(needed, KenosGlass.dockScrollEndPadPx))
        }
    }

    /// 最终净空必须落在 Owner 要求的 12–16pt 呼吸区间。
    func testClearanceMeetsOwnerRequirement() {
        XCTAssertGreaterThanOrEqual(KorbenShellMetrics.contentBreathingRoom, 12)
        XCTAssertLessThanOrEqual(KorbenShellMetrics.contentBreathingRoom, 16)
    }
}
