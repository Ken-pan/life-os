import Foundation
import os

// MARK: - Public facade

/// Kenos native logging — Console.app + in-memory ring + rotating files + export.
/// Safe for product iteration / dogfood debug: never persist raw tokens.
enum KenosLog {
    static var shared: KenosLogStore { KenosLogStore.shared }

    static func bootstrap(source: String = "launch") {
        shared.bootstrap(source: source)
    }

    static func trace(
        _ message: @autoclosure () -> String,
        category: KenosLogCategory = .app,
        metadata: [String: String] = [:],
        file: StaticString = #fileID,
        function: StaticString = #function,
        line: UInt = #line
    ) {
        shared.log(.trace, category: category, message: message(), metadata: metadata, file: file, function: function, line: line)
    }

    static func debug(
        _ message: @autoclosure () -> String,
        category: KenosLogCategory = .app,
        metadata: [String: String] = [:],
        file: StaticString = #fileID,
        function: StaticString = #function,
        line: UInt = #line
    ) {
        shared.log(.debug, category: category, message: message(), metadata: metadata, file: file, function: function, line: line)
    }

    static func info(
        _ message: @autoclosure () -> String,
        category: KenosLogCategory = .app,
        metadata: [String: String] = [:],
        file: StaticString = #fileID,
        function: StaticString = #function,
        line: UInt = #line
    ) {
        shared.log(.info, category: category, message: message(), metadata: metadata, file: file, function: function, line: line)
    }

    static func notice(
        _ message: @autoclosure () -> String,
        category: KenosLogCategory = .app,
        metadata: [String: String] = [:],
        file: StaticString = #fileID,
        function: StaticString = #function,
        line: UInt = #line
    ) {
        shared.log(.notice, category: category, message: message(), metadata: metadata, file: file, function: function, line: line)
    }

    static func warning(
        _ message: @autoclosure () -> String,
        category: KenosLogCategory = .app,
        metadata: [String: String] = [:],
        file: StaticString = #fileID,
        function: StaticString = #function,
        line: UInt = #line
    ) {
        shared.log(.warning, category: category, message: message(), metadata: metadata, file: file, function: function, line: line)
    }

    static func error(
        _ message: @autoclosure () -> String,
        category: KenosLogCategory = .app,
        metadata: [String: String] = [:],
        file: StaticString = #fileID,
        function: StaticString = #function,
        line: UInt = #line
    ) {
        shared.log(.error, category: category, message: message(), metadata: metadata, file: file, function: function, line: line)
    }

    static func fault(
        _ message: @autoclosure () -> String,
        category: KenosLogCategory = .app,
        metadata: [String: String] = [:],
        file: StaticString = #fileID,
        function: StaticString = #function,
        line: UInt = #line
    ) {
        shared.log(.fault, category: category, message: message(), metadata: metadata, file: file, function: function, line: line)
    }

    /// Short product breadcrumb (always persisted; good for bug-report timelines).
    static func breadcrumb(
        _ message: @autoclosure () -> String,
        category: KenosLogCategory = .navigation,
        metadata: [String: String] = [:],
        file: StaticString = #fileID,
        function: StaticString = #function,
        line: UInt = #line
    ) {
        var meta = metadata
        meta["breadcrumb"] = "1"
        let text = message()
        shared.log(.notice, category: category, message: text, metadata: meta, file: file, function: function, line: line)
        #if os(iOS)
        // Persist a short trail so the next launch can explain unclean exits.
        var trail = "[\(category.rawValue)] \(text)"
        if let space = meta["space"], !space.isEmpty { trail += " space=\(space)" }
        if let host = meta["host"], !host.isEmpty { trail += " host=\(host)" }
        if let path = meta["path"], !path.isEmpty { trail += " path=\(path)" }
        KenosCrashContextStore.noteBreadcrumb(trail)
        #endif
    }

    /// Measure a synchronous block; logs duration under `.performance`.
    @discardableResult
    static func measure<T>(
        _ label: String,
        category: KenosLogCategory = .performance,
        metadata: [String: String] = [:],
        file: StaticString = #fileID,
        function: StaticString = #function,
        line: UInt = #line,
        body: () throws -> T
    ) rethrows -> T {
        let started = ContinuousClock.now
        do {
            let value = try body()
            let ms = elapsedMilliseconds(since: started)
            var meta = metadata
            meta["durationMs"] = String(ms)
            shared.log(.debug, category: category, message: "\(label) ok", metadata: meta, file: file, function: function, line: line)
            return value
        } catch {
            let ms = elapsedMilliseconds(since: started)
            var meta = metadata
            meta["durationMs"] = String(ms)
            meta["error"] = KenosLogRedactor.redact(String(describing: error))
            shared.log(.error, category: category, message: "\(label) failed", metadata: meta, file: file, function: function, line: line)
            throw error
        }
    }

