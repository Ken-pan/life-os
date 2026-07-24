import XCTest

/// Gate 5C / 5D 的交互证据 —— 这一套专门证明三件此前只有代码路径、没有实拍的事:
///
/// - **5C-1 Space Peek**:Orb Tap 打开的是**局部**卡(当前页仍露在外),
///   而不是与 Swipe Up 相同的近全屏 Space Center。
/// - **5C-2 Assist 接地**:面板的位置行会随所在页面变化,并给出同域跳转建议。
/// - **5D System Strip 三态**:靠启动夹具造出 Attention / Runtime / 两者并存,
///   以及 Tray 展开 —— 此前这三态从未被证明过(真实环境里从来是空的)。
final class KorbenGate5CDUITests: XCTestCase {

    private func launch(_ extraArgs: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-korbenShellV2", "-kenosDevMode"] + extraArgs
        app.launch()
        dismissHealthAccessIfPresent(app)
        dismissNotificationBannerIfPresent(app)
        XCTAssertTrue(
            app.buttons["korben.orb"].waitForExistence(timeout: 20),
            "壳未起来 —— 后续断言无意义"
        )
        return app
    }

    private func dismissHealthAccessIfPresent(_ app: XCUIApplication) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for host in [springboard, app] {
            for label in ["Don't Allow", "不允许"] {
                let btn = host.buttons[label].firstMatch
                if btn.waitForExistence(timeout: 3) {
                    btn.tap()
                    sleep(1)
                    return
                }
            }
        }
    }

    /// 真机专有的环境干扰:系统通知横幅落在屏幕顶部 —— 正好压在 System Strip 上。
    /// 上一轮就是被一条 Apple TV 键盘通知吃掉了点击(点开了 Apple TV 遥控键盘,
    /// Tray 自然没开)。上滑把横幅收掉再继续,否则 Strip 的交互断言全是随机红。
    private func dismissNotificationBannerIfPresent(_ app: XCUIApplication) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let banner = springboard.otherElements["NotificationShortLookView"].firstMatch
        guard banner.waitForExistence(timeout: 1.5) else { return }
        banner.swipeUp()
        sleep(1)
    }

    private func shoot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    // ── 5C-1 Space Peek ───────────────────────────────────────────────

    func testSpacePeekIsPartialAndDistinctFromCenter() {
        let app = launch()
        app.buttons["korben.orb"].firstMatch.tap()

        let peek = app.descendants(matching: .any)["korben.spacePeek"]
        XCTAssertTrue(peek.waitForExistence(timeout: 6), "Orb Tap 应打开 Space Peek")
        shoot(app, "5C1-1-peek-open")

        // Peek 的定义就是"局部" —— 一旦它铺满,它就退化成 Space Center,
        // Tap 与 Swipe Up 又变回同一件事。这两条是这个交互存在的理由。
        let screen = app.windows.firstMatch.frame
        let card = peek.frame
        XCTAssertLessThan(
            card.width / screen.width, 0.92,
            "Peek 宽度铺满 = 退化成 Space Center"
        )
        XCTAssertLessThan(
            card.height / screen.height, 0.86,
            "Peek 高度铺满 = 当前页看不见,失去 Peek 语义"
        )

        // 升级路径:Peek → Center 必须走得通。
        let all = app.buttons["korben.spacePeek.allSpaces"]
        XCTAssertTrue(all.waitForExistence(timeout: 3), "Peek 应有「全部空间」升级入口")
        all.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["kenos.spaceSwitcher"].waitForExistence(timeout: 6)
                || app.staticTexts["Switch Space"].waitForExistence(timeout: 3),
            "「全部空间」应升级到 Space Center"
        )
        shoot(app, "5C1-2-peek-upgraded-to-center")
    }

    func testSpacePeekDismissesWithoutNavigating() {
        let app = launch()
        app.buttons["korben.orb"].firstMatch.tap()
        let peek = app.descendants(matching: .any)["korben.spacePeek"]
        XCTAssertTrue(peek.waitForExistence(timeout: 6))

        // 点卡片外的背板 —— Peek 是"瞄一眼",取消必须零代价。
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.08)).tap()
        XCTAssertFalse(
            peek.waitForExistence(timeout: 2),
            "点背板应关闭 Peek"
        )
        XCTAssertTrue(app.buttons["korben.orb"].exists, "关闭 Peek 不应改变所在页面")
        shoot(app, "5C1-3-peek-dismissed")
    }

    // ── 5C-2 Assist 接地 ──────────────────────────────────────────────

    func testAssistPanelReportsLocation() {
        let app = launch()
        // 走 VoiceOver action 之外的稳定路径:Orb 右拉 ≥132pt 提交打开 Assist。
        // 坐标级拖拽:press(forDuration:thenDragTo:) 只收 XCUIElement,
        // 而右拉的终点是一块空白区域,没有元素可作靶子。
        let orb = app.buttons["korben.orb"].firstMatch
        let start = orb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        let end = start.withOffset(CGVector(dx: 200, dy: 0))
        start.press(forDuration: 0.05, thenDragTo: end)

        let panel = app.descendants(matching: .any)["korben.assistPanel"]
        guard panel.waitForExistence(timeout: 6) else {
            shoot(app, "5C2-0-assist-not-opened")
            return XCTFail("Orb 右拉应打开 Assist 面板")
        }
        let location = app.descendants(matching: .any)["korben.assist.location"]
        XCTAssertTrue(
            location.waitForExistence(timeout: 3),
            "Assist 必须报出当前位置(接地的最小证据)"
        )
        shoot(app, "5C2-1-assist-grounded")
    }

    // ── 5D System Strip 三态 ──────────────────────────────────────────

    func testStripAttentionOnly() {
        let app = launch(["-korbenStripFixture", "attention"])
        XCTAssertTrue(
            app.descendants(matching: .any)["korben.strip.attention"].waitForExistence(timeout: 8),
            "Attention 单元应出现"
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["korben.strip.runtime"].exists,
            "无 runtime 时不应凭空出现 runtime 单元"
        )
        shoot(app, "5D-1-strip-attention")
    }

    func testStripRuntimeOnly() {
        let app = launch(["-korbenStripFixture", "runtime"])
        XCTAssertTrue(
            app.descendants(matching: .any)["korben.strip.runtime"].waitForExistence(timeout: 8),
            "Runtime 单元应出现"
        )
        shoot(app, "5D-2-strip-runtime")
    }

    /// 规范的关键一条:Attention **排在** Runtime 前面。这条只能靠实拍坐标证明,
    /// 单测证明的是模型顺序,证明不了渲染顺序。
    func testStripMultiRuntimeOrdersAttentionFirst() {
        let app = launch(["-korbenStripFixture", "both"])
        let attention = app.descendants(matching: .any)["korben.strip.attention"]
        let runtime = app.descendants(matching: .any)["korben.strip.runtime"]
        let secondary = app.descendants(matching: .any)["korben.strip.secondaryRuntimes"]

        XCTAssertTrue(attention.waitForExistence(timeout: 8))
        XCTAssertTrue(runtime.waitForExistence(timeout: 3))
        XCTAssertTrue(secondary.waitForExistence(timeout: 3))
        XCTAssertLessThan(
            attention.frame.minX, runtime.frame.minX,
            "Attention 必须渲染在 Runtime 左侧(规范 P0/P1 高于 P2)"
        )
        XCTAssertLessThan(runtime.frame.minX, secondary.frame.minX)
        shoot(app, "5D-3-strip-multi")

        // Tray 展开 —— 必须与 Strip 说同一件事,否则证据自相矛盾。
        attention.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["korben.systemTray"].waitForExistence(timeout: 6),
            "点 Strip 单元应展开 System Tray"
        )
        shoot(app, "5D-4-tray-expanded")
    }
}
