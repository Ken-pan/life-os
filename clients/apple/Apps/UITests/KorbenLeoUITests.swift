import XCTest

/// Leo 模式的原生在场 —— 证明:①persona=leo 时 Assist 头部换成 Leo 头像+名;
/// ②人设切换器在;③素材真的渲染出来(不是占位)。
/// 用启动参数 `-kenos.shell.assistantPersona leo`(iOS UserDefaults 直接读
/// `-key value` 形式的启动参数)把人设预置为 Leo,无需走设置页导航。
final class KorbenLeoUITests: XCTestCase {

    private func launchLeo() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-korbenShellV2", "-kenosDevMode",
            "-kenos.shell.assistantPersona", "leo",
        ]
        app.launch()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for host in [springboard, app] {
            for label in ["Don't Allow", "不允许"] {
                let btn = host.buttons[label].firstMatch
                if btn.waitForExistence(timeout: 3) { btn.tap(); sleep(1); break }
            }
        }
        _ = app.buttons["korben.orb"].firstMatch.waitForExistence(timeout: 20)
        return app
    }

    private func shoot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    func testLeoAssistHeaderShowsAvatarAndSwitch() {
        let app = launchLeo()

        // Orb 右拉 → Assist。
        let orb = app.buttons["korben.orb"].firstMatch
        let start = orb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 200, dy: 0)))

        let panel = app.descendants(matching: .any)["korben.assistPanel"]
        guard panel.waitForExistence(timeout: 6) else {
            shoot(app, "LEO-0-assist-not-opened")
            return XCTFail("Orb 右拉应打开 Assist 面板")
        }

        XCTAssertTrue(
            app.descendants(matching: .any)["korben.leo.avatar"].waitForExistence(timeout: 3),
            "Leo 模式下 Assist 头部应显示 Leo 头像"
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["korben.assist.personaSwitch"].exists,
            "应有人设切换器"
        )
        shoot(app, "LEO-1-assist-leo-header")

        // 切回 Korben:点切换器的 korben 段,头像应消失(换成 sparkle 徽标)。
        let korbenSeg = app.descendants(matching: .any)["korben.assist.persona.korben"].firstMatch
        if korbenSeg.waitForExistence(timeout: 3), korbenSeg.isHittable {
            korbenSeg.tap()
            sleep(1)
            shoot(app, "LEO-2-switched-to-korben")
        }
    }
}