    /// Measure an async block; logs duration under `.performance`.
    /// Prefer calling from a single isolation domain (e.g. `@MainActor`) so the
    /// closure does not cross actor boundaries under Swift 6.
    @discardableResult
    static func measureAsync<T>(
        _ label: String,
        category: KenosLogCategory = .performance,
        metadata: [String: String] = [:],
        file: StaticString = #fileID,
        function: StaticString = #function,
        line: UInt = #line,
        isolation: isolated (any Actor)? = #isolation,
        body: () async throws -> T
    ) async rethrows -> T {
        let started = ContinuousClock.now
        do {
            let value = try await body()
            let ms = elapsedMilliseconds(since: started)
            var meta = metadata
            meta["durationMs"] = String(ms)
            shared.log(.debug, category: category, message: "\(label) ok", metadata: meta, file: file, function: function, line: line)
            return value
        } catch {
            let ms = elapsedMilliseconds(since: started)
            var meta = metadata
            meta["durationMs"] = String(ms)
            meta["error"] = KenosLogRedactor.redact(String(describing: error))
            shared.log(.error, category: category, message: "\(label) failed", metadata: meta, file: file, function: function, line: line)
            throw error
        }
    }

    static func recent(
        limit: Int = 200,
        minLevel: KenosLogLevel? = nil,
        category: KenosLogCategory? = nil
    ) -> [KenosLogEvent] {
        shared.recent(limit: limit, minLevel: minLevel, category: category)
    }

    static func breadcrumbs(limit: Int = 40) -> [KenosLogEvent] {
        shared.recent(limit: 500, minLevel: .info)
            .filter { $0.metadata["breadcrumb"] == "1" }
            .suffix(limit)
            .map { $0 }
    }

    static func breadcrumbSummary(limit: Int = 24) -> String {
        let lines = breadcrumbs(limit: limit).map { event in
            let t = KenosLogFormatting.compactTime(event.timestamp)
            return "\(t) [\(event.category.rawValue)] \(event.message)"
        }
        return lines.joined(separator: "\n")
    }

    static func exportPackage() throws -> URL {
        try shared.exportPackage()
    }

    static func clearPersisted() {
        shared.clearPersisted()
    }

    private static func elapsedMilliseconds(since start: ContinuousClock.Instant) -> Int {
        let elapsed = start.duration(to: ContinuousClock.now)
        return max(0, Int(elapsed / .milliseconds(1)))
    }
}

// MARK: - Types

enum KenosLogLevel: Int, Codable, Comparable, CaseIterable, Sendable {
    case trace = 0
    case debug = 1
    case info = 2
    case notice = 3
    case warning = 4
    case error = 5
    case fault = 6

    var label: String {
        switch self {
        case .trace: return "TRACE"
        case .debug: return "DEBUG"
        case .info: return "INFO"
        case .notice: return "NOTICE"
        case .warning: return "WARN"
        case .error: return "ERROR"
        case .fault: return "FAULT"
        }
    }

    var shortLabel: String {
        switch self {
        case .trace: return "T"
        case .debug: return "D"
        case .info: return "I"
        case .notice: return "N"
        case .warning: return "W"
        case .error: return "E"
        case .fault: return "F"
        }
    }

    static func < (lhs: KenosLogLevel, rhs: KenosLogLevel) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    var osLogType: OSLogType {
        switch self {
        case .trace, .debug: return .debug
        case .info: return .info
        case .notice: return .default
        case .warning: return .error
        case .error: return .error
        case .fault: return .fault
        }
    }

    static func parse(_ raw: String) -> KenosLogLevel? {
        switch raw.lowercased() {
        case "trace", "t": return .trace
        case "debug", "d": return .debug
        case "info", "i": return .info
        case "notice", "n": return .notice
        case "warn", "warning", "w": return .warning
        case "error", "e": return .error
        case "fault", "fatal", "f": return .fault
        default: return nil
        }
    }
}

