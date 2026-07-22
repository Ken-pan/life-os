#if os(iOS)
import Foundation
import UIKit

/// Structured MetricKit / unclean-exit diagnostic (no PII bodies, tokens redacted).
struct KenosCrashDiagnosticSummary: Equatable, Codable, Sendable, Identifiable {
    var id: UUID
    var kind: String
    var applicationVersion: String
    var buildVersion: String
    var osVersion: String
    var deviceType: String
    var terminationReason: String
    var exceptionType: String
    var exceptionCode: String
    var exceptionName: String
    var signal: String
    var signalName: String
    var summaryText: String
    /// Compact attributed-thread frames, newest/deepest last (MetricKit nesting order).
    var topFrames: String
    var crashedBinary: String
    var fingerprint: String
    var receivedAt: Date
    var timeStampBegin: Date?
    var timeStampEnd: Date?

    var isSevere: Bool {
        switch kind {
        case "crash", "hang", "cpuException", "memoryException":
            return true
        default:
            return false
        }
    }

    var bugTitle: String {
        var parts = ["[\(kind)]"]
        if !signalName.isEmpty { parts.append(signalName) }
        else if !signal.isEmpty { parts.append("signal=\(signal)") }
        if !exceptionName.isEmpty { parts.append(exceptionName) }
        else if !exceptionType.isEmpty { parts.append("exc=\(exceptionType)") }
        if !crashedBinary.isEmpty {
            parts.append(crashedBinary)
        } else if !terminationReason.isEmpty {
            parts.append(String(terminationReason.prefix(48)))
        } else if !buildVersion.isEmpty {
            parts.append("b\(buildVersion)")
        } else if !applicationVersion.isEmpty {
            parts.append("v\(applicationVersion)")
        }
        return parts.joined(separator: " ")
    }

    var logHeadline: String {
        var parts = ["MetricKit", kind]
        if !signalName.isEmpty { parts.append(signalName) }
        if !exceptionName.isEmpty { parts.append(exceptionName) }
        if !crashedBinary.isEmpty { parts.append(crashedBinary) }
        return parts.joined(separator: " ")
    }

    enum CodingKeys: String, CodingKey {
        case id, kind, applicationVersion, buildVersion, osVersion, deviceType
        case terminationReason, exceptionType, exceptionCode, exceptionName
        case signal, signalName, summaryText, topFrames, crashedBinary
        case fingerprint, receivedAt, timeStampBegin, timeStampEnd
    }

