import XCTest
@testable import KenosIOS

final class KorbenLeoPersonaTests: XCTestCase {
    func testPersonaNormalizeDefaultsToKorben() {
        XCTAssertEqual(KorbenAssistantPersona.normalize(nil), .korben)
        XCTAssertEqual(KorbenAssistantPersona.normalize(""), .korben)
        XCTAssertEqual(KorbenAssistantPersona.normalize("nonsense"), .korben)
        XCTAssertEqual(KorbenAssistantPersona.normalize("KORBEN"), .korben)
    }

    func testPersonaNormalizeLeo() {
        XCTAssertEqual(KorbenAssistantPersona.normalize("leo"), .leo)
        XCTAssertEqual(KorbenAssistantPersona.normalize("Leo"), .leo)
        XCTAssertTrue(KorbenAssistantPersona.leo.isLeo)
        XCTAssertFalse(KorbenAssistantPersona.korben.isLeo)
    }

    func testExpressionAssetNames() {
        XCTAssertEqual(KorbenLeoExpression.soft.assetName, "leo_soft")
        XCTAssertEqual(KorbenLeoExpression.thinking.assetName, "leo_thinking")
    }

    /// 表情由壳信号推断,优先级:正向瞬间 > 待确认 > 运行中 > 温柔在场。
    func testPresencePriority() {
        // 什么都没有 → 温柔在场(不是冷淡 neutral)。
        XCTAssertEqual(KorbenLeoPresence.expression(for: .init()), .soft)
        // 有 runtime → 在想。
        XCTAssertEqual(
            KorbenLeoPresence.expression(for: .init(hasActiveRuntime: true)),
            .thinking
        )
        // 待确认压过运行中 → 认真。
        XCTAssertEqual(
            KorbenLeoPresence.expression(for: .init(hasActiveRuntime: true, hasPendingAttention: true)),
            .serious
        )
        // 正向瞬间最高 → 微笑。
        XCTAssertEqual(
            KorbenLeoPresence.expression(for: .init(
                hasActiveRuntime: true, hasPendingAttention: true, justActedPositively: true
            )),
            .smile
        )
    }

    /// 流式防抖:只升不降(soft 最高)。
    func testStabilizeOnlyUpgradesWhileStreaming() {
        // 非流式:直接取 next。
        XCTAssertEqual(
            KorbenLeoPresence.stabilize(previous: .soft, next: .neutral, streaming: false),
            .neutral
        )
        // 流式:soft(4) → neutral(0) 不降级,保持 soft。
        XCTAssertEqual(
            KorbenLeoPresence.stabilize(previous: .soft, next: .neutral, streaming: true),
            .soft
        )
        // 流式:smile(2) → serious(3) 升级放行。
        XCTAssertEqual(
            KorbenLeoPresence.stabilize(previous: .smile, next: .serious, streaming: true),
            .serious
        )
        // 无 previous:直接取 next。
        XCTAssertEqual(
            KorbenLeoPresence.stabilize(previous: nil, next: .thinking, streaming: true),
            .thinking
        )
    }

    /// 壳设置存储的 persona 往返 + 广播编码携带 persona。
    func testShellStorePersonaRoundTrip() {
        KenosShellSettingsStore.resetForTests()
        defer { KenosShellSettingsStore.resetForTests() }

        XCTAssertEqual(KenosShellSettingsStore.current.persona, "korben")
        XCTAssertFalse(KenosShellSettingsStore.hasStoredPersona)

        let snap = KenosShellSettingsStore.update(persona: "leo")
        XCTAssertEqual(snap.persona, "leo")
        XCTAssertTrue(KenosShellSettingsStore.hasStoredPersona)
        XCTAssertEqual(KenosShellSettingsStore.current.persona, "leo")

        // 编码给 web 的 payload 必须带 persona,否则广播/注入下发不到。
        let encoded = KenosShellSettingsStore.encode()
        XCTAssertEqual(encoded["persona"] as? String, "leo")

        // 乱值回退 korben。
        let back = KenosShellSettingsStore.update(persona: "nonsense")
        XCTAssertEqual(back.persona, "korben")
    }
}
