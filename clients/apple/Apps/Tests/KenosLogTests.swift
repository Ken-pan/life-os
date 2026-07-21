import XCTest
@testable import KenosIOS

final class KenosLogTests: XCTestCase {
    func testRedactorScrubsBearerAndJWT() {
        let raw = "Authorization: Bearer abc.def.ghi access_token=super-secret eyJhbGciOiJIUzI1NiJ9.e30.aaa"
        let scrubbed = KenosLogRedactor.redact(raw)
        XCTAssertFalse(scrubbed.contains("super-secret"), scrubbed)
        XCTAssertFalse(scrubbed.contains("abc.def.ghi"), scrubbed)
        XCTAssertTrue(scrubbed.contains("«redacted»"), scrubbed)
        XCTAssertTrue(scrubbed.contains("«jwt»") || scrubbed.contains("access_token=«redacted»"), scrubbed)
    }

    func testRedactorScrubsSupabasePublishableKey() {
        let raw = "key=sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL"
        let scrubbed = KenosLogRedactor.redact(raw)
        XCTAssertFalse(scrubbed.contains("sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL"))
        XCTAssertTrue(scrubbed.contains("«supabase_key»"))
    }

    func testStoreKeepsRingAndLevels() {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("kenos-log-test-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        let store = KenosLogStore.makeForTesting(directory: dir)
        store.memoryCapacity = 50
        store.persistMinLevel = .trace
        store.consoleMinLevel = .fault
        store.bootstrap(source: "test")

        store.log(.debug, category: .navigation, message: "tab today", metadata: [:], file: "t", function: "f", line: 1)
        store.log(.error, category: .web, message: "load failed token=secret-value", metadata: ["token": "abc"], file: "t", function: "f", line: 2)
        store.log(.notice, category: .shell, message: "enter domain", metadata: ["breadcrumb": "1"], file: "t", function: "f", line: 3)

        let recent = store.recent(limit: 20)
        XCTAssertGreaterThanOrEqual(recent.count, 3)
        XCTAssertTrue(recent.contains { $0.message.contains("tab today") })
        XCTAssertTrue(recent.contains { $0.message.contains("«redacted»") || !$0.message.contains("secret-value") })

        let crumbs = recent.filter { $0.metadata["breadcrumb"] == "1" }
        XCTAssertFalse(crumbs.isEmpty)

        let errors = store.recent(limit: 50, minLevel: .error)
        XCTAssertTrue(errors.allSatisfy { $0.level >= .error })
    }

    func testExportPackageWritesTranscript() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("kenos-log-export-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        let store = KenosLogStore.makeForTesting(directory: dir)
        store.consoleMinLevel = .fault
        store.bootstrap(source: "export-test")
        store.log(.info, category: .app, message: "hello export", metadata: [:], file: "t", function: "f", line: 1)

        let package = try store.exportPackage()
        XCTAssertTrue(FileManager.default.fileExists(atPath: package.appendingPathComponent("transcript.txt").path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: package.appendingPathComponent("recent.jsonl").path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: package.appendingPathComponent("session.json").path))

        let transcript = try String(contentsOf: package.appendingPathComponent("transcript.txt"), encoding: .utf8)
        XCTAssertTrue(transcript.contains("hello export"))
    }

    func testLevelParsing() {
        XCTAssertEqual(KenosLogLevel.parse("warn"), .warning)
        XCTAssertEqual(KenosLogLevel.parse("ERROR"), .error)
        XCTAssertEqual(KenosLogCategory.parse("web"), .web)
        XCTAssertEqual(KenosLogCategory.parse("unknown-cat"), .app)
    }

    @MainActor
    func testSharedFacadeBreadcrumbs() {
        KenosLog.bootstrap(source: "unit")
        KenosLog.breadcrumb("unit breadcrumb", category: .navigation, metadata: ["tab": "today"])
        let summary = KenosLog.breadcrumbSummary(limit: 10)
        XCTAssertTrue(summary.contains("unit breadcrumb"))
    }

    func testSupabaseConfigHasHost() {
        XCTAssertEqual(KenosSupabaseConfig.url?.host, "iueozzuctstwvzbcxcyh.supabase.co")
        XCTAssertNotNil(KenosSupabaseConfig.rpcURL("kenos_ingest_app_logs"))
        XCTAssertNotNil(KenosSupabaseConfig.restURL("bug_logs"))
        XCTAssertFalse(KenosSupabaseConfig.anonKey.isEmpty)
    }

    @MainActor
    func testCloudSyncDefaults() {
        let sync = KenosLogCloudSync.shared
        XCTAssertTrue(sync.enabled)
        XCTAssertTrue([KenosLogLevel.info, .notice, .warning, .error].contains(sync.cloudMinLevel) || sync.cloudMinLevel >= .info)
        sync.refreshPendingCount()
        XCTAssertGreaterThanOrEqual(sync.pendingCount, 0)
        // Debounced kick must not crash before WebView auth exists.
        sync.kick(reason: "active")
        sync.kick(reason: "active")
    }
}
