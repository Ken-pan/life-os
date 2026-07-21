import XCTest
@testable import KenosIOS

#if os(iOS)
final class KenosCrashReportTests: XCTestCase {
    func testParserExtractsCrashAndHang() {
        let root: [String: Any] = [
            "timeStampBegin": "2026-07-21T12:00:00Z",
            "timeStampEnd": "2026-07-21T12:05:00Z",
            "crashDiagnostics": [
                [
                    "applicationVersion": "1.0.0",
                    "terminationReason": "Namespace SIGNAL, Code 11 Segmentation fault: 11",
                    "exceptionType": 1,
                    "exceptionCode": 0,
                    "signal": 11,
                    "callStackTree": ["frames": ["should-not-appear-in-summary"]],
                ],
            ],
            "hangDiagnostics": [
                [
                    "applicationVersion": "1.0.0",
                    "hangDuration": "3.2",
                ],
            ],
            "diskWriteExceptionDiagnostics": [
                [
                    "applicationVersion": "1.0.0",
                    "totalWritesCaused": 12_000_000,
                ],
            ],
        ]

        let summaries = KenosCrashDiagnosticParser.summaries(fromDiagnosticJSON: root)
        XCTAssertEqual(summaries.count, 3)

        let crash = summaries.first { $0.kind == "crash" }
        XCTAssertNotNil(crash)
        XCTAssertEqual(crash?.signal, "11")
        XCTAssertEqual(crash?.exceptionType, "1")
        XCTAssertTrue(crash?.isSevere == true)
        XCTAssertFalse(crash?.summaryText.contains("should-not-appear-in-summary") ?? true)
        XCTAssertTrue(crash?.bugTitle.contains("[crash]") == true)

        let hang = summaries.first { $0.kind == "hang" }
        XCTAssertTrue(hang?.isSevere == true)

        let disk = summaries.first { $0.kind == "diskWrite" }
        XCTAssertTrue(disk?.isSevere == false)
    }

    func testFingerprintStableForSamePayload() {
        let a = KenosCrashDiagnosticParser.fingerprint(
            kind: "crash",
            applicationVersion: "1.0.0",
            terminationReason: "SIGNAL 11",
            exceptionType: "1",
            exceptionCode: "0",
            signal: "11",
            summaryText: #"{"signal":11}"#
        )
        let b = KenosCrashDiagnosticParser.fingerprint(
            kind: "crash",
            applicationVersion: "1.0.0",
            terminationReason: "SIGNAL 11",
            exceptionType: "1",
            exceptionCode: "0",
            signal: "11",
            summaryText: #"{"signal":11}"#
        )
        let c = KenosCrashDiagnosticParser.fingerprint(
            kind: "hang",
            applicationVersion: "1.0.0",
            terminationReason: "SIGNAL 11",
            exceptionType: "1",
            exceptionCode: "0",
            signal: "11",
            summaryText: #"{"signal":11}"#
        )
        XCTAssertEqual(a, b)
        XCTAssertNotEqual(a, c)
        XCTAssertFalse(a.isEmpty)
    }

    func testMetricSummaryExtractsLaunchAndHangSamples() {
        let root: [String: Any] = [
            "timeStampBegin": "2026-07-21T12:00:00Z",
            "applicationLaunchMetrics": [
                "histogrammedTimeToFirstDraw": [
                    "histogramNumBuckets": 4,
                ],
            ],
            "applicationResponsivenessMetrics": [
                "histogrammedAppHangTime": [
                    "histogramNumBuckets": 2,
                ],
            ],
            "memoryMetrics": [
                "peakMemoryUsage": "180 MB",
            ],
        ]
        let meta = KenosCrashDiagnosticParser.metricSummary(fromMetricJSON: root)
        XCTAssertEqual(meta["launchSamples"], "4")
        XCTAssertEqual(meta["hangSamples"], "2")
        XCTAssertTrue(meta["memory"]?.contains("180") == true)
    }

    func testSevereKindsMatchBugPolicy() {
        let crash = KenosCrashDiagnosticSummary(
            id: UUID(),
            kind: "crash",
            applicationVersion: "1",
            terminationReason: "",
            exceptionType: "",
            exceptionCode: "",
            signal: "11",
            summaryText: "{}",
            fingerprint: "a",
            receivedAt: Date(),
            timeStampBegin: nil,
            timeStampEnd: nil
        )
        let launch = KenosCrashDiagnosticSummary(
            id: UUID(),
            kind: "appLaunch",
            applicationVersion: "1",
            terminationReason: "",
            exceptionType: "",
            exceptionCode: "",
            signal: "",
            summaryText: "{}",
            fingerprint: "b",
            receivedAt: Date(),
            timeStampBegin: nil,
            timeStampEnd: nil
        )
        XCTAssertTrue(crash.isSevere)
        XCTAssertFalse(launch.isSevere)
        XCTAssertTrue(crash.bugTitle.contains("signal=11"))
    }

    func testDiagnosticsCategoryExists() {
        XCTAssertEqual(KenosLogCategory.parse("diagnostics"), .diagnostics)
        XCTAssertEqual(KenosLogCategory.diagnostics.title, "Diagnostics")
    }
}
#endif
