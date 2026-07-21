#if os(iOS)
import Foundation
import UIKit

/// Structured MetricKit / unclean-exit diagnostic (no PII bodies, tokens redacted).
struct KenosCrashDiagnosticSummary: Equatable, Codable, Sendable, Identifiable {
    var id: UUID
    var kind: String
    var applicationVersion: String
    var terminationReason: String
    var exceptionType: String
    var exceptionCode: String
    var signal: String
    var summaryText: String
    var fingerprint: String
    var receivedAt: Date
    var timeStampBegin: Date?
    var timeStampEnd: Date?

    var isSevere: Bool {
        switch kind {
        case "crash", "hang", "cpuException":
            return true
        default:
            return false
        }
    }

    var bugTitle: String {
        var parts = ["[\(kind)]"]
        if !signal.isEmpty { parts.append("signal=\(signal)") }
        if !exceptionType.isEmpty { parts.append("exc=\(exceptionType)") }
        if !terminationReason.isEmpty {
            parts.append(String(terminationReason.prefix(48)))
        } else if !applicationVersion.isEmpty {
            parts.append("v\(applicationVersion)")
        }
        return parts.joined(separator: " ")
    }
}

/// Pure JSON → summary parsing (unit-testable without live MetricKit payloads).
enum KenosCrashDiagnosticParser {
    static func summaries(
        fromDiagnosticJSON root: [String: Any],
        receivedAt: Date = Date()
    ) -> [KenosCrashDiagnosticSummary] {
        var out: [KenosCrashDiagnosticSummary] = []
        let begin = date(from: root["timeStampBegin"])
        let end = date(from: root["timeStampEnd"])

        appendDiagnostics(
            root["crashDiagnostics"],
            kind: "crash",
            receivedAt: receivedAt,
            begin: begin,
            end: end,
            into: &out
        )
        appendDiagnostics(
            root["hangDiagnostics"],
            kind: "hang",
            receivedAt: receivedAt,
            begin: begin,
            end: end,
            into: &out
        )
        appendDiagnostics(
            root["cpuExceptionDiagnostics"],
            kind: "cpuException",
            receivedAt: receivedAt,
            begin: begin,
            end: end,
            into: &out
        )
        appendDiagnostics(
            root["diskWriteExceptionDiagnostics"],
            kind: "diskWrite",
            receivedAt: receivedAt,
            begin: begin,
            end: end,
            into: &out
        )
        appendDiagnostics(
            root["appLaunchDiagnostics"],
            kind: "appLaunch",
            receivedAt: receivedAt,
            begin: begin,
            end: end,
            into: &out
        )
        return out
    }

    static func metricSummary(fromMetricJSON root: [String: Any]) -> [String: String] {
        var meta: [String: String] = [:]
        if let begin = stringDate(root["timeStampBegin"]) { meta["begin"] = begin }
        if let end = stringDate(root["timeStampEnd"]) { meta["end"] = end }

        if let launch = root["applicationLaunchMetrics"] as? [String: Any] {
            if let histogram = launch["histogrammedTimeToFirstDraw"] as? [String: Any],
               let count = firstInt(histogram)
            {
                meta["launchSamples"] = String(count)
            }
        }
        if let memory = root["memoryMetrics"] as? [String: Any] {
            if let peak = memory["peakMemoryUsage"] ?? memory["averageSuspendedMemory"] {
                meta["memory"] = String(String(describing: peak).prefix(64))
            }
        }
        if let hang = root["applicationResponsivenessMetrics"] as? [String: Any] {
            if let histogram = hang["histogrammedAppHangTime"] as? [String: Any],
               let count = firstInt(histogram)
            {
                meta["hangSamples"] = String(count)
            }
        }
        return meta
    }

    static func fingerprint(
        kind: String,
        applicationVersion: String,
        terminationReason: String,
        exceptionType: String,
        exceptionCode: String,
        signal: String,
        summaryText: String
    ) -> String {
        let raw = [
            kind,
            applicationVersion,
            terminationReason,
            exceptionType,
            exceptionCode,
            signal,
            String(summaryText.prefix(240)),
        ].joined(separator: "|")
        return stableHash(raw)
    }