    init(
        id: UUID,
        kind: String,
        applicationVersion: String,
        buildVersion: String = "",
        osVersion: String = "",
        deviceType: String = "",
        terminationReason: String,
        exceptionType: String,
        exceptionCode: String,
        exceptionName: String = "",
        signal: String,
        signalName: String = "",
        summaryText: String,
        topFrames: String = "",
        crashedBinary: String = "",
        fingerprint: String,
        receivedAt: Date,
        timeStampBegin: Date?,
        timeStampEnd: Date?
    ) {
        self.id = id
        self.kind = kind
        self.applicationVersion = applicationVersion
        self.buildVersion = buildVersion
        self.osVersion = osVersion
        self.deviceType = deviceType
        self.terminationReason = terminationReason
        self.exceptionType = exceptionType
        self.exceptionCode = exceptionCode
        self.exceptionName = exceptionName
        self.signal = signal
        self.signalName = signalName
        self.summaryText = summaryText
        self.topFrames = topFrames
        self.crashedBinary = crashedBinary
        self.fingerprint = fingerprint
        self.receivedAt = receivedAt
        self.timeStampBegin = timeStampBegin
        self.timeStampEnd = timeStampEnd
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        kind = try c.decode(String.self, forKey: .kind)
        applicationVersion = try c.decodeIfPresent(String.self, forKey: .applicationVersion) ?? ""
        buildVersion = try c.decodeIfPresent(String.self, forKey: .buildVersion) ?? ""
        osVersion = try c.decodeIfPresent(String.self, forKey: .osVersion) ?? ""
        deviceType = try c.decodeIfPresent(String.self, forKey: .deviceType) ?? ""
        terminationReason = try c.decodeIfPresent(String.self, forKey: .terminationReason) ?? ""
        exceptionType = try c.decodeIfPresent(String.self, forKey: .exceptionType) ?? ""
        exceptionCode = try c.decodeIfPresent(String.self, forKey: .exceptionCode) ?? ""
        exceptionName = try c.decodeIfPresent(String.self, forKey: .exceptionName) ?? ""
        signal = try c.decodeIfPresent(String.self, forKey: .signal) ?? ""
        signalName = try c.decodeIfPresent(String.self, forKey: .signalName) ?? ""
        summaryText = try c.decodeIfPresent(String.self, forKey: .summaryText) ?? ""
        topFrames = try c.decodeIfPresent(String.self, forKey: .topFrames) ?? ""
        crashedBinary = try c.decodeIfPresent(String.self, forKey: .crashedBinary) ?? ""
        fingerprint = try c.decode(String.self, forKey: .fingerprint)
        receivedAt = try c.decode(Date.self, forKey: .receivedAt)
        timeStampBegin = try c.decodeIfPresent(Date.self, forKey: .timeStampBegin)
        timeStampEnd = try c.decodeIfPresent(Date.self, forKey: .timeStampEnd)
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
        appendDiagnostics(
            root["memoryExceptionDiagnostics"],
            kind: "memoryException",
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
        signal: String,
        exceptionType: String,
        crashedBinary: String,
        topFrames: String,
        buildVersion: String
    ) -> String {
        let raw = [
            kind,
            signal,
            exceptionType,
            crashedBinary,
            buildVersion,
            String(topFrames.prefix(280)),
        ].joined(separator: "|")
        return stableHash(raw)
    }

    /// Walk MetricKit `callStackTree` and return compact frame lines + best Kenos binary.
    static func extractTopFrames(
        from callStackTree: Any?,
        limit: Int = 14
    ) -> (frames: [String], crashedBinary: String) {
        guard let tree = callStackTree as? [String: Any] else { return ([], "") }
        let stacks = asObjectArray(tree["callStacks"])
        let attributed = stacks.first { bool($0["threadAttributed"]) }
            ?? stacks.first
        guard let stack = attributed else { return ([], "") }
        let roots = asObjectArray(stack["callStackRootFrames"])
        var frames: [String] = []
        var kenosBinary = ""

        func walk(_ frame: [String: Any]) {
            guard frames.count < limit else { return }
            let binary = string(frame["binaryName"]) ?? "?"
            let offset = intValue(frame["offsetIntoBinaryTextSegment"])
            let symbol = string(frame["symbol"])
            let line: String
            if let symbol, !symbol.isEmpty {
                line = "\(binary) \(symbol)"
            } else if offset >= 0 {
                line = "\(binary) +\(offset)"
            } else {
                line = binary
            }
            frames.append(line)
            if kenosBinary.isEmpty, binary.localizedCaseInsensitiveContains("Kenos") {
                kenosBinary = binary
            }
            for sub in asObjectArray(frame["subFrames"]) {
                walk(sub)
            }
        }
        for root in roots { walk(root) }
        if kenosBinary.isEmpty {
            kenosBinary = frames.reversed().first(where: {
                $0.localizedCaseInsensitiveContains("Kenos")
            }).flatMap { $0.split(separator: " ").first.map(String.init) } ?? ""
        }
        return (frames, kenosBinary)
    }

    static func signalName(for code: String) -> String {
        switch code {
        case "4": return "SIGILL"
        case "5": return "SIGTRAP"
        case "6": return "SIGABRT"
        case "8": return "SIGFPE"
        case "9": return "SIGKILL"
        case "10": return "SIGBUS"
        case "11": return "SIGSEGV"
        case "12": return "SIGSYS"
        default: return ""
        }
    }

    static func exceptionName(for type: String) -> String {
        switch type {
        case "1": return "EXC_BAD_ACCESS"
        case "2": return "EXC_BAD_INSTRUCTION"
        case "3": return "EXC_ARITHMETIC"
        case "4": return "EXC_EMULATION"
        case "5": return "EXC_SOFTWARE"
        case "6": return "EXC_BREAKPOINT"
        case "9": return "EXC_RESOURCE"
        case "10": return "EXC_GUARD"
        default: return ""
        }
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
            let meta = dict(item["diagnosticMetaData"]) ?? [:]
            let appVersion = string(item["applicationVersion"])
                ?? string(meta["appVersion"])
                ?? string(dict(item["metaData"])?["applicationBuildVersion"])
                ?? ""
            let buildVersion = string(meta["appBuildVersion"])
                ?? string(meta["applicationBuildVersion"])
                ?? ""
            let osVersion = string(meta["osVersion"]) ?? ""
            let deviceType = string(meta["deviceType"]) ?? ""
            let terminationReason = string(item["terminationReason"])
                ?? string(meta["terminationReason"])
                ?? ""
            let terminationCategory = string(item["terminationCategory"])
                ?? string(meta["terminationCategory"])
                ?? ""
            let exceptionType = numberString(item["exceptionType"]).ifEmpty(numberString(meta["exceptionType"]))
            let exceptionCode = numberString(item["exceptionCode"]).ifEmpty(numberString(meta["exceptionCode"]))
            let signal = numberString(item["signal"]).ifEmpty(numberString(meta["signal"]))
            let excName = exceptionName(for: exceptionType)
            let sigName = signalName(for: signal)
            let (frameLines, crashedBinary) = extractTopFrames(from: item["callStackTree"])
            let topFrames = frameLines.joined(separator: "\n")
            var summaryText = compactSummary(
                kind: kind,
                item: item,
                meta: meta,
                topFrames: topFrames
            )
            if !terminationCategory.isEmpty {
                summaryText = "terminationCategory=\(terminationCategory)\n" + summaryText
            }
            let fp = fingerprint(
                kind: kind,
                signal: signal,
                exceptionType: exceptionType,
                crashedBinary: crashedBinary,
                topFrames: topFrames,
                buildVersion: buildVersion
            )
            out.append(
                KenosCrashDiagnosticSummary(
                    id: UUID(),
                    kind: kind,
                    applicationVersion: appVersion,
                    buildVersion: buildVersion,
                    osVersion: osVersion,
                    deviceType: deviceType,
                    terminationReason: KenosLogRedactor.redact(terminationReason),
                    exceptionType: exceptionType,
                    exceptionCode: exceptionCode,
                    exceptionName: excName,
                    signal: signal,
                    signalName: sigName,
                    summaryText: KenosLogRedactor.redact(summaryText),
                    topFrames: KenosLogRedactor.redact(topFrames),
                    crashedBinary: crashedBinary,
                    fingerprint: fp,
                    receivedAt: receivedAt,
                    timeStampBegin: begin,
                    timeStampEnd: end
                )
            )
        }
    }

