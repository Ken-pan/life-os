import XCTest
@testable import KenosIOS

final class KenosDevModeTests: XCTestCase {
    private func resolve(dev: Bool, args: [String] = [], env: [String: String] = [:]) -> Bool {
        KenosDevMode.resolve(isDevelopmentBuild: dev, arguments: args, environment: env)
    }

    // 最重要:生产构建下无论传什么都不激活。
    func testProductionBuildNeverActivates() {
        XCTAssertFalse(resolve(dev: false, args: ["-kenosDevMode"]))
        XCTAssertFalse(resolve(dev: false, args: ["-kenosSkipShellUnlock"]))
        XCTAssertFalse(resolve(dev: false, env: ["KENOS_DEV_MODE": "1"]))
    }

    // 开发构建但无 opt-in → 不激活(普通启动零参数)。
    func testDevBuildWithoutOptInStaysOff() {
        XCTAssertFalse(resolve(dev: true))
        XCTAssertFalse(resolve(dev: true, args: ["-someOtherFlag"]))
        XCTAssertFalse(resolve(dev: true, env: ["KENOS_DEV_MODE": "0"]))
    }

    func testDevModeLaunchArgumentActivates() {
        XCTAssertTrue(resolve(dev: true, args: ["-kenosDevMode"]))
    }

    func testLegacyArgumentStillActivates() {
        XCTAssertTrue(resolve(dev: true, args: ["-kenosSkipShellUnlock"]))
    }

    func testEnvironmentVariablesActivate() {
        XCTAssertTrue(resolve(dev: true, env: ["KENOS_DEV_MODE": "1"]))
        XCTAssertTrue(resolve(dev: true, env: ["KENOS_SHELL_UNLOCK_SKIP": "1"]))
    }
}