    // MARK: Private

    private static func appendDiagnostics(
        _ raw: Any?,
        kind: String,
        receivedAt: Date,
        begin: Date?,
        end: Date?,
        into out: inout [KenosCrashDiagnosticSummary]
    ) {
        let items = asObjectArray(raw)
        for item in items {
            let appVersion = string(item["applicationVersion"])
                ?? string(dict(item["metaData"])?["applicationBuildVersion"])
                ?? ""
            let terminationReason = string(item["terminationReason"]) ?? ""
            let exceptionType = numberString(item["exceptionType"])
            let exceptionCode = numberString(item["exceptionCode"])
            let signal = numberString(item["signal"])
            let summaryText = compactJSON(item)
            let fp = fingerprint(
                kind: kind,
                applicationVersion: appVersion,
                terminationReason: terminationReason,
                exceptionType: exceptionType,
                exceptionCode: exceptionCode,
                signal: signal,
                summaryText: summaryText
            )
            out.append(
                KenosCrashDiagnosticSummary(
                    id: UUID(),
                    kind: kind,
                    applicationVersion: appVersion,
                    terminationReason: KenosLogRedactor.redact(terminationReason),
                    exceptionType: exceptionType,
                    exceptionCode: exceptionCode,
                    signal: signal,
                    summaryText: KenosLogRedactor.redact(summaryText),
                    fingerprint: fp,
                    receivedAt: receivedAt,
                    timeStampBegin: begin,
                    timeStampEnd: end
                )
            )
        }
    }

    private static func asObjectArray(_ raw: Any?) -> [[String: Any]] {
        if let arr = raw as? [[String: Any]] { return arr }
        if let arr = raw as? [Any] {
            return arr.compactMap { $0 as? [String: Any] }
        }
        return []
    }

    private static func dict(_ raw: Any?) -> [String: Any]? {
        raw as? [String: Any]
    }

    private static func string(_ raw: Any?) -> String? {
        if let s = raw as? String {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }
        return nil
    }

    private static func numberString(_ raw: Any?) -> String {
        if let n = raw as? NSNumber { return n.stringValue }
        if let s = string(raw) { return s }
        return ""
    }

    private static func date(from raw: Any?) -> Date? {
        if let d = raw as? Date { return d }
        if let s = string(raw) {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = f.date(from: s) { return d }
            f.formatOptions = [.withInternetDateTime]
            return f.date(from: s)
        }
        return nil
    }

    private static func stringDate(_ raw: Any?) -> String? {
        if let d = date(from: raw) { return KenosLogFormatting.iso8601(d) }
        return string(raw)
    }

    private static func firstInt(_ histogram: [String: Any]) -> Int? {
        if let n = histogram["histogramNumBuckets"] as? Int { return n }
        if let n = histogram["histogramValue"] as? Int { return n }
        if let values = histogram["histogramValue"] as? [Any] { return values.count }
        return nil
    }

    private static func compactJSON(_ object: [String: Any]) -> String {
        var slim = object
        // Drop bulky trees; keep enough for triage.
        slim.removeValue(forKey: "callStackTree")
        slim.removeValue(forKey: "diagnosticMetaData")
        guard let data = try? JSONSerialization.data(withJSONObject: slim, options: [.sortedKeys]),
              var text = String(data: data, encoding: .utf8)
        else {
            return String(String(describing: object).prefix(800))
        }
        if text.count > 1_200 {
            text = String(text.prefix(1_200)) + "…«truncated»"
        }
        return text
    }

    private static func stableHash(_ raw: String) -> String {
        var hash: UInt64 = 5381
        for byte in raw.utf8 {
            hash = ((hash << 5) &+ hash) &+ UInt64(byte)
        }
        return String(hash, radix: 16)
    }
}

/// Detects previous process death without a clean `willTerminate`.
enum KenosSessionWatchdog {
    private static let dirtyKey = "kenos.session.dirty"
    private static let lastSessionKey = "kenos.session.lastId"

