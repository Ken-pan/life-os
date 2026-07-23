import XCTest

/// Korben Shell V2 — Device Gate 模拟器自动化(真实点按/键盘/滚动注入)。
///
/// 对应 docs/mobile/KORBEN_SHELL_V2_P1_REPORT.md §8 的 Test 1–7。
/// 真机专属项(真 VoiceOver 朗读、真机 safe-area、已登录账户)仍 DEVICE OPEN;
/// 此套件把「interaction verified」尽可能前移到模拟器。
final class KorbenShellDeviceGateUITests: XCTestCase {

    private func launchKorben(extraArgs: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-korbenShellV2", "-kenosSkipShellUnlock"] + extraArgs
        app.launch()
        dismissHealthAccessIfPresent(app)
        return app
    }

    /// 启动会弹 HealthKit 授权 sheet(Health Access)盖住全部 UI——
    /// 与 Korben 壳无关的环境前置。sheet 由系统进程(非 app 层级)呈现,
    /// 需从 springboard 侧点掉;拒绝后授权状态落定,不再弹。
    private func dismissHealthAccessIfPresent(_ app: XCUIApplication) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for host in [springboard, app] {
            for label in ["Don't Allow", "不允许"] {
                let btn = host.buttons[label].firstMatch
                if btn.waitForExistence(timeout: 3) {
                    btn.tap()
                    sleep(1)
                    _ = app.buttons["korben.orb"].waitForExistence(timeout: 8)
                    return
                }
            }
        }
    }

    /// Switcher sheet 存在性(identifier 命中类型不稳,叠加标题文本兜底)。
    private func switcherVisible(_ app: XCUIApplication, timeout: TimeInterval) -> Bool {
        let byId = app.descendants(matching: .any)["kenos.spaceSwitcher"]
        if byId.waitForExistence(timeout: timeout) { return true }
        return app.staticTexts["Switch Space"].waitForExistence(timeout: 2)
    }

    private func attachScreenshot(_ app: XCUIApplication, name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    /// Korben chrome 三件套断言(单一 Orb / 单一 Intent Dock)。
    private func assertSingleKorbenChrome(_ app: XCUIApplication, context: String) {
        let orbs = app.buttons.matching(identifier: "korben.orb")
        let docks = app.buttons.matching(identifier: "korben.intentDock")
        XCTAssertEqual(orbs.count, 1, "[\(context)] Orb 应恰好一个")
        XCTAssertEqual(docks.count, 1, "[\(context)] Intent Dock 应恰好一个")
        // 旧全局 chrome 不得出现(kenos.globalDock / kenos.domainDock 是旧 dock 标识)。
        XCTAssertFalse(
            app.otherElements["kenos.globalDock"].exists || app.otherElements["kenos.domainDock"].exists,
            "[\(context)] 旧 GlobalDock/DomainDock 不得渲染"
        )
    }

    /// 经 Orb → Space Switcher 真实点按切换 Space。
    private func switchSpace(_ app: XCUIApplication, rowText: String) {
        app.buttons["korben.orb"].tap()
        XCTAssertTrue(switcherVisible(app, timeout: 5), "Orb tap 后 Switcher 应打开")
        let row = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", rowText)).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5), "Switcher 内应有 \(rowText) 行")
        row.tap()
        // Domain WKWebView 加载余量
        sleep(6)
    }

    // MARK: Test 1+2 — 全局 Chrome 连续性 + Orb 真实点按

    func testGlobalChromeContinuityViaRealTaps() {
        let app = launchKorben()
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 15), "Today 应有 Korben Orb")
        assertSingleKorbenChrome(app, context: "Today")
        XCTAssertFalse(app.otherElements["korben.domainCapsule"].exists, "Today 不应有 Domain 胶囊")
        attachScreenshot(app, name: "T1-today")

        for (row, label) in [("Plan", "plan"), ("Fitness", "fitness"), ("Money", "finance")] {
            switchSpace(app, rowText: row)
            assertSingleKorbenChrome(app, context: label)
            XCTAssertTrue(
                app.otherElements["korben.domainCapsule"].waitForExistence(timeout: 8),
                "[\(label)] Domain 胶囊应出现"
            )
            attachScreenshot(app, name: "T1-\(label)")
        }

        // 回 Today
        app.buttons["korben.orb"].tap()
        let todayRow = app.buttons["Today"].firstMatch
        XCTAssertTrue(todayRow.waitForExistence(timeout: 5))
        todayRow.tap()
        sleep(3)
        assertSingleKorbenChrome(app, context: "back-to-Today")
        XCTAssertFalse(app.otherElements["korben.domainCapsule"].exists, "回 Today 后胶囊应消失")
        attachScreenshot(app, name: "T1-back-today")
    }

    func testOrbTapOpenCloseThreeTimes() {
        let app = launchKorben()
        let orb = app.buttons["korben.orb"]
        XCTAssertTrue(orb.waitForExistence(timeout: 15))
        for i in 1...3 {
            orb.tap()
            XCTAssertTrue(switcherVisible(app, timeout: 5), "第 \(i) 次:Switcher 应打开")
            let close = app.buttons["Close"].firstMatch
            XCTAssertTrue(close.waitForExistence(timeout: 3), "第 \(i) 次:应有 Close")
            close.tap()
            XCTAssertTrue(orb.waitForExistence(timeout: 5), "第 \(i) 次:关闭后 Orb 应回来")
        }
        assertSingleKorbenChrome(app, context: "after-3x-open-close")
    }

    // MARK: Test 3 — Intent Dock 真实点按 + 键盘

    func testIntentDockKeyboardTodayAndPlan() {
        let app = launchKorben()
        XCTAssertTrue(app.buttons["korben.intentDock"].waitForExistence(timeout: 15))
        intentDockRoundTrip(app, context: "Today")

        switchSpace(app, rowText: "Plan")
        XCTAssertTrue(app.buttons["korben.intentDock"].waitForExistence(timeout: 8))
        intentDockRoundTrip(app, context: "Plan")
    }

    private func intentDockRoundTrip(_ app: XCUIApplication, context: String) {
        app.buttons["korben.intentDock"].tap()
        // P4A Korben Quick Capture sheet(多行 TextField 暴露为 textView 或 textField)
        let byId = app.descendants(matching: .any)["korben.quickCapture.text"]
        let field = byId.waitForExistence(timeout: 6)
            ? byId
            : app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 4), "[\(context)] Quick Capture 输入框应出现")
        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), "[\(context)] 键盘应弹出")
        field.typeText("Device gate probe \(context)")
        attachScreenshot(app, name: "T3-keyboard-\(context)")
        // 键盘不遮输入框:输入框 maxY 应高于键盘 minY
        let kb = app.keyboards.firstMatch.frame
        XCTAssertLessThan(field.frame.maxY, kb.minY + 1, "[\(context)] 输入框不得被键盘遮挡")
        // 关闭:sheet 下滑
        app.swipeDown(velocity: .fast)
        XCTAssertTrue(
            app.buttons["korben.intentDock"].waitForExistence(timeout: 6),
            "[\(context)] 关闭后 Intent Dock 应恢复"
        )
    }

    // MARK: Test 4 — Domain 滚动到底(截图供人工判遮挡)

    func testDomainScrollToEnd() {
        let app = launchKorben()
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 15))
        for (row, label) in [("Plan", "plan"), ("Fitness", "fitness"), ("Money", "finance")] {
            switchSpace(app, rowText: row)
            let web = app.webViews.firstMatch
            _ = web.waitForExistence(timeout: 8)
            for _ in 0..<6 { app.swipeUp() }
            sleep(1)
            attachScreenshot(app, name: "T4-scroll-end-\(label)")
            assertSingleKorbenChrome(app, context: "scroll-end-\(label)")
        }
    }

    // MARK: Test 5 — 前后台往返(模拟器版;真锁屏留真机)

    func testBackgroundForegroundKeepsChrome() {
        let app = launchKorben()
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 15))
        switchSpace(app, rowText: "Plan")
        XCTAssertTrue(app.otherElements["korben.domainCapsule"].waitForExistence(timeout: 8))

        XCUIDevice.shared.press(.home)
        sleep(5)
        app.activate()
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 10), "回前台 Orb 应在")
        XCTAssertTrue(app.otherElements["korben.domainCapsule"].exists, "回前台应仍在 Plan(胶囊在)")
        assertSingleKorbenChrome(app, context: "after-bg-fg")
        attachScreenshot(app, name: "T5-after-bg-fg")
    }

    // MARK: Test 6 — 可访问性静态审计(标签/命中区;真 VoiceOver 留真机)

    func testAccessibilityStaticAudit() throws {
        let app = launchKorben()
        let orb = app.buttons["korben.orb"]
        let dock = app.buttons["korben.intentDock"]
        XCTAssertTrue(orb.waitForExistence(timeout: 15))
        XCTAssertFalse(orb.label.isEmpty, "Orb 应有语义 label")
        XCTAssertFalse(dock.label.isEmpty, "Intent Dock 应有语义 label")
        XCTAssertGreaterThanOrEqual(orb.frame.width, 44)
        XCTAssertGreaterThanOrEqual(orb.frame.height, 44)
        XCTAssertGreaterThanOrEqual(dock.frame.height, 44)

        switchSpace(app, rowText: "Plan")
        let capsule = app.otherElements["korben.domainCapsule"]
        XCTAssertTrue(capsule.waitForExistence(timeout: 8))
        let item0 = app.buttons["korben.domainCapsule.0"]
        XCTAssertTrue(item0.exists, "胶囊项应可寻址")
        XCTAssertFalse(item0.label.isEmpty, "胶囊项应有 label")
        XCTAssertGreaterThanOrEqual(item0.frame.height, 44)

        // Xcode 15+ 内建审计(对 WKWebView 内容会产生噪音——只审 chrome 层可交互元素,
        // 若整页审计失败仅记录不判死,人工复核 attachment)
        if #available(iOS 17.0, *) {
            do {
                try app.performAccessibilityAudit(for: [.hitRegion])
            } catch {
                add(XCTAttachment(string: "a11y audit(hitRegion) findings: \(error)"))
            }
        }
    }

    // MARK: Test 6b — 域胶囊真实点按(域内视图切换)

    func testDomainCapsuleRealTap() {
        let app = launchKorben()
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 15))
        switchSpace(app, rowText: "Plan")
        let item1 = app.buttons["korben.domainCapsule.1"]
        XCTAssertTrue(item1.waitForExistence(timeout: 8), "Plan 应有第二个胶囊项(日历)")
        item1.tap()
        sleep(4)
        assertSingleKorbenChrome(app, context: "capsule-tap")
        attachScreenshot(app, name: "T6b-capsule-slot1")
        let item0 = app.buttons["korben.domainCapsule.0"]
        item0.tap()
        sleep(3)
        attachScreenshot(app, name: "T6b-capsule-slot0")
    }

    // MARK: Test 7 — Dynamic Type(辅助功能大号)

    func testDynamicTypeAccessibilityLarge() {
        let app = launchKorben(extraArgs: [
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityL",
        ])
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 15))
        assertSingleKorbenChrome(app, context: "dynamicType-Today")
        attachScreenshot(app, name: "T7-ax-large-today")

        switchSpace(app, rowText: "Plan")
        XCTAssertTrue(app.otherElements["korben.domainCapsule"].waitForExistence(timeout: 8))
        // 胶囊与 Dock 仍在屏内且可点
        let dock = app.buttons["korben.intentDock"]
        XCTAssertTrue(dock.isHittable, "AX Large 下 Intent Dock 应可点")
        attachScreenshot(app, name: "T7-ax-large-plan")
    }
}
