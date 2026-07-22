import XCTest
@testable import KenosIOS

#if os(iOS)
final class KenosCrashReportTests: XCTestCase {
    func testParserReadsDiagnosticMetaDataAndCallStack() {
        // Shape matches live MXCrashDiagnostic.jsonRepresentation() — fields live
        // under diagnosticMetaData / callStackTree, not the payload root.
        let root: [String: Any] = [
            "timeStampBegin": "2026-07-21T12:00:00Z",
            "timeStampEnd": "2026-07-21T12:05:00Z",
            "crashDiagnostics": [
                [
                    "version": "1.0.0",
                    "applicationVersion": "1.0.0",
                    "diagnosticMetaData": [
                        "appVersion": "1.0.0",
                        "appBuildVersion": "202607212249",
                        "osVersion": "iPhone OS 27.0 (24A5380h)",
                        "deviceType": "iPhone18,1",
                        "exceptionType": 6,
                        "exceptionCode": 1,
                        "signal": 5,
                        "terminationReason": "Namespace SIGNAL, Code 5 Trace/BPT trap: 5",
                        "platformArchitecture": "arm64e",
                    ],
                    "callStackTree": [
                        "callStackPerThread": true,
                        "callStacks": [
                            [
                                "threadAttributed": true,
                                "callStackRootFrames": [
                                    [
                                        "binaryName": "libdispatch.dylib",
                                        "offsetIntoBinaryTextSegment": 100,
                                        "subFrames": [
                                            [
                                                "binaryName": "libswift_Concurrency.dylib",
                                                "offsetIntoBinaryTextSegment": 200,
                                                "subFrames": [
                                                    [
                                                        "binaryName": "KenosIOS.debug.dylib",
                                                        "offsetIntoBinaryTextSegment": 0x1234,
                                                        "subFrames": [
                                                            [
                                                                "binaryName": "MediaPlayer",
                                                                "offsetIntoBinaryTextSegment": 99,
                                                            ],
                                                        ],
                                                    ],
                                                ],
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
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
        XCTAssertEqual(crash?.signal, "5")
        XCTAssertEqual(crash?.signalName, "SIGTRAP")
        XCTAssertEqual(crash?.exceptionType, "6")
        XCTAssertEqual(crash?.exceptionName, "EXC_BREAKPOINT")
        XCTAssertEqual(crash?.buildVersion, "202607212249")
        XCTAssertEqual(crash?.deviceType, "iPhone18,1")
        XCTAssertTrue(crash?.crashedBinary.contains("Kenos") == true)
        XCTAssertTrue(crash?.topFrames.contains("KenosIOS.debug.dylib") == true)
        XCTAssertTrue(crash?.topFrames.contains("MediaPlayer") == true)
        // Must not collapse to the useless MetricKit envelope version alone.
        XCTAssertFalse(crash?.summaryText == #"{"version":"1.0.0"}"#)
        XCTAssertTrue(crash?.summaryText.contains("SIGTRAP") == true
            || crash?.summaryText.contains("stack:") == true
            || crash?.topFrames.isEmpty == false)
        XCTAssertTrue(crash?.isSevere == true)
        XCTAssertTrue(crash?.bugTitle.contains("SIGTRAP") == true)
        XCTAssertTrue(crash?.bugTitle.contains("EXC_BREAKPOINT") == true)
        XCTAssertTrue(crash?.logHeadline.contains("SIGTRAP") == true)

        let hang = summaries.first { $0.kind == "hang" }
        XCTAssertTrue(hang?.isSevere == true)

        let disk = summaries.first { $0.kind == "diskWrite" }
        XCTAssertTrue(disk?.isSevere == false)
    }

    func testFingerprintUsesStackNotEnvelopeVersion() {
        let a = KenosCrashDiagnosticParser.fingerprint(
            kind: "crash",
            signal: "5",
            exceptionType: "6",
            crashedBinary: "KenosIOS.debug.dylib",
            topFrames: "libdispatch.dylib +1\nKenosIOS.debug.dylib +4660",
            buildVersion: "202607212249"
        )
        let b = KenosCrashDiagnosticParser.fingerprint(
            kind: "crash",
            signal: "5",
            exceptionType: "6",
            crashedBinary: "KenosIOS.debug.dylib",
            topFrames: "libdispatch.dylib +1\nKenosIOS.debug.dylib +4660",
            buildVersion: "202607212249"
        )
        let c = KenosCrashDiagnosticParser.fingerprint(
            kind: "crash",
            signal: "5",
            exceptionType: "6",
            crashedBinary: "KenosIOS.debug.dylib",
            topFrames: "different stack frame",
            buildVersion: "202607212249"
        )
        XCTAssertEqual(a, b)
        XCTAssertNotEqual(a, c)
        XCTAssertFalse(a.isEmpty)
    }

    func testExtractTopFramesPrefersAttributedThread() {
        let tree: [String: Any] = [
            "callStacks": [
                [
                    "threadAttributed": false,
                    "callStackRootFrames": [
                        ["binaryName": "Other.bin", "offsetIntoBinaryTextSegment": 1],
                    ],
                ],
                [
                    "threadAttributed": true,
                    "callStackRootFrames": [
                        [
                            "binaryName": "KenosIOS.debug.dylib",
                            "offsetIntoBinaryTextSegment": 42,
                            "subFrames": [
                                ["binaryName": "MediaPlayer", "offsetIntoBinaryTextSegment": 7],
                            ],
                        ],
                    ],
                ],
            ],
        ]
        let extracted = KenosCrashDiagnosticParser.extractTopFrames(from: tree)
        XCTAssertEqual(extracted.crashedBinary, "KenosIOS.debug.dylib")
        XCTAssertTrue(extracted.frames.contains(where: { $0.contains("MediaPlayer") }))
        XCTAssertFalse(extracted.frames.contains(where: { $0.contains("Other.bin") }))
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

    func testMemoryExceptionIsSevere() {
        let root: [String: Any] = [
            "memoryExceptionDiagnostics": [
                [
                    "version": "1.0.0",
                    "diagnosticMetaData": [
                        "appBuildVersion": "202607212332",
                        "terminationReason": "Namespace JETSAM, Code 0xdead10cc",
                        "terminationCategory": "memory",
                    ],
                    "callStackTree": [
                        "callStacks": [
                            [
                                "threadAttributed": true,
                                "callStackRootFrames": [
                                    [
                                        "binaryName": "KenosIOS.debug.dylib",
                                        "offsetIntoBinaryTextSegment": 99,
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ]
        let mem = KenosCrashDiagnosticParser.summaries(fromDiagnosticJSON: root)
            .first { $0.kind == "memoryException" }
        XCTAssertNotNil(mem)
        XCTAssertTrue(mem?.isSevere == true)
        XCTAssertTrue(mem?.summaryText.contains("terminationCategory=memory") == true)
        XCTAssertTrue(mem?.crashedBinary.contains("Kenos") == true)
    }

    func testSevereKindsMatchBugPolicy() {
        let crash = KenosCrashDiagnosticSummary(
            id: UUID(),
            kind: "crash",
            applicationVersion: "1",
            terminationReason: "",
            exceptionType: "6",
            exceptionCode: "",
            exceptionName: "EXC_BREAKPOINT",
            signal: "5",
            signalName: "SIGTRAP",
            summaryText: "{}",
            topFrames: "KenosIOS.debug.dylib +1",
            crashedBinary: "KenosIOS.debug.dylib",
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
        XCTAssertTrue(crash.bugTitle.contains("SIGTRAP"))
        XCTAssertTrue(crash.bugTitle.contains("EXC_BREAKPOINT"))
    }

    func testCrashContextStorePersistsDomainAndTrail() {
        KenosCrashContextStore.noteLaunch(sessionId: "sess-test", build: "build-test")
        KenosCrashContextStore.noteSpace("music")
        let url = URL(string: "http://kens-m5-max-macbook-pro.tail04e0e6.ts.net:5189/")!
        KenosCrashContextStore.noteDomain(url: url)
        KenosCrashContextStore.noteNowPlaying(trackId: "t1", title: "Demo", playing: true)
        KenosCrashContextStore.noteBreadcrumb("[navigation] open space space=music")
        KenosCrashContextStore.noteBreadcrumb("[shell] enter domain mode host=… path=/")

        let snap = KenosCrashContextStore.load()
        XCTAssertEqual(snap?.lastSpace, "music")
        XCTAssertEqual(snap?.domainId, "music")
        XCTAssertEqual(snap?.continuityHost, "kens-m5-max-macbook-pro.tail04e0e6.ts.net")
        XCTAssertTrue(snap?.nowPlaying.contains("Demo") == true)
        XCTAssertFalse(snap?.trailSummary.isEmpty == true)

        let meta = KenosCrashContextStore.metadata(from: snap)
        XCTAssertEqual(meta["ctxDomain"], "music")
        XCTAssertEqual(meta["ctxHost"], "kens-m5-max-macbook-pro.tail04e0e6.ts.net")
        XCTAssertTrue(meta["ctxTrail"]?.contains("open space") == true)

        KenosCrashContextStore.clearNowPlaying()
        XCTAssertEqual(KenosCrashContextStore.load()?.nowPlaying, "")
    }

    func testDiagnosticsCategoryExists() {
        XCTAssertEqual(KenosLogCategory.parse("diagnostics"), .diagnostics)
        XCTAssertEqual(KenosLogCategory.diagnostics.title, "Diagnostics")
    }

    func testLegacyPendingSummaryStillDecodable() throws {
        // Older queued files lacked topFrames / signalName — must still load.
        let legacy: [String: Any] = [
            "id": UUID().uuidString,
            "kind": "crash",
            "applicationVersion": "1.0.0",
            "terminationReason": "SIGNAL 5",
            "exceptionType": "6",
            "exceptionCode": "1",
            "signal": "5",
            "summaryText": #"{"version":"1.0.0"}"#,
            "fingerprint": "legacyfp",
            "receivedAt": "2026-07-21T12:00:00Z",
        ]
        let data = try JSONSerialization.data(withJSONObject: legacy)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let summary = try decoder.decode(KenosCrashDiagnosticSummary.self, from: data)
        XCTAssertEqual(summary.fingerprint, "legacyfp")
        XCTAssertEqual(summary.topFrames, "")
        XCTAssertEqual(summary.signalName, "")
    }
}
#endif