    static func recordLaunch() {
        let defaults = UserDefaults.standard
        if defaults.bool(forKey: dirtyKey) {
            let previous = defaults.string(forKey: lastSessionKey) ?? ""
            KenosLog.fault(
                "previous session exited uncleanly",
                category: .diagnostics,
                metadata: [
                    "kind": "unclean_exit",
                    "previousSessionId": previous,
                    "breadcrumb": "1",
                ]
            )
        }
        defaults.set(true, forKey: dirtyKey)
        defaults.set(KenosLog.shared.sessionId, forKey: lastSessionKey)
    }

    static func markCleanExit() {
        UserDefaults.standard.set(false, forKey: dirtyKey)
    }
}

/// Records MetricKit diagnostics into KenosLog and auto-reports severe crashes to bug_logs.
@MainActor
final class KenosCrashReporter {
    static let shared = KenosCrashReporter()

    private static let reportedFingerprintsKey = "kenos.crash.reportedFingerprints"
    private static let maxFingerprints = 80
    private static let maxPendingFiles = 20

    private var flushTask: Task<Void, Never>?
    private var contentReadyObserver: NSObjectProtocol?
    private var reportedFingerprints: Set<String>

    private init() {
        let saved = UserDefaults.standard.stringArray(forKey: Self.reportedFingerprintsKey) ?? []
        reportedFingerprints = Set(saved)
    }