enum KenosLogCategory: String, Codable, CaseIterable, Sendable, Identifiable {
    case app
    case lifecycle
    case navigation
    case shell
    case web
    case bridge
    case auth
    case network
    case health
    case focus
    case store
    case bugReport
    case performance
    case ui
    case deepLink
    case session
    case cloud
    case diagnostics

    var id: String { rawValue }

    var title: String {
        switch self {
        case .app: return "App"
        case .lifecycle: return "Lifecycle"
        case .navigation: return "Navigation"
        case .shell: return "Shell"
        case .web: return "Web"
        case .bridge: return "Bridge"
        case .auth: return "Auth"
        case .network: return "Network"
        case .health: return "Health"
        case .focus: return "Focus"
        case .store: return "Store"
        case .bugReport: return "Bug Report"
        case .performance: return "Performance"
        case .ui: return "UI"
        case .deepLink: return "Deep Link"
        case .session: return "Session"
        case .cloud: return "Cloud"
        case .diagnostics: return "Diagnostics"
        }
    }

    static func parse(_ raw: String) -> KenosLogCategory {
        KenosLogCategory(rawValue: raw.lowercased())
            ?? KenosLogCategory(rawValue: raw)
            ?? .app
    }
}

struct KenosLogEvent: Identifiable, Codable, Equatable, Sendable {
    let id: UUID
    let timestamp: Date
    let level: KenosLogLevel
    let category: KenosLogCategory
    let message: String
    let metadata: [String: String]
    let file: String
    let function: String
    let line: UInt
    let sessionId: String

    var lineText: String {
        let time = KenosLogFormatting.iso8601(timestamp)
        let meta = KenosLogFormatting.metadataSuffix(metadata)
        return "\(time) \(level.label) [\(category.rawValue)] \(message)\(meta) (\(file):\(line))"
    }
}

struct KenosLogSessionInfo: Codable, Equatable, Sendable {
    let sessionId: String
    let startedAt: Date
    let app: String
    let marketingVersion: String
    let build: String
    let platform: String
    let systemVersion: String
    let deviceModel: String
    let locale: String
}

// MARK: - Store

final class KenosLogStore: @unchecked Sendable {
    static let shared = KenosLogStore()

    private let lock = NSLock()
    private let ioQueue = DispatchQueue(label: "space.kenos.app.log.io", qos: .utility)
    private let subsystem: String
    private var osLoggers: [KenosLogCategory: Logger] = [:]
    private var ring: [KenosLogEvent] = []
    private var bootstrapped = false

    private(set) var sessionId: String
    private(set) var sessionInfo: KenosLogSessionInfo

    /// In-memory ring capacity.
    var memoryCapacity: Int = 2_000
    /// Minimum level written to disk (memory keeps everything ≥ consoleMinLevel).
    var persistMinLevel: KenosLogLevel = .debug
    /// Minimum level mirrored to Console / os.Logger.
    var consoleMinLevel: KenosLogLevel = {
        #if DEBUG
        return .trace
        #else
        return .debug
        #endif
    }()

    private let maxFileBytes: Int = 1_500_000
    private let maxRotatedFiles: Int = 5
    private let directory: URL
    private var activeFileURL: URL
    private var fileHandle: FileHandle?

    private init(
        directory: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("kenos-logs", isDirectory: true)
    ) {
        self.directory = directory
        self.activeFileURL = directory.appendingPathComponent("kenos-active.jsonl")
        #if os(iOS)
        self.subsystem = Bundle.main.bundleIdentifier ?? "space.kenos.app.ios"
        #elseif os(macOS)
        self.subsystem = Bundle.main.bundleIdentifier ?? "space.kenos.app.macos"
        #else
        self.subsystem = Bundle.main.bundleIdentifier ?? "space.kenos.app"
        #endif

        let sid = UUID().uuidString.lowercased()
        self.sessionId = sid
        self.sessionInfo = KenosLogSessionInfo(
            sessionId: sid,
            startedAt: Date(),
            app: Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? "Kenos",
            marketingVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0",
            build: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0",
            platform: KenosLogDevice.platformName,
            systemVersion: KenosLogDevice.systemVersion,
            deviceModel: KenosLogDevice.model,
            locale: Locale.current.identifier
        )
    }

    /// Test / preview seam — creates an isolated store (does not replace `.shared`).
    static func makeForTesting(directory: URL) -> KenosLogStore {
        KenosLogStore(directory: directory)
    }

