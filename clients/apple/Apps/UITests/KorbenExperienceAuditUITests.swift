import XCTest

/// 体验审查专用采集 —— 不做断言,只把「用户真会停留的那些状态」逐个拍下来。
///
/// 与 Gate 套件的分工:Gate 套件证明**契约**(元素在不在、顺序对不对),
/// 这一套负责暴露**契约管不到的东西** —— 挤在一起、被遮住、中英混排、
/// 空态说了句废话。这些都只有把图摊开看才会发现。
final class KorbenExperienceAuditUITests: XCTestCase {

    private func launch(_ extraArgs: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-korbenShellV2", "-kenosDevMode"] + extraArgs
        app.launch()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for host in [springboard, app] {
            for label in ["Don't Allow", "不允许"] {
                let btn = host.buttons[label].firstMatch
                if btn.waitForExistence(timeout: 3) { btn.tap(); sleep(1); break }
            }
        }
        let banner = springboard.otherElements["NotificationShortLookView"].firstMatch
        if banner.waitForExistence(timeout: 1.5) { banner.swipeUp(); sleep(1) }
        _ = app.buttons["korben.orb"].firstMatch.waitForExistence(timeout: 20)
        return app
    }

    private func shoot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    private func enterPlan(_ app: XCUIApplication) {
        app.buttons["korben.orb"].firstMatch.tap()
        _ = app.descendants(matching: .any)["korben.spacePeek"].waitForExistence(timeout: 5)
        let tile = app.buttons["korben.spacePeek.tile.plan"].firstMatch
        if tile.waitForExistence(timeout: 3) { tile.tap() }
        sleep(7)
    }

    /// A —— 静止态:Today / 域内 / 域内滚到底(余隙)。
    func testAuditA_RestingStates() {
        let app = launch()
        sleep(2)
        shoot(app, "EA-01-today")

        enterPlan(app)
        shoot(app, "EA-02-domain-plan")

        // 滚到底 —— 浮动 chrome 下最后一项是否还留得出呼吸。
        for _ in 0..<8 { app.swipeUp() }
        sleep(1)
        shoot(app, "EA-03-domain-scroll-end")
    }

    /// B —— Peek 两态:Today 态(无 Today 行)与域内态(有 Today 行)。
    func testAuditB_PeekBothModes() {
        let app = launch()
        app.buttons["korben.orb"].firstMatch.tap()
        _ = app.descendants(matching: .any)["korben.spacePeek"].waitForExistence(timeout: 5)
        shoot(app, "EA-10-peek-from-today")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.09)).tap()
        sleep(1)

        enterPlan(app)
        app.buttons["korben.orb"].firstMatch.tap()
        _ = app.descendants(matching: .any)["korben.spacePeek"].waitForExistence(timeout: 5)
        shoot(app, "EA-11-peek-from-domain")
    }

    /// C —— Capture 两档:空态、单行、Canvas 多行拆分。
    func testAuditC_CaptureAndCanvas() {
        let app = launch()
        app.buttons["korben.intentDock"].firstMatch.tap()
        _ = app.textFields["korben.quickCapture.text"].waitForExistence(timeout: 5)
        sleep(1)
        shoot(app, "EA-20-capture-empty")

        app.typeText("修复登录跳转")
        sleep(1)
        shoot(app, "EA-21-capture-typed")

        // 上滑到 Canvas 档并写成清单 —— 拆分预览是这层的主证据。
        app.swipeUp()
        sleep(1)
        app.typeText("\n明天下午过一遍预算\n买跑鞋\n整理上周的训练记录")
        sleep(1)
        shoot(app, "EA-22-canvas-breakdown")
    }

    /// D —— Assist 在域内(位置行 + 同域跳转建议才有内容)。
    func testAuditD_AssistInDomain() {
        let app = launch()
        enterPlan(app)
        let orb = app.buttons["korben.orb"].firstMatch
        let start = orb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 200, dy: 0)))
        _ = app.descendants(matching: .any)["korben.assistPanel"].waitForExistence(timeout: 6)
        sleep(1)
        shoot(app, "EA-30-assist-in-domain")
    }

    /// E —— Strip 满态 + Tray(夹具),以及域内 Strip 与域胶囊同屏。
    func testAuditE_StripAndTray() {
        let app = launch(["-korbenStripFixture", "both"])
        sleep(2)
        shoot(app, "EA-40-strip-full-today")
        app.descendants(matching: .any)["korben.strip.attention"].firstMatch.tap()
        _ = app.descendants(matching: .any)["korben.systemTray"].waitForExistence(timeout: 5)
        shoot(app, "EA-41-tray")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75)).tap()
        sleep(1)
        enterPlan(app)
        shoot(app, "EA-42-strip-with-domain-capsule")
    }

    /// F —— Orb 长按扇形 + 右拉预览(两个纯手势态,平时截不到)。
    func testAuditF_OrbGestureOverlays() {
        let app = launch()
        let orb = app.buttons["korben.orb"].firstMatch
        let c = orb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))

        // Hold 扇形:按住不放的中途截图,故用 press + 另起线程不可行 ——
        // 改用「按住并小幅拖动到扇形区」的合成事件,松手前 XCTest 会截到过程帧。
        c.press(forDuration: 0.6, thenDragTo: c.withOffset(CGVector(dx: 60, dy: -70)))
        sleep(1)
        shoot(app, "EA-50-after-fan-drag")

        c.press(forDuration: 0.05, thenDragTo: c.withOffset(CGVector(dx: 90, dy: 0)))
        sleep(1)
        shoot(app, "EA-51-after-assist-preview")
    }
}