    private static func compactSummary(
        kind: String,
        item: [String: Any],
        meta: [String: Any],
        topFrames: String
    ) -> String {
        var lines: [String] = []
        lines.append("kind=\(kind)")
        if let v = string(meta["appBuildVersion"]) ?? string(item["applicationVersion"]) {
            lines.append("build=\(v)")
        }
        if let v = string(meta["osVersion"]) { lines.append("os=\(v)") }
        if let v = string(meta["deviceType"]) { lines.append("device=\(v)") }
        if let v = string(item["terminationReason"]) ?? string(meta["terminationReason"]) {
            lines.append("termination=\(v)")
        }
        if let v = string(item["hangDuration"]) ?? numberString(item["hangDuration"]).nilIfEmpty {
            lines.append("hangDuration=\(v)")
        }
        if let v = string(meta["virtualMemoryRegionInfo"]) {
            lines.append("vm=\(String(v.prefix(160)))")
        }
        if !topFrames.isEmpty {
            lines.append("stack:")
            lines.append(contentsOf: topFrames.split(separator: "\n").prefix(14).map(String.init))
        } else {
            // Fallback: tiny non-tree residue (never dump full callStackTree).
            var slim = item
            slim.removeValue(forKey: "callStackTree")
            slim.removeValue(forKey: "diagnosticMetaData")
            if let data = try? JSONSerialization.data(withJSONObject: slim, options: [.sortedKeys]),
               let text = String(data: data, encoding: .utf8)
            {
                lines.append(String(text.prefix(240)))
            }
        }
        let text = lines.joined(separator: "\n")
        if text.count > 1_600 {
            return String(text.prefix(1_600)) + "…«truncated»"
        }
        return text
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

    private static func intValue(_ raw: Any?) -> Int {
        if let n = raw as? Int { return n }
        if let n = raw as? NSNumber { return n.intValue }
        if let s = string(raw), let n = Int(s) { return n }
        return -1
    }

    private static func bool(_ raw: Any?) -> Bool {
        if let b = raw as? Bool { return b }
        if let n = raw as? NSNumber { return n.boolValue }
        return false
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

    private static func stableHash(_ raw: String) -> String {
        var hash: UInt64 = 5381
        for byte in raw.utf8 {
            hash = ((hash << 5) &+ hash) &+ UInt64(byte)
        }
        return String(hash, radix: 16)
    }
}

private extension String {
    func ifEmpty(_ other: String) -> String { isEmpty ? other : self }
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

/// Detects previous process death without a clean `willTerminate`.
enum KenosSessionWatchdog {
    private static let dirtyKey = "kenos.session.dirty"
    private static let lastSessionKey = "kenos.session.lastId"

    static func recordLaunch() {
        let defaults = UserDefaults.standard
        let previous = defaults.string(forKey: lastSessionKey) ?? ""
        if defaults.bool(forKey: dirtyKey) {
            var meta: [String: String] = [
                "kind": "unclean_exit",
                "event": "unclean_exit",
                "schema": "kenos.crash.v2",
                "previousSessionId": previous,
                "breadcrumb": "1",
            ]
            let ctx = KenosCrashContextStore.load()
            meta.merge(KenosCrashContextStore.metadata(from: ctx)) { _, new in new }
            KenosLog.fault(
                "previous session exited uncleanly",
                category: .diagnostics,
                metadata: meta
            )
        }
        defaults.set(true, forKey: dirtyKey)
        defaults.set(KenosLog.shared.sessionId, forKey: lastSessionKey)
        KenosCrashContextStore.noteLaunch(
            sessionId: KenosLog.shared.sessionId,
            build: KenosBugDeviceInfo.build
        )
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
        if !summary.buildVersion.isEmpty { meta["buildVersion"] = summary.buildVersion }
        if !summary.osVersion.isEmpty { meta["osVersion"] = summary.osVersion }
        if !summary.deviceType.isEmpty { meta["deviceType"] = summary.deviceType }
        if !summary.signal.isEmpty { meta["signal"] = summary.signal }
        if !summary.signalName.isEmpty { meta["signalName"] = summary.signalName }
        if !summary.exceptionType.isEmpty { meta["exceptionType"] = summary.exceptionType }
        if !summary.exceptionName.isEmpty { meta["exceptionName"] = summary.exceptionName }
        if !summary.exceptionCode.isEmpty { meta["exceptionCode"] = summary.exceptionCode }
        if !summary.terminationReason.isEmpty { meta["terminationReason"] = summary.terminationReason }
        if !summary.crashedBinary.isEmpty { meta["crashedBinary"] = summary.crashedBinary }
        if !summary.topFrames.isEmpty {
            meta["topFrames"] = String(summary.topFrames.prefix(700))
        }
        // Stable event key for SQL views / release-health queries.
        meta["event"] = "metrickit_\(summary.kind)"
        meta["schema"] = "kenos.crash.v2"
        if let begin = summary.timeStampBegin {
            meta["begin"] = KenosLogFormatting.iso8601(begin)
        }
        if let end = summary.timeStampEnd {
            meta["end"] = KenosLogFormatting.iso8601(end)
        }
        // Correlate with last Continuity / space trail from the death context.
        meta.merge(KenosCrashContextStore.metadata(from: KenosCrashContextStore.load())) { cur, _ in cur }
        meta["detail"] = String(summary.summaryText.prefix(500))

        if summary.isSevere {
            KenosLog.fault(summary.logHeadline, category: .diagnostics, metadata: meta)
        } else {
            KenosLog.warning(summary.logHeadline, category: .diagnostics, metadata: meta)
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
        let ctx = KenosCrashContextStore.load()
        let ctxLines: [String] = {
            guard let ctx else { return ["deathContext: —"] }
            return [
                "deathContext:",
                "  shell: \(ctx.shellMode.isEmpty ? "—" : ctx.shellMode)",
                "  space: \(ctx.lastSpace.isEmpty ? "—" : ctx.lastSpace)",
                "  domain: \(ctx.continuitySummary.isEmpty ? "—" : ctx.continuitySummary)",
                "  nowPlaying: \(ctx.nowPlaying.isEmpty ? "—" : ctx.nowPlaying)",
                "  build: \(ctx.build.isEmpty ? "—" : ctx.build)",
                "  trail:",
                ctx.trailSummary.isEmpty ? "    —" : ctx.breadcrumbs.suffix(10).map { "    - \($0)" }.joined(separator: "\n"),
            ]
        }()
        let notes = ([
            "Auto-reported from MetricKit (no screenshot).",
            "kind: \(summary.kind)",
            "signal: \(summary.signalName.isEmpty ? (summary.signal.isEmpty ? "—" : summary.signal) : "\(summary.signalName) (\(summary.signal))")",
            "exception: \(summary.exceptionName.isEmpty ? (summary.exceptionType.isEmpty ? "—" : summary.exceptionType) : "\(summary.exceptionName) (\(summary.exceptionType))")",
            "exceptionCode: \(summary.exceptionCode.isEmpty ? "—" : summary.exceptionCode)",
            "terminationReason: \(summary.terminationReason.isEmpty ? "—" : summary.terminationReason)",
            "applicationVersion: \(summary.applicationVersion.isEmpty ? "—" : summary.applicationVersion)",
            "buildVersion: \(summary.buildVersion.isEmpty ? "—" : summary.buildVersion)",
            "osVersion: \(summary.osVersion.isEmpty ? "—" : summary.osVersion)",
            "deviceType: \(summary.deviceType.isEmpty ? "—" : summary.deviceType)",
            "crashedBinary: \(summary.crashedBinary.isEmpty ? "—" : summary.crashedBinary)",
            "fingerprint: \(summary.fingerprint)",
            "",
        ] + ctxLines + [
            "",
            "topFrames:",
            summary.topFrames.isEmpty ? "  —" : summary.topFrames,
            "",
            "summary:",
            summary.summaryText,
        ]).joined(separator: "\n")

        let diagnostics = KenosBugDiagnostics(
            app: "kenos",
            route: "metrickit/\(summary.kind)",
            pageTitle: summary.logHeadline,
            heading: summary.bugTitle,
            href: ctx?.continuitySummary ?? "",
            tab: "diagnostics",
            domainLabel: ctx?.domainId ?? "",
            viewportWidth: Int(UIScreen.main.bounds.width.rounded()),
            viewportHeight: Int(UIScreen.main.bounds.height.rounded()),
            devicePixelRatio: UIScreen.main.scale,
            userAgent: "kenos-ios-metrickit",
            timestamp: now,
            shellMode: ctx?.shellMode ?? "kenos",
            build: KenosBugDeviceInfo.build,
            marketingVersion: KenosBugDeviceInfo.marketingVersion,
            originHost: KenosDailyBetaConfig.kenOsOrigin.host ?? "",
            deviceModel: KenosBugDeviceInfo.model,
            systemVersion: KenosBugDeviceInfo.systemVersion,
            authState: "auto",
            online: true,
            focusState: "off",
            lastErrorClass: [
                summary.kind,
                summary.signalName,
                summary.exceptionName,
                summary.crashedBinary,
            ].filter { !$0.isEmpty }.joined(separator: "/"),
            screenshotBytes: 0,
            consoleSummary: String(
                (summary.topFrames.isEmpty ? summary.summaryText : summary.topFrames).prefix(700)
            ),
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
                "signalName": summary.signalName,
                "exceptionName": summary.exceptionName,
                "crashedBinary": summary.crashedBinary,
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