    func bootstrap(source: String) {
        lock.lock()
        let already = bootstrapped
        bootstrapped = true
        lock.unlock()
        if already { return }

        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        openFileHandleIfNeeded()
        writeSessionHeader()

        log(
            .notice,
            category: .lifecycle,
            message: "session start",
            metadata: [
                "source": source,
                "version": sessionInfo.marketingVersion,
                "build": sessionInfo.build,
                "platform": sessionInfo.platform,
                "system": sessionInfo.systemVersion,
                "device": sessionInfo.deviceModel,
                "locale": sessionInfo.locale,
                "breadcrumb": "1",
            ],
            file: "KenosLog.swift",
            function: "bootstrap",
            line: 0
        )
    }

    func log(
        _ level: KenosLogLevel,
        category: KenosLogCategory,
        message: String,
        metadata: [String: String],
        file: StaticString,
        function: StaticString,
        line: UInt
    ) {
        log(
            level,
            category: category,
            message: message,
            metadata: metadata,
            file: String(describing: file),
            function: String(describing: function),
            line: line
        )
    }

    func log(
        _ level: KenosLogLevel,
        category: KenosLogCategory,
        message: String,
        metadata: [String: String],
        file: String,
        function: String,
        line: UInt
    ) {
        let safeMessage = KenosLogRedactor.redact(message)
        let safeMeta = KenosLogRedactor.redactMetadata(metadata)
        let event = KenosLogEvent(
            id: UUID(),
            timestamp: Date(),
            level: level,
            category: category,
            message: safeMessage,
            metadata: safeMeta,
            file: file,
            function: function,
            line: line,
            sessionId: sessionId
        )

        lock.lock()
        ring.append(event)
        if ring.count > memoryCapacity {
            ring.removeFirst(ring.count - memoryCapacity)
        }
        lock.unlock()

        if level >= consoleMinLevel {
            mirrorToOSLog(event)
        }
        if level >= persistMinLevel {
            persist(event)
        }
    }

    func recent(
        limit: Int = 200,
        minLevel: KenosLogLevel? = nil,
        category: KenosLogCategory? = nil
    ) -> [KenosLogEvent] {
        lock.lock()
        defer { lock.unlock() }
        var items = ring
        if let minLevel {
            items = items.filter { $0.level >= minLevel }
        }
        if let category {
            items = items.filter { $0.category == category }
        }
        if items.count <= limit { return items }
        return Array(items.suffix(limit))
    }

    func stats() -> (memoryCount: Int, diskBytes: Int, sessionId: String) {
        lock.lock()
        let count = ring.count
        let sid = sessionId
        lock.unlock()
        let bytes = (try? FileManager.default.attributesOfItem(atPath: activeFileURL.path)[.size] as? NSNumber)?.intValue ?? 0
        return (count, bytes, sid)
    }

