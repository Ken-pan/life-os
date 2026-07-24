import XCTest

/// Korben Shell V2 — Device Gate 模拟器自动化(真实点按/键盘/滚动注入)。
///
/// 对应 docs/mobile/KORBEN_SHELL_V2_P1_REPORT.md §8 的 Test 1–7。
/// 真机专属项(真 VoiceOver 朗读、真机 safe-area、已登录账户)仍 DEVICE OPEN;
/// 此套件把「interaction verified」尽可能前移到模拟器。
final class KorbenShellDeviceGateUITests: XCTestCase {

    private func launchKorben(extraArgs: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        // -kenosDevMode:开发构建下一次跳过 Face ID 壳解锁门 + HealthKit 授权 sheet
        // (含 device Release 测试构建 —— 带 embedded.mobileprovision 即判为开发构建)。
        app.launchArguments = ["-korbenShellV2", "-kenosDevMode"] + extraArgs
        app.launch()
        dismissHealthAccessIfPresent(app) // 兜底:dev mode 已抑制,残留旧授权态时仍点掉
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

    /// 模拟器首次弹键盘会盖一层 QuickPath 教学浮层(「Speed up your typing…」),
    /// 会遮住被截图的 sheet。点 Continue 关掉;真机通常不出现。
    private func dismissKeyboardTutorialIfPresent(_ app: XCUIApplication) {
        for label in ["Continue", "继续"] {
            let btn = app.buttons[label].firstMatch
            if btn.exists, btn.isHittable { btn.tap(); sleep(1); return }
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

    /// 经 Orb Tap → **Space Peek** 真实点按切换 Space。
    ///
    /// Gate5C-1 起 Orb Tap 打开的是 Peek 而不是 Space Switcher(Swipe Up 才是
    /// 全目录 Center)。按 Space **id** 定位磁贴而不是按可见文案 —— 展示名会随
    /// 界面语言变化(「计划」/「Plan」),按文案找会在切中文后整套变红。
    private func switchSpace(_ app: XCUIApplication, spaceId: String) {
        app.buttons["korben.orb"].firstMatch.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["korben.spacePeek"].waitForExistence(timeout: 5),
            "Orb tap 后 Space Peek 应打开"
        )
        let tile = app.buttons["korben.spacePeek.tile.\(spaceId)"].firstMatch
        var found = tile.waitForExistence(timeout: 3)
        var scrolls = 0
        while !(found && tile.isHittable) && scrolls < 4 {
            app.swipeUp()
            scrolls += 1
            found = tile.exists
        }
        XCTAssertTrue(found, "Peek 内应有 \(spaceId) 磁贴(滚动 \(scrolls) 次后仍未见)")
        tile.tap()
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

        for (row, label) in [("plan", "plan"), ("training", "fitness"), ("money", "finance")] {
            switchSpace(app, spaceId: row)
            assertSingleKorbenChrome(app, context: label)
            XCTAssertTrue(
                app.otherElements["korben.domainCapsule"].waitForExistence(timeout: 8),
                "[\(label)] Domain 胶囊应出现"
            )
            attachScreenshot(app, name: "T1-\(label)")
        }

        // 回 Today —— 走 Peek 里的 Today 行。用专属 identifier 而不是文案匹配:
        // 域胶囊里也有叫「今日」的 tab,按文案找会误点域内 tab、停在 domain。
        app.buttons["korben.orb"].firstMatch.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["korben.spacePeek"].waitForExistence(timeout: 5),
            "回 Today 前 Space Peek 应打开"
        )
        let todayRow = app.buttons["korben.spacePeek.today"]
        XCTAssertTrue(todayRow.waitForExistence(timeout: 5), "域内 Peek 必须给出回 Today 的路")
        todayRow.tap()
        sleep(3)
        assertSingleKorbenChrome(app, context: "back-to-Today")
        XCTAssertFalse(app.otherElements["korben.domainCapsule"].exists, "回 Today 后胶囊应消失")
        attachScreenshot(app, name: "T1-back-today")
    }

    /// Orb Tap 反复开关 —— Gate5C-1 起落点是 Space Peek(不是 Switcher),
    /// 关闭走点背板(Peek 是"瞄一眼",取消必须零代价,没有也不该有 Close 按钮)。
    func testOrbTapOpenCloseThreeTimes() {
        let app = launchKorben()
        let orb = app.buttons["korben.orb"].firstMatch
        XCTAssertTrue(orb.waitForExistence(timeout: 15))
        let peek = app.descendants(matching: .any)["korben.spacePeek"]
        for i in 1...3 {
            orb.tap()
            XCTAssertTrue(peek.waitForExistence(timeout: 5), "第 \(i) 次:Peek 应打开")
            // dy 取 0.09 而不是更靠上:0.06 会落进状态栏,那不是 app 的可点区域,
            // 点了什么都不会发生(第一轮就是这么假红的)。Peek 卡自底部起 71%,
            // 顶部这一带确定是背板。
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.09)).tap()
            XCTAssertFalse(peek.waitForExistence(timeout: 2), "第 \(i) 次:点背板应关闭 Peek")
            XCTAssertTrue(orb.waitForExistence(timeout: 5), "第 \(i) 次:关闭后 Orb 应回来")
        }
        assertSingleKorbenChrome(app, context: "after-3x-open-close")
    }

    // MARK: Test 3 — Intent Dock 真实点按 + 键盘

    func testIntentDockKeyboardTodayAndPlan() {
        let app = launchKorben()
        XCTAssertTrue(app.buttons["korben.intentDock"].waitForExistence(timeout: 15))
        intentDockRoundTrip(app, context: "Today")

        switchSpace(app, spaceId: "plan")
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
        for (row, label) in [("plan", "plan"), ("training", "fitness"), ("money", "finance")] {
            switchSpace(app, spaceId: row)
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
        switchSpace(app, spaceId: "plan")
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

        switchSpace(app, spaceId: "plan")
        let capsule = app.otherElements["korben.domainCapsule"]
        XCTAssertTrue(capsule.waitForExistence(timeout: 8))
        let item0 = app.buttons["korben.domainCapsule.0"]
        XCTAssertTrue(item0.exists, "胶囊项应可寻址")
        XCTAssertFalse(item0.label.isEmpty, "胶囊项应有 label")
        XCTAssertGreaterThanOrEqual(item0.frame.height, 44)

        // 不用 performAccessibilityAudit 全屏审计:它会穿进 WKWebView(独立进程)
        // 审网页内容,那是 web 侧责任、不属原生壳 Device Gate,且在 Swift 6 严格
        // 并发下 handler 无法安全捕获 self。原生壳控件的命中区/标签已在上方逐一
        // 精准断言(Orb/Dock/域胶囊 ≥44pt + 非空 label),覆盖此 gate 的原生范围。
    }

    // MARK: Test 6b — 域胶囊真实点按(域内视图切换)

    func testDomainCapsuleRealTap() {
        let app = launchKorben()
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 15))
        switchSpace(app, spaceId: "plan")
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

    // MARK: Gate 4 — Owner 指定的六张验收截图(真机)

    /// 产出 Owner Gate 4 清单的 6 张证据截图:
    /// Today 静止 / Plan 顶 / Plan 底 / Fitness 历史 / Intent Dock+键盘 / Finance 锁定。
    func testGate4EvidenceShots() {
        let app = launchKorben()
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 15))
        sleep(3)
        attachScreenshot(app, name: "G4-1-today-rest")

        // 2 / 3 — Plan 顶部与底部
        switchSpace(app, spaceId: "plan")
        sleep(2)
        attachScreenshot(app, name: "G4-2-plan-top")
        for _ in 0..<8 { app.swipeUp() }
        sleep(2)
        attachScreenshot(app, name: "G4-3-plan-bottom")

        // 5 — Intent Dock + 键盘(在 Plan 内,验证域态下的 capture 层级)
        app.buttons["korben.intentDock"].tap()
        let byId = app.descendants(matching: .any)["korben.quickCapture.text"]
        let field = byId.waitForExistence(timeout: 6)
            ? byId
            : (app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch)
        if field.waitForExistence(timeout: 4) {
            field.tap()
            _ = app.keyboards.firstMatch.waitForExistence(timeout: 5)
            field.typeText("Gate4 evidence")
            sleep(1)
            attachScreenshot(app, name: "G4-5-dock-keyboard")
        }
        app.swipeDown(velocity: .fast)
        _ = app.buttons["korben.intentDock"].waitForExistence(timeout: 6)

        // 4 — Fitness 历史(域胶囊最后一个 slot 通常是历史/统计)
        switchSpace(app, spaceId: "training")
        sleep(2)
        let lastSlot = app.buttons["korben.domainCapsule.2"]
        if lastSlot.waitForExistence(timeout: 6), lastSlot.isHittable {
            lastSlot.tap()
            sleep(5)
        }
        attachScreenshot(app, name: "G4-4-fitness-history")

        // 6 — Finance 锁定页
        switchSpace(app, spaceId: "money")
        sleep(3)
        attachScreenshot(app, name: "G4-6-finance-locked")
    }

    // MARK: Gate 4 补采 — Today 底部余隙回归(1A/1B)+ Plan 不回归

    /// Owner 补采清单:1A Today 静止 / 1B Today 滚到真实底部;
    /// 外加 Plan 滚到底,证明共享 inset 改动没让 Domain 回归。
    func testTodayBottomInsetEvidence() {
        let app = launchKorben()
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 15))
        sleep(3)
        attachScreenshot(app, name: "G4-1A-today-rest")

        // 1B — 滚到 Today 真实底部(多滑几次直到不再变化)
        for _ in 0..<10 { app.swipeUp() }
        sleep(2)
        attachScreenshot(app, name: "G4-1B-today-bottom")
        assertSingleKorbenChrome(app, context: "today-bottom")
        XCTAssertFalse(
            app.otherElements["korben.domainCapsule"].exists,
            "Today(Kenos 态)不应出现域胶囊"
        )

        // 不回归:Plan 滚到底仍完整
        switchSpace(app, spaceId: "plan")
        for _ in 0..<8 { app.swipeUp() }
        sleep(2)
        attachScreenshot(app, name: "G4-3B-plan-bottom-regression")
        assertSingleKorbenChrome(app, context: "plan-bottom")
    }

    // MARK: System Strip 行为验收(Attention / Tray 展开)

    /// 证明 System Strip 不只是视觉原型:单元可点、Tray 能展开与关闭、
    /// 无状态时整条隐藏不占位。真机上通常有 Training runtime,故 strip 存在。
    func testSystemStripBehavior() {
        let app = launchKorben()
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 15))
        sleep(3)

        // 按 identifier 跨类型查 —— SwiftUI 在 Strip 容器下不一定把单元暴露成
        // `button` 类型(实测 app.buttons 查不到,但元素确实在)。
        func byId(_ id: String) -> XCUIElement { app.descendants(matching: .any)[id] }
        let strip = byId("korben.systemStrip")
        let runtime = byId("korben.strip.runtime")
        let attention = byId("korben.strip.attention")
        let secondary = byId("korben.strip.secondaryRuntimes")

        guard strip.waitForExistence(timeout: 6) else {
            // 无任何 runtime/attention:规范要求整条隐藏 —— 这本身就是通过条件。
            XCTAssertFalse(runtime.exists || attention.exists, "无状态时 Strip 单元不应存在")
            attachScreenshot(app, name: "STRIP-empty-hidden")
            return
        }
        _ = runtime.waitForExistence(timeout: 3) // 让单元先入树再计数
        attachScreenshot(app, name: "STRIP-1-visible")

        // 单元总数不超过规范上限 3。
        let unitCount = [runtime, attention, secondary].filter { $0.exists }.count
        XCTAssertLessThanOrEqual(unitCount, 3, "Strip 最多 3 个状态单元")
        XCTAssertGreaterThan(unitCount, 0, "Strip 可见时至少有一个单元")

        // Tray 展开:优先点 attention(规范里它是 Tray 入口),否则点次要 runtime。
        let trayOpener = attention.exists ? attention : (secondary.exists ? secondary : runtime)
        if trayOpener.exists, trayOpener.isHittable, trayOpener != runtime {
            trayOpener.tap()
            let tray = app.descendants(matching: .any)["korben.systemTray"]
            XCTAssertTrue(tray.waitForExistence(timeout: 5), "点 Strip 单元应展开 System Tray")
            attachScreenshot(app, name: "STRIP-2-tray-open")
            // 点 Tray 外部关闭。
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85)).tap()
            XCTAssertTrue(
                app.buttons["korben.orb"].waitForExistence(timeout: 5),
                "关闭 Tray 后应回到壳"
            )
            attachScreenshot(app, name: "STRIP-3-tray-closed")
        } else {
            // 只有主 runtime 单元(无 attention/次要):点它应回到运行中的会话,
            // 不应崩溃或留下悬空 overlay。
            runtime.tap()
            sleep(3)
            assertSingleKorbenChrome(app, context: "after-runtime-tap")
            attachScreenshot(app, name: "STRIP-2-runtime-activated")
        }
    }

    // MARK: Review 采集 — 全部主要交互状态(合成三张 review 表)

    /// A 组:壳与空间。
    func testReviewShotsA_ShellAndSpaces() {
        let app = launchKorben()
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 15))
        sleep(3)
        attachScreenshot(app, name: "RA-1-today-rest")
        for _ in 0..<10 { app.swipeUp() }
        sleep(2)
        attachScreenshot(app, name: "RA-2-today-bottom")

        switchSpace(app, spaceId: "plan")
        sleep(2)
        attachScreenshot(app, name: "RA-3-plan-top")
        for _ in 0..<8 { app.swipeUp() }
        sleep(2)
        attachScreenshot(app, name: "RA-4-plan-bottom")

        switchSpace(app, spaceId: "training")
        sleep(2)
        attachScreenshot(app, name: "RA-5-fitness")

        switchSpace(app, spaceId: "money")
        sleep(3)
        attachScreenshot(app, name: "RA-6-finance-locked")
    }

    /// B 组:交互与手势(含从未视觉验证过的 Orb 右拉 → Assist)。
    func testReviewShotsB_Interactions() {
        var app = launchKorben()
        let orb = app.buttons["korben.orb"]
        XCTAssertTrue(orb.waitForExistence(timeout: 15))
        sleep(2)

        // B1 Orb 轻点 → Space Peek(局部卡,当前页仍露在外)
        orb.tap()
        _ = app.descendants(matching: .any)["korben.spacePeek"].waitForExistence(timeout: 5)
        attachScreenshot(app, name: "RB-1-space-peek")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.09)).tap()
        _ = orb.waitForExistence(timeout: 5)

        // B2 Orb 右拉 → Korben Assist 面板(短按后立即右拖,避开 280ms 长按判定)
        let start = orb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 210, dy: 0)))
        sleep(2)
        if app.descendants(matching: .any)["korben.assistPanel"].waitForExistence(timeout: 5) {
            attachScreenshot(app, name: "RB-2-assist-panel")
            app.swipeDown(velocity: .fast)
            _ = orb.waitForExistence(timeout: 5)
        }

        // B2 之后会停在 Ask 页(Assist 面板的「展开对话」导航过去),而 Ask 页自带
        // composer、Korben Intent Dock 按 P0-2 规则隐藏 —— 若不复位,B3/B4 测到的
        // 会是**网页的**输入框而非 Quick Capture(此前几轮就是这样误采)。
        // 用重启拿干净 Today 态,比在 UI 里绕路可靠。
        app.terminate()
        app = launchKorben()
        XCTAssertTrue(
            app.buttons["korben.intentDock"].waitForExistence(timeout: 15),
            "Today 应有 Intent Dock(仅 Ask 页隐藏)"
        )
        dismissKeyboardTutorialIfPresent(app)

        // B3 Intent Dock → Quick Capture + 键盘
        app.buttons["korben.intentDock"].tap()
        let byId = app.descendants(matching: .any)["korben.quickCapture.text"]
        let field = byId.waitForExistence(timeout: 6)
            ? byId
            : (app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch)
        if field.waitForExistence(timeout: 4) {
            field.tap()
            _ = app.keyboards.firstMatch.waitForExistence(timeout: 5)
            field.typeText("Review 采集")
            sleep(1)
            attachScreenshot(app, name: "RB-3-quick-capture")
        }
        app.swipeDown(velocity: .fast)
        sleep(1)
        app.swipeDown(velocity: .fast)
        _ = orb.waitForExistence(timeout: 6)

        // B4 Canvas 档 —— 用 Intent Dock **深上滑**(>120pt)直接开在 Canvas 档,
        // 比在已展开的 sheet 上再上滑可靠(后者会滑到 web)。
        dismissKeyboardTutorialIfPresent(app)
        let dock = app.buttons["korben.intentDock"]
        if dock.waitForExistence(timeout: 6) {
            let from = dock.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: -220)))
            sleep(2)
            dismissKeyboardTutorialIfPresent(app)
            attachScreenshot(app, name: "RB-4-canvas-detent")
            app.swipeDown(velocity: .fast)
            sleep(1)
            app.swipeDown(velocity: .fast)
            _ = orb.waitForExistence(timeout: 6)
        }

        // B5 域胶囊切换(Plan → 日历)
        switchSpace(app, spaceId: "plan")
        let slot1 = app.buttons["korben.domainCapsule.1"]
        if slot1.waitForExistence(timeout: 8), slot1.isHittable {
            slot1.tap()
            sleep(4)
            attachScreenshot(app, name: "RB-5-capsule-calendar")
        }
        let slot0 = app.buttons["korben.domainCapsule.0"]
        if slot0.exists, slot0.isHittable {
            slot0.tap()
            sleep(3)
            attachScreenshot(app, name: "RB-6-capsule-tasks")
        }
    }

    /// C 组:状态与边界(Strip / Tray / Undo / Dynamic Type / 前后台)。
    func testReviewShotsC_States() {
        var app = launchKorben()
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 15))
        sleep(3)
        attachScreenshot(app, name: "RC-1-system-strip")

        // C2 System Tray(从 attention / 次要 runtime 单元展开)
        func byId(_ id: String) -> XCUIElement { app.descendants(matching: .any)[id] }
        let trayOpener = byId("korben.strip.attention").exists
            ? byId("korben.strip.attention")
            : byId("korben.strip.secondaryRuntimes")
        if trayOpener.exists, trayOpener.isHittable {
            trayOpener.tap()
            if byId("korben.systemTray").waitForExistence(timeout: 5) {
                attachScreenshot(app, name: "RC-2-system-tray")
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9)).tap()
                sleep(1)
            }
        }

        // C3 Undo pill —— 创建一条 capture 后 10s 内可撤销
        app.buttons["korben.intentDock"].tap()
        let f = app.descendants(matching: .any)["korben.quickCapture.text"]
        let field = f.waitForExistence(timeout: 6)
            ? f
            : (app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch)
        if field.waitForExistence(timeout: 4) {
            field.tap()
            _ = app.keyboards.firstMatch.waitForExistence(timeout: 5)
            field.typeText("Undo 证据")
            let create = app.descendants(matching: .any)["korben.quickCapture.create"]
            if create.exists, create.isHittable {
                create.tap()
                sleep(2)
                attachScreenshot(app, name: "RC-3-undo-pill")
            }
        }

        // C4 前后台往返
        XCUIDevice.shared.press(.home)
        sleep(4)
        app.activate()
        _ = app.buttons["korben.orb"].waitForExistence(timeout: 10)
        sleep(2)
        attachScreenshot(app, name: "RC-4-after-background")

        // C5/C6 Dynamic Type 辅助功能大号(需带参重启)
        app.terminate()
        app = launchKorben(extraArgs: [
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityL",
        ])
        _ = app.buttons["korben.orb"].waitForExistence(timeout: 15)
        sleep(3)
        attachScreenshot(app, name: "RC-5-dynamic-type-today")
        switchSpace(app, spaceId: "plan")
        sleep(2)
        attachScreenshot(app, name: "RC-6-dynamic-type-plan")
    }

    // MARK: Test 7 — Dynamic Type(辅助功能大号)

    func testDynamicTypeAccessibilityLarge() {
        let app = launchKorben(extraArgs: [
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityL",
        ])
        XCTAssertTrue(app.buttons["korben.orb"].waitForExistence(timeout: 15))
        assertSingleKorbenChrome(app, context: "dynamicType-Today")
        attachScreenshot(app, name: "T7-ax-large-today")

        switchSpace(app, spaceId: "plan")
        XCTAssertTrue(app.otherElements["korben.domainCapsule"].waitForExistence(timeout: 8))
        // 胶囊与 Dock 仍在屏内且可点
        let dock = app.buttons["korben.intentDock"]
        XCTAssertTrue(dock.isHittable, "AX Large 下 Intent Dock 应可点")
        attachScreenshot(app, name: "T7-ax-large-plan")
    }
}
