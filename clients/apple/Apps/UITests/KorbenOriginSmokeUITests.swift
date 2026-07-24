import XCTest

/// 冒烟:默认冷启动(不带 dev 参数,模拟真实首启)后,壳应连上生产并绘制内容,
/// 而不是停在「Daily Beta shell offline」硬门。这条专门守 ensurePhoneHomeBaseDefault。
final class KorbenOriginSmokeUITests: XCTestCase {
    func testColdLaunchReachesProductionNotOfflineGate() {
        let app = XCUIApplication()
        // 不传 -kenosDevMode / -korbenShellV2 —— 要的就是真实默认路径。
        app.launch()
        // 生产站冷启动 + 可能的一次 Face ID / 登录门,给足时间。
        sleep(12)

        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "origin-smoke-cold-launch"
        shot.lifetime = .keepAlways
        add(shot)

        // 断言:没有出现离线硬门的关键文案。用文案而非 identifier —— 硬门是
        // ContentUnavailable,没挂稳定 id;这几个词只在离线态出现。
        for offline in ["shell is offline", "Daily Beta", "本机测试版服务离线", "重新连接 Daily Beta"] {
            XCTAssertFalse(
                app.staticTexts[offline].exists,
                "冷启动不应停在离线门:命中「\(offline)」"
            )
        }
    }
}