    func start() {
        KenosSessionWatchdog.recordLaunch()
        if contentReadyObserver == nil {
            contentReadyObserver = NotificationCenter.default.addObserver(
                forName: .kenosFirstContentReady,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    self?.flushPendingNow(reason: "first-content")
                }
            }
        }
        scheduleFlush(reason: "launch", delayNanoseconds: 2_500_000_000)
    }

    func handleMetricJSONBlobs(_ blobs: [Data]) {
        for data in blobs {
            guard let obj = jsonObject(from: data) else { continue }
            let meta = KenosCrashDiagnosticParser.metricSummary(fromMetricJSON: obj)
            KenosLog.notice(
                "MetricKit metrics",
                category: .diagnostics,
                metadata: meta.merging(["breadcrumb": "1"]) { _, new in new }
            )
        }
    }

    func handleDiagnosticJSONBlobs(_ blobs: [Data]) {
        var all: [KenosCrashDiagnosticSummary] = []
        for data in blobs {
            guard let obj = jsonObject(from: data) else { continue }
            all.append(contentsOf: KenosCrashDiagnosticParser.summaries(fromDiagnosticJSON: obj))
        }
        guard !all.isEmpty else {
            KenosLog.debug(
                "MetricKit diagnostics empty after parse",
                category: .diagnostics,
                metadata: ["payloads": String(blobs.count)]
            )
            return
        }
        ingest(all)
    }

    /// Test / unclean-exit seam.
    func ingest(_ summaries: [KenosCrashDiagnosticSummary]) {
        for summary in summaries {
            log(summary)
            guard summary.isSevere else { continue }
            guard !reportedFingerprints.contains(summary.fingerprint) else {
                KenosLog.info(
                    "crash diagnostic already reported",
                    category: .diagnostics,
                    metadata: ["fingerprint": summary.fingerprint, "kind": summary.kind]
                )
                continue
            }
            persistPending(summary)
        }
        scheduleFlush(reason: "diagnostics", delayNanoseconds: 1_200_000_000)
    }

    func flushPendingNow(reason: String = "manual") {
        scheduleFlush(reason: reason, delayNanoseconds: 0)
    }

    // MARK: Private

    private func log(_ summary: KenosCrashDiagnosticSummary) {
        var meta: [String: String] = [
            "kind": summary.kind,
            "fingerprint": summary.fingerprint,
            "appVersion": summary.applicationVersion,
            "breadcrumb": "1",
        ]
        if !summary.signal.isEmpty { meta["signal"] = summary.signal }
        if !summary.exceptionType.isEmpty { meta["exceptionType"] = summary.exceptionType }
        if !summary.exceptionCode.isEmpty { meta["exceptionCode"] = summary.exceptionCode }
        if !summary.terminationReason.isEmpty { meta["terminationReason"] = summary.terminationReason }
        if let begin = summary.timeStampBegin {
            meta["begin"] = KenosLogFormatting.iso8601(begin)
        }
        if let end = summary.timeStampEnd {
            meta["end"] = KenosLogFormatting.iso8601(end)
        }
        meta["detail"] = String(summary.summaryText.prefix(400))

        if summary.isSevere {
            KenosLog.fault("MetricKit \(summary.kind)", category: .diagnostics, metadata: meta)
        } else {
            KenosLog.warning("MetricKit \(summary.kind)", category: .diagnostics, metadata: meta)
        }
    }

    private func scheduleFlush(reason: String, delayNanoseconds: UInt64) {
        flushTask?.cancel()
        flushTask = Task { @MainActor in
            if delayNanoseconds > 0 {
                try? await Task.sleep(nanoseconds: delayNanoseconds)
            }
            guard !Task.isCancelled else { return }
            await flushPending(reason: reason)
        }
    }

    private func flushPending(reason: String) async {
        let files = pendingFiles()
        guard !files.isEmpty else {
            // Still push any fault/error logs already written.
            _ = await KenosLogCloudSync.shared.uploadPending(reason: "crash-\(reason)")
            return
        }

        let auth = await KenosBugReportWebAuth.load(from: KenosActiveWebRegistry.preferred)
        guard let auth else {
            KenosLog.info(
                "auto crash report waiting for web sign-in",
                category: .diagnostics,
                metadata: [
                    "pending": String(files.count),
                    "reason": reason,
                ]
            )
            _ = await KenosLogCloudSync.shared.uploadPending(reason: "crash-\(reason)")
            return
        }

        for url in files {
            guard let summary = loadPending(url: url) else {
                try? FileManager.default.removeItem(at: url)
                continue
            }
            if reportedFingerprints.contains(summary.fingerprint) {
                try? FileManager.default.removeItem(at: url)
                continue
            }

            let draft = makeDraft(from: summary)
            do {
                let result = try await KenosBugReportSubmitter.submit(
                    draft: draft,
                    auth: auth,
                    preferRemote: true,
                    attachLogs: true
                )
                switch result {
                case .remote(let bugId):
                    markReported(summary.fingerprint)
                    try? FileManager.default.removeItem(at: url)
                    KenosLog.notice(
                        "auto crash report uploaded",
                        category: .diagnostics,
                        metadata: [
                            "bugId": String(bugId.prefix(8)),
                            "kind": summary.kind,
                            "fingerprint": summary.fingerprint,
                            "reason": reason,
                            "breadcrumb": "1",
                        ]
                    )
                case .local(let dir):
                    // Keep pending so a later signed-in session can still push remote.
                    KenosLog.warning(
                        "auto crash report saved locally — will retry remote",
                        category: .diagnostics,
                        metadata: [
                            "path": dir.lastPathComponent,
                            "kind": summary.kind,
                            "fingerprint": summary.fingerprint,
                            "reason": reason,
                            "breadcrumb": "1",
                        ]
                    )
                }
            } catch {
                KenosLog.warning(
                    "auto crash report failed",
                    category: .diagnostics,
                    metadata: [
                        "error": KenosLogRedactor.redact(error.localizedDescription),
                        "kind": summary.kind,
                        "reason": reason,
                    ]
                )
            }
        }

        _ = await KenosLogCloudSync.shared.uploadPending(reason: "crash-\(reason)")
    }

    private func makeDraft(from summary: KenosCrashDiagnosticSummary) -> KenosBugReportDraft {
        let now = ISO8601DateFormatter().string(from: summary.receivedAt)
        let notes = [
            "Auto-reported from MetricKit (no screenshot).",
            "kind: \(summary.kind)",
            "signal: \(summary.signal.isEmpty ? "—" : summary.signal)",
            "exceptionType: \(summary.exceptionType.isEmpty ? "—" : summary.exceptionType)",
            "exceptionCode: \(summary.exceptionCode.isEmpty ? "—" : summary.exceptionCode)",
            "terminationReason: \(summary.terminationReason.isEmpty ? "—" : summary.terminationReason)",
            "applicationVersion: \(summary.applicationVersion.isEmpty ? "—" : summary.applicationVersion)",
            "fingerprint: \(summary.fingerprint)",
            "",
            "summary:",
            summary.summaryText,
        ].joined(separator: "\n")

        let diagnostics = KenosBugDiagnostics(
            app: "kenos",
            route: "metrickit/\(summary.kind)",
            pageTitle: "MetricKit \(summary.kind)",
            heading: summary.bugTitle,
            href: "",
            tab: "diagnostics",
            domainLabel: "",
            viewportWidth: Int(UIScreen.main.bounds.width.rounded()),
            viewportHeight: Int(UIScreen.main.bounds.height.rounded()),
            devicePixelRatio: UIScreen.main.scale,
            userAgent: "kenos-ios-metrickit",
            timestamp: now,
            shellMode: "kenos",
            build: KenosBugDeviceInfo.build,
            marketingVersion: KenosBugDeviceInfo.marketingVersion,
            originHost: KenosDailyBetaConfig.kenOsOrigin.host ?? "",
            deviceModel: KenosBugDeviceInfo.model,
            systemVersion: KenosBugDeviceInfo.systemVersion,
            authState: "auto",
            online: true,
            focusState: "off",
            lastErrorClass: summary.kind,
            screenshotBytes: 0,
            consoleSummary: String(summary.summaryText.prefix(500)),
            webViewKind: "none",
            captureSource: "metrickit",
            captureMs: 0,
            scrapeMs: 0,
            scrapeTimedOut: false,
            locale: KenosBugDeviceInfo.localeIdentifier,
            webSignedIn: nil
        )

        return KenosBugReportDraft(
            id: summary.id,
            title: summary.bugTitle,
            notes: notes,
            severity: .high,
            screenshotJPEG: nil,
            diagnostics: diagnostics,
            capturedAt: summary.receivedAt
        )
    }

    private func persistPending(_ summary: KenosCrashDiagnosticSummary) {
        let dir = pendingDirectory()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("\(summary.fingerprint)-\(summary.id.uuidString.prefix(8)).json")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(summary) else { return }
        try? data.write(to: url, options: .atomic)
        prunePending()
        KenosLog.info(
            "crash diagnostic queued",
            category: .diagnostics,
            metadata: [
                "kind": summary.kind,
                "fingerprint": summary.fingerprint,
                "file": url.lastPathComponent,
            ]
        )
    }

    private func pendingDirectory() -> URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("kenos-crash-reports", isDirectory: true)
    }

    private func pendingFiles() -> [URL] {
        let dir = pendingDirectory()
        let urls = (try? FileManager.default.contentsOfDirectory(
            at: dir,
            includingPropertiesForKeys: [.contentModificationDateKey]
        )) ?? []
        return urls
            .filter { $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    private func loadPending(url: URL) -> KenosCrashDiagnosticSummary? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(KenosCrashDiagnosticSummary.self, from: data)
    }

    private func prunePending() {
        let files = pendingFiles()
        guard files.count > Self.maxPendingFiles else { return }
        for stale in files.prefix(files.count - Self.maxPendingFiles) {
            try? FileManager.default.removeItem(at: stale)
        }
    }

    private func markReported(_ fingerprint: String) {
        reportedFingerprints.insert(fingerprint)
        if reportedFingerprints.count > Self.maxFingerprints {
            reportedFingerprints = Set(Array(reportedFingerprints).suffix(Self.maxFingerprints / 2))
        }
        UserDefaults.standard.set(Array(reportedFingerprints), forKey: Self.reportedFingerprintsKey)
    }

    private func jsonObject(from data: Data) -> [String: Any]? {
        (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
}
#endif
