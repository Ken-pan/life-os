import XCTest
@testable import KenosIOS

final class KorbenShellV2FeatureTests: XCTestCase {
    private func makeDefaults() -> UserDefaults {
        let suite = "korben.feature.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    func testCompileDefaultIsOff() {
        let defaults = makeDefaults()
        XCTAssertFalse(KorbenShellV2Feature.resolve(arguments: [], defaults: defaults))
        XCTAssertEqual(
            KorbenShellV2Feature.resolveSource(arguments: [], defaults: defaults),
            "compileDefault.off"
        )
    }

    func testLaunchArgumentForcesOn() {
        let defaults = makeDefaults()
        defaults.set(false, forKey: KorbenShellV2Feature.defaultsKey)
        XCTAssertTrue(
            KorbenShellV2Feature.resolve(arguments: ["-korbenShellV2"], defaults: defaults)
        )
    }

    func testLegacyArgumentForcesOffAndBeatsDefaults() {
        let defaults = makeDefaults()
        defaults.set(true, forKey: KorbenShellV2Feature.defaultsKey)
        // Rollback argument wins even when the dogfood toggle is on.
        XCTAssertFalse(
            KorbenShellV2Feature.resolve(arguments: ["-legacyKenosShell"], defaults: defaults)
        )
    }

    func testBothArgumentsPresentLegacyWins() {
        let defaults = makeDefaults()
        defaults.set(true, forKey: KorbenShellV2Feature.defaultsKey)
        // Emergency rollback semantics: safe fallback beats enable on conflict.
        XCTAssertFalse(
            KorbenShellV2Feature.resolve(
                arguments: ["-korbenShellV2", "-legacyKenosShell"],
                defaults: defaults
            )
        )
        XCTAssertEqual(
            KorbenShellV2Feature.resolveSource(
                arguments: ["-korbenShellV2", "-legacyKenosShell"],
                defaults: defaults
            ),
            "launchArgument.off"
        )
    }

    func testDefaultsToggleEnables() {
        let defaults = makeDefaults()
        defaults.set(true, forKey: KorbenShellV2Feature.defaultsKey)
        XCTAssertTrue(KorbenShellV2Feature.resolve(arguments: [], defaults: defaults))
        XCTAssertEqual(
            KorbenShellV2Feature.resolveSource(arguments: [], defaults: defaults),
            "defaults.on"
        )
    }
}
