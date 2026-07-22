import XCTest
@testable import KenosIOS

final class KenosShellUnlockTests: XCTestCase {
    override func tearDown() {
        KenosUnlockGrantStore.resetForTests()
        super.tearDown()
    }

    func testShellKeyConstant() {
        XCTAssertEqual(KenosUnlockGrantStore.shellKey, "kenos.unlock.shell")
    }

    func testShellGrantIndependentFromDomainGrants() {
        let t0 = Date(timeIntervalSince1970: 2_000_000)
        KenosUnlockGrantStore.remember("kenos.unlock.money", ttl: 600, now: t0)
        XCTAssertFalse(KenosUnlockGrantStore.isShellUnlocked(now: t0))
        KenosUnlockGrantStore.rememberShell(ttl: 600, now: t0)
        XCTAssertTrue(KenosUnlockGrantStore.isShellUnlocked(now: t0))
        XCTAssertTrue(KenosUnlockGrantStore.isValid("kenos.unlock.money", now: t0))
    }

    @MainActor
    func testEnsurePromptFalseRequiresExistingGrant() async {
        KenosShellUnlock.resetInFlightForTests()
        KenosUnlockGrantStore.resetForTests()
        let denied = await KenosShellUnlock.ensure(prompt: false)
        XCTAssertFalse(denied.ok)
        KenosUnlockGrantStore.rememberShell()
        let ok = await KenosShellUnlock.ensure(prompt: false)
        XCTAssertTrue(ok.ok)
        XCTAssertTrue(ok.cached)
    }

    @MainActor
    func testConcurrentEnsureSharesCachedGrant() async {
        KenosUnlockGrantStore.resetForTests()
        KenosShellUnlock.resetInFlightForTests()
        KenosUnlockGrantStore.rememberShell()
        async let a = KenosShellUnlock.ensure(prompt: true)
        async let b = KenosShellUnlock.ensure(prompt: true)
        let (ra, rb) = await (a, b)
        XCTAssertTrue(ra.ok)
        XCTAssertTrue(rb.ok)
        XCTAssertTrue(ra.cached)
        XCTAssertTrue(rb.cached)
    }

    @MainActor
    func testSimulatorEnsureGrantsWithoutPrompt() async {
        KenosUnlockGrantStore.resetForTests()
        KenosShellUnlock.resetInFlightForTests()
        let result = await KenosShellUnlock.ensure(prompt: true)
        XCTAssertTrue(result.ok)
        #if targetEnvironment(simulator)
        XCTAssertTrue(result.skipped)
        #endif
        XCTAssertTrue(KenosUnlockGrantStore.isShellUnlocked())
    }

    func testShellGrantExpiresByTTL() {
        let t0 = Date(timeIntervalSince1970: 3_000_000)
        KenosUnlockGrantStore.rememberShell(ttl: 60, now: t0)
        XCTAssertTrue(KenosUnlockGrantStore.isShellUnlocked(now: t0.addingTimeInterval(30)))
        XCTAssertFalse(KenosUnlockGrantStore.isShellUnlocked(now: t0.addingTimeInterval(61)))
    }
}