    func clearPersisted() {
        ioQueue.sync {
            try? fileHandle?.close()
            fileHandle = nil
            let urls = (try? FileManager.default.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: nil
            )) ?? []
            for url in urls where url.pathExtension == "jsonl" || url.pathExtension == "json" || url.pathExtension == "txt" || url.pathExtension == "zip" {
                try? FileManager.default.removeItem(at: url)
            }
            openFileHandleIfNeeded()
            writeSessionHeader()
        }
        lock.lock()
        ring.removeAll(keepingCapacity: true)
        lock.unlock()
        log(
            .notice,
            category: .lifecycle,
            message: "log store cleared",
            metadata: ["breadcrumb": "1"],
            file: "KenosLog.swift",
            function: "clearPersisted",
            line: 0
        )
    }

    /// Writes a shareable package (session.json + recent.jsonl + transcript.txt) and returns its URL.
    func exportPackage() throws -> URL {
        bootstrap(source: "export")
        let stamp = KenosLogFormatting.fileStamp(Date())
        let exportDir = directory.appendingPathComponent("export-\(stamp)", isDirectory: true)
        try? FileManager.default.removeItem(at: exportDir)
        try FileManager.default.createDirectory(at: exportDir, withIntermediateDirectories: true)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        let sessionURL = exportDir.appendingPathComponent("session.json")
        try encoder.encode(sessionInfo).write(to: sessionURL)

        let events = recent(limit: memoryCapacity)
        let jsonlURL = exportDir.appendingPathComponent("recent.jsonl")
        let jsonl = events.map { event -> String in
            let data = (try? encoder.encode(event)) ?? Data()
            return String(data: data, encoding: .utf8) ?? ""
        }.filter { !$0.isEmpty }.joined(separator: "\n") + "\n"
        try jsonl.write(to: jsonlURL, atomically: true, encoding: .utf8)

        let transcriptURL = exportDir.appendingPathComponent("transcript.txt")
        let header = [
            "Korben Log Export",
            "session: \(sessionInfo.sessionId)",
            "app: \(sessionInfo.app) \(sessionInfo.marketingVersion) (\(sessionInfo.build))",
            "device: \(sessionInfo.deviceModel) · \(sessionInfo.platform) \(sessionInfo.systemVersion)",
            "locale: \(sessionInfo.locale)",
            "events: \(events.count)",
            "",
        ].joined(separator: "\n")
        let body = events.map(\.lineText).joined(separator: "\n")
        try (header + body + "\n").write(to: transcriptURL, atomically: true, encoding: .utf8)

        // Also copy rotated files when present (best-effort context).
        let rotated = ((try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey]
        )) ?? [])
            .filter { $0.lastPathComponent.hasPrefix("kenos-") && $0.pathExtension == "jsonl" && $0 != activeFileURL }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        for (idx, url) in rotated.suffix(3).enumerated() {
            let dest = exportDir.appendingPathComponent("rotated-\(idx + 1).jsonl")
            try? FileManager.default.copyItem(at: url, to: dest)
        }
        if FileManager.default.fileExists(atPath: activeFileURL.path) {
            try? FileManager.default.copyItem(
                at: activeFileURL,
                to: exportDir.appendingPathComponent("active.jsonl")
            )
        }

        let packageURL = directory.appendingPathComponent("kenos-logs-\(stamp)")
        try? FileManager.default.removeItem(at: packageURL)
        try FileManager.default.copyItem(at: exportDir, to: packageURL)
        return packageURL
    }

    // MARK: Private

    private func mirrorToOSLog(_ event: KenosLogEvent) {
        let logger = osLogger(for: event.category)
        let meta = KenosLogFormatting.metadataSuffix(event.metadata)
        let line = "\(event.message)\(meta)"
        logger.log(level: event.level.osLogType, "\(line, privacy: .public)")
    }

    private func osLogger(for category: KenosLogCategory) -> Logger {
        lock.lock()
        defer { lock.unlock() }
        if let existing = osLoggers[category] { return existing }
        let created = Logger(subsystem: subsystem, category: category.rawValue)
        osLoggers[category] = created
        return created
    }

    private func persist(_ event: KenosLogEvent) {
        ioQueue.async { [weak self] in
            self?.writeEvent(event)
        }
    }

    private func writeSessionHeader() {
        ioQueue.async { [weak self] in
            guard let self else { return }
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            var payload: [String: String] = [
                "type": "session",
                "sessionId": self.sessionInfo.sessionId,
                "app": self.sessionInfo.app,
                "version": self.sessionInfo.marketingVersion,
                "build": self.sessionInfo.build,
                "platform": self.sessionInfo.platform,
                "system": self.sessionInfo.systemVersion,
                "device": self.sessionInfo.deviceModel,
                "locale": self.sessionInfo.locale,
            ]
            payload["startedAt"] = KenosLogFormatting.iso8601(self.sessionInfo.startedAt)
            if let data = try? JSONSerialization.data(withJSONObject: payload),
               var line = String(data: data, encoding: .utf8)
            {
                line += "\n"
                self.append(line)
            }
        }
    }

    private func writeEvent(_ event: KenosLogEvent) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(event),
              var line = String(data: data, encoding: .utf8)
        else { return }
        line += "\n"
        append(line)
        rotateIfNeeded()
    }

    private func openFileHandleIfNeeded() {
        if fileHandle != nil { return }
        if !FileManager.default.fileExists(atPath: activeFileURL.path) {
            FileManager.default.createFile(atPath: activeFileURL.path, contents: nil)
        }
        fileHandle = try? FileHandle(forWritingTo: activeFileURL)
        _ = try? fileHandle?.seekToEnd()
    }

    private func append(_ line: String) {
        openFileHandleIfNeeded()
        if let data = line.data(using: .utf8) {
            try? fileHandle?.write(contentsOf: data)
        }
    }

    private func rotateIfNeeded() {
        let size = (try? FileManager.default.attributesOfItem(atPath: activeFileURL.path)[.size] as? NSNumber)?.intValue ?? 0
        guard size >= maxFileBytes else { return }
        try? fileHandle?.close()
        fileHandle = nil
        let stamp = KenosLogFormatting.fileStamp(Date())
        let rotated = directory.appendingPathComponent("kenos-\(stamp).jsonl")
        try? FileManager.default.moveItem(at: activeFileURL, to: rotated)
        pruneRotatedFiles()
        openFileHandleIfNeeded()
    }

    private func pruneRotatedFiles() {
        let urls = ((try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey]
        )) ?? [])
            .filter { $0.lastPathComponent.hasPrefix("kenos-") && $0.pathExtension == "jsonl" && $0 != activeFileURL }
            .sorted {
                let a = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                let b = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                return a > b
            }
        for stale in urls.dropFirst(maxRotatedFiles) {
            try? FileManager.default.removeItem(at: stale)
        }
    }
}

// MARK: - Redaction / formatting / device

enum KenosLogRedactor {
    private static let patterns: [(NSRegularExpression, String)] = {
        let specs: [(String, String)] = [
            (#"(?i)\bbearer\s+\S+"#, "Bearer «redacted»"),
            (#"(?i)\b(access_token|refresh_token|id_token|password|authorization|token)\b\s*[:=]\s*["']?[^\s&"']+"#, "$1=«redacted»"),
            (#"\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+"#, "«jwt»"),
            (#"sb_publishable_[A-Za-z0-9_\-]+"#, "«supabase_key»"),
        ]
        return specs.compactMap { pattern, template in
            guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
            return (regex, template)
        }
    }()

    private static let sensitiveKeys: Set<String> = [
        "token", "access_token", "refresh_token", "id_token", "password", "secret",
        "authorization", "cookie", "apikey", "api_key", "anon_key",
    ]

    static func redact(_ raw: String) -> String {
        guard !raw.isEmpty else { return raw }
        var value = raw
        for (regex, template) in patterns {
            let range = NSRange(value.startIndex..<value.endIndex, in: value)
            value = regex.stringByReplacingMatches(in: value, options: [], range: range, withTemplate: template)
        }
        if value.count > 2_000 {
            value = String(value.prefix(2_000)) + "…«truncated»"
        }
        return value
    }

    static func redactKey(_ key: String) -> String {
        let lower = key.lowercased()
        if sensitiveKeys.contains(lower) { return lower }
        return key
    }

    static func redactMetadata(_ metadata: [String: String]) -> [String: String] {
        var out: [String: String] = [:]
        for (key, value) in metadata {
            let safeKey = redactKey(key)
            if sensitiveKeys.contains(safeKey.lowercased()) {
                out[safeKey] = "«redacted»"
            } else {
                out[safeKey] = redact(value)
            }
        }
        return out
    }
}

enum KenosLogFormatting {
    // DateFormatters are reference types with mutable state — lock-guarded for Swift 6.
    private static let lock = NSLock()
    nonisolated(unsafe) private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    nonisolated(unsafe) private static let compactFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm:ss.SSS"
        return f
    }()

    nonisolated(unsafe) private static let fileFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyyMMdd-HHmmss"
        return f
    }()

    static func iso8601(_ date: Date) -> String {
        lock.lock()
        defer { lock.unlock() }
        return isoFormatter.string(from: date)
    }

    static func compactTime(_ date: Date) -> String {
        lock.lock()
        defer { lock.unlock() }
        return compactFormatter.string(from: date)
    }

    static func fileStamp(_ date: Date) -> String {
        lock.lock()
        defer { lock.unlock() }
        return fileFormatter.string(from: date)
    }

    static func metadataSuffix(_ metadata: [String: String]) -> String {
        guard !metadata.isEmpty else { return "" }
        let parts = metadata.keys.sorted().compactMap { key -> String? in
            guard let value = metadata[key], key != "breadcrumb" else { return nil }
            return "\(key)=\(value)"
        }
        guard !parts.isEmpty else { return "" }
        return " {" + parts.joined(separator: " ") + "}"
    }
}

enum KenosLogDevice {
    static var platformName: String {
        #if os(iOS)
        return "iOS"
        #elseif os(macOS)
        return "macOS"
        #elseif os(watchOS)
        return "watchOS"
        #else
        return "unknown"
        #endif
    }

    static var systemVersion: String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }

    static var model: String {
        #if os(iOS)
        var systemInfo = utsname()
        uname(&systemInfo)
        return withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
        }
        #else
        return ProcessInfo.processInfo.hostName
        #endif
    }
}
