import Foundation
import UIKit

/// 结构化事件日志 —— 让真机现场(扫描质量/性能/UX 卡点)自己留下证据。
///
/// 为什么不用 os.Logger:统一日志在这台开发机上拉不下来(`log stream` 不再
/// 支持 --device-name,见 MainThreadStallProbe 头注释),而 `devicectl --console`
/// 抓的是 stdout。所以双通道:
/// - **JSONL 落盘**(始终开):Documents/logs/ 按会话一文件,断网/被杀/崩溃后
///   证据还在,可从首页「诊断日志」分享出来,jq 直接分析。
/// - **stdout 镜像**(仅 DEBUG):插线联调时 devicectl 实时可见。
///
/// 线程规则:任何线程可调(AR delegate 是 nonisolated),全部写操作经串行队列,
/// 调用方零阻塞;绝不碰 @Observable 状态。事件低频(一次扫描几百条),逐行
/// append + 逐行 flush,崩溃最多丢最后一条。
///
/// 聚合器(DiagnosticsAggregator)是纯函数核:上传 payload 里的
/// `meta.scanDiagnostics` 摘要由它累计,模拟器单测全覆盖。
final class ScanLog {
    static let shared = ScanLog()

    /// 事件属性值:字符串/数值/布尔。字面量可直写:
    /// `ScanLog.shared.log("scan", "room_done", ["rooms": 3, "ok": true])`
    enum Value: Codable, Equatable,
        ExpressibleByStringLiteral, ExpressibleByIntegerLiteral,
        ExpressibleByFloatLiteral, ExpressibleByBooleanLiteral {
        case string(String)
        case num(Double)
        case bool(Bool)

        init(stringLiteral v: String) { self = .string(v) }
        init(integerLiteral v: Int) { self = .num(Double(v)) }
        init(floatLiteral v: Double) { self = .num(v) }
        init(booleanLiteral v: Bool) { self = .bool(v) }

        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let b = try? c.decode(Bool.self) { self = .bool(b); return }
            if let n = try? c.decode(Double.self) { self = .num(n); return }
            self = .string(try c.decode(String.self))
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.singleValueContainer()
            switch self {
            case .string(let v): try c.encode(v)
            case .num(let v): try c.encode(v)
            case .bool(let v): try c.encode(v)
            }
        }

        var display: String {
            switch self {
            case .string(let v): return v
            case .num(let v):
                return v == v.rounded() && abs(v) < 1e15
                    ? String(Int(v)) : String(format: "%.2f", v)
            case .bool(let v): return v ? "true" : "false"
            }
        }
    }

    struct Event: Codable {
        var t: Int64            // Unix 毫秒
        var cat: String         // scan / convert / upload / perf / ux / app / error
        var name: String
        var attrs: [String: Value]
    }

    // MARK: - 纯函数核(单测覆盖)

    /// 事件 → JSONL 一行(键排序,输出确定)。
    static func encodeLine(_ e: Event) -> String? {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        guard let d = try? enc.encode(e) else { return nil }
        return String(data: d, encoding: .utf8)
    }

    /// 事件 → 控制台一行(人眼扫得动)。
    static func renderLine(_ e: Event) -> String {
        let kv = e.attrs.sorted { $0.key < $1.key }
            .map { "\($0.key)=\($0.value.display)" }
            .joined(separator: " ")
        return "◆ [\(e.cat)] \(e.name)\(kv.isEmpty ? "" : " · " + kv)"
    }

    /// 日志目录该留哪些文件(按名字倒序 = 按时间倒序,保留最新 keep 个)。
    static func filesToPrune(_ names: [String], keep: Int) -> [String] {
        let logs = names.filter { $0.hasPrefix("scanlog-") && $0.hasSuffix(".jsonl") }
        return Array(logs.sorted(by: >).dropFirst(keep))
    }

    /// 诊断聚合:一次扫描的数值摘要,随 payload 上传(meta.scanDiagnostics)。
    /// 纯值类型,无 IO —— 语义只有三种,别加第四种:
    /// - count:发生次数(抓拍拒绝、门控 block…)
    /// - add:累计量(上传字节、追踪受限秒数…)
    /// - peak:峰值(卡顿最长、内存最高…)
    struct DiagnosticsAggregator: Equatable {
        private(set) var values: [String: Double] = [:]

        mutating func count(_ key: String) { values[key, default: 0] += 1 }
        mutating func add(_ key: String, _ v: Double) { values[key, default: 0] += v }
        mutating func peak(_ key: String, _ v: Double) { values[key] = max(values[key] ?? 0, v) }
        mutating func set(_ key: String, _ v: Double) { values[key] = v }

        /// 上传摘要:四舍五入到 0.1,免得 payload 里挂一串 16 位小数
        func summary() -> [String: Double] {
            values.mapValues { ($0 * 10).rounded() / 10 }
        }
    }

    // MARK: - 服务(串行队列后面)

    private let queue = DispatchQueue(label: "scanlog", qos: .utility)
    private var handle: FileHandle?
    private var sessionFileName: String?
    private var agg = DiagnosticsAggregator()
    private var memTimer: DispatchSourceTimer?
    private var lastLoggedMemMB: Double = 0
    /// 保留最近几个会话文件(一次全屋扫描 + 上传 ≈ 1 个,8 个够回溯一周)
    private let keepFiles = 8

    static var logsDirectory: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("logs", isDirectory: true)
    }

    /// 开新会话文件(app 启动、每次开扫)。kind 进文件名,现场翻文件不用开内容。
    /// UIKit 环境数据(电量等)必须主线程取,所以由调用方传入(见 envSnapshot)。
    func beginSession(kind: String, env: [String: Value] = [:]) {
        queue.async { [self] in
            try? handle?.close()
            let df = DateFormatter()
            df.dateFormat = "yyyyMMdd-HHmmss"
            df.locale = Locale(identifier: "en_US_POSIX")
            let name = "scanlog-\(df.string(from: Date()))-\(kind).jsonl"
            let dir = Self.logsDirectory
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent(name)
            FileManager.default.createFile(atPath: url.path, contents: nil)
            handle = try? FileHandle(forWritingTo: url)
            sessionFileName = name
            agg = DiagnosticsAggregator()
            // 轮换:旧会话文件只留最近 keepFiles 个
            let names = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
            for stale in Self.filesToPrune(names, keep: keepFiles) {
                try? FileManager.default.removeItem(at: dir.appendingPathComponent(stale))
            }
            write(Event(t: Self.nowMs(), cat: "app", name: "session_begin",
                        attrs: env.merging(["kind": .string(kind)]) { a, _ in a }))
            // 起点电量进摘要:与 scan_env_end 的 battery_end_pct 相减 =
            // 一次扫描的续航成本(发热降级策略值不值,就看这个数)
            if case .num(let b)? = env["battery"] { agg.set("battery_start_pct", b) }
        }
    }

    /// 收尾环境快照:落事件 + 把电量/内存记进摘要(与 session_begin 的起点对账)
    func logEnvEnd(_ env: [String: Value]) {
        log("app", "scan_env_end", env)
        counter { agg in
            if case .num(let b)? = env["battery"] { agg.set("battery_end_pct", b) }
            if case .num(let m)? = env["memMB"] { agg.peak("mem_peak_mb", m) }
        }
    }

    func log(_ cat: String, _ name: String, _ attrs: [String: Value] = [:]) {
        let e = Event(t: Self.nowMs(), cat: cat, name: name, attrs: attrs)
        queue.async { [self] in write(e) }
    }

    /// 错误必须有上下文:哪一步、带着什么参数。所有 catch 都该过这里。
    func error(_ cat: String, _ name: String, _ error: Error, _ attrs: [String: Value] = [:]) {
        var a = attrs
        a["error"] = .string(String(describing: error))
        a["localized"] = .string(error.localizedDescription)
        log(cat, name, a)
        counter { $0.count("errors") }
    }

    /// 计时:`let end = ScanLog.shared.time("perf", "merge"); …; end([:])`
    /// 自动记录 ms,并把峰值累进聚合器(key = "\(name)_ms" 的 peak)。
    func time(_ cat: String, _ name: String) -> ([String: Value]) -> Void {
        let t0 = Date()
        log(cat, "\(name)_begin")
        return { [self] extra in
            let ms = Date().timeIntervalSince(t0) * 1000
            var a = extra
            a["ms"] = .num((ms * 10).rounded() / 10)
            log(cat, name, a)
            counter { $0.peak("\(name)_ms", ms) }
        }
    }

    /// 聚合器操作(线程安全)。摘要口径见 DiagnosticsAggregator。
    func counter(_ mutate: @escaping (inout DiagnosticsAggregator) -> Void) {
        queue.async { [self] in mutate(&agg) }
    }

    /// 上传前取诊断摘要(同步等队列排干,保证已计入)。
    func diagnosticsSummary() -> [String: Double] {
        queue.sync { agg.summary() }
    }

    // MARK: 扫描期内存采样(RoomPlan 是内存大户,OOM 是静默崩溃的头号嫌疑)

    func startMemorySampling(every seconds: Int = 5) {
        queue.async { [self] in
            memTimer?.cancel()
            let t = DispatchSource.makeTimerSource(queue: queue)
            t.schedule(deadline: .now() + .seconds(seconds), repeating: .seconds(seconds))
            t.setEventHandler { [weak self] in
                guard let self else { return }
                let mb = Self.memoryFootprintMB()
                self.agg.peak("mem_peak_mb", mb)
                // 只在变化 >25MB 时记事件,避免刷屏;峰值始终进聚合
                if abs(mb - self.lastLoggedMemMB) > 25 {
                    self.lastLoggedMemMB = mb
                    self.write(Event(t: Self.nowMs(), cat: "perf", name: "mem",
                                     attrs: ["mb": .num(mb.rounded())]))
                }
            }
            t.resume()
            memTimer = t
        }
    }

    func stopMemorySampling() {
        queue.async { [self] in
            memTimer?.cancel()
            memTimer = nil
        }
    }

    // MARK: 脏退出侦测(上一次是不是崩了/被杀了)

    private static var dirtyFlagURL: URL {
        logsDirectory.appendingPathComponent("running.flag")
    }

    /// 启动时调:发现上次的 flag 还在 = 上次没走正常退出(崩溃/OOM/被杀)。
    /// flag 内容是上次的会话文件名 —— 事故现场直接可定位。
    func markLaunch() {
        queue.async { [self] in
            if let prev = try? String(contentsOf: Self.dirtyFlagURL, encoding: .utf8) {
                write(Event(t: Self.nowMs(), cat: "app", name: "previous_run_dirty_exit",
                            attrs: ["lastSession": .string(prev)]))
            }
            try? FileManager.default.createDirectory(
                at: Self.logsDirectory, withIntermediateDirectories: true)
            try? (sessionFileName ?? "unknown")
                .write(to: Self.dirtyFlagURL, atomically: true, encoding: .utf8)
        }
    }

    /// 进后台/正常退出时调。下次启动没看到 flag = 上次善终。
    func markCleanExit() {
        queue.async {
            try? FileManager.default.removeItem(at: Self.dirtyFlagURL)
        }
    }

    /// 回前台重新立 flag(markCleanExit 在进后台时清了它)。
    func markActive() {
        queue.async { [self] in
            try? (sessionFileName ?? "unknown")
                .write(to: Self.dirtyFlagURL, atomically: true, encoding: .utf8)
        }
    }

    // MARK: 导出(首页「诊断日志」→ share sheet)

    /// 把最近的会话文件拼成一个可分享的文本文件(含文件名分隔头)。
    func exportFile() -> URL? {
        queue.sync { [self] in
            try? handle?.synchronize()
            let dir = Self.logsDirectory
            let names = ((try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? [])
                .filter { $0.hasPrefix("scanlog-") }
                .sorted()
            guard !names.isEmpty else { return nil }
            var out = ""
            for n in names {
                out += "===== \(n) =====\n"
                out += (try? String(contentsOf: dir.appendingPathComponent(n), encoding: .utf8)) ?? ""
                out += "\n"
            }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("homescan-diagnostics.jsonl.txt")
            try? out.write(to: url, atomically: true, encoding: .utf8)
            return url
        }
    }

    // MARK: - 环境快照与底层探针

    /// 设备/系统/热/电/盘/内存一次性快照。UIDevice 要主线程,所以 @MainActor。
    @MainActor
    static func envSnapshot() -> [String: Value] {
        let dev = UIDevice.current
        dev.isBatteryMonitoringEnabled = true
        let info = Bundle.main.infoDictionary
        var out: [String: Value] = [
            "device": .string(modelIdentifier()),
            "os": .string("\(dev.systemName) \(dev.systemVersion)"),
            "app": .string("\(info?["CFBundleShortVersionString"] ?? "?")(\(info?["CFBundleVersion"] ?? "?"))"),
            "thermal": .string(thermalName(ProcessInfo.processInfo.thermalState)),
            "lowPower": .bool(ProcessInfo.processInfo.isLowPowerModeEnabled),
            "memMB": .num(memoryFootprintMB().rounded()),
        ]
        if dev.batteryState != .unknown {
            out["battery"] = .num(Double(Int(dev.batteryLevel * 100)))
            out["charging"] = .bool(dev.batteryState != .unplugged)
        }
        if let cap = try? URL(fileURLWithPath: NSHomeDirectory())
            .resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
            .volumeAvailableCapacityForImportantUsage {
            out["diskFreeGB"] = .num((Double(cap) / 1e9 * 10).rounded() / 10)
        }
        return out
    }

    static func thermalName(_ s: ProcessInfo.ThermalState) -> String {
        switch s {
        case .nominal: return "nominal"
        case .fair: return "fair"
        case .serious: return "serious"
        case .critical: return "critical"
        @unknown default: return "unknown"
        }
    }

    /// 真实占用(phys_footprint,和 Xcode Memory Gauge 同口径;task_basic_info
    /// 的 resident_size 会把可回收页也算进去,虚高没参考价值)。
    static func memoryFootprintMB() -> Double {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(
            MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let kr = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        guard kr == KERN_SUCCESS else { return 0 }
        return Double(info.phys_footprint) / 1024 / 1024
    }

    private static func modelIdentifier() -> String {
        var sys = utsname()
        uname(&sys)
        return withUnsafeBytes(of: &sys.machine) { buf in
            String(decoding: buf.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
    }

    private static func nowMs() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }

    /// 只在队列上调用。
    private func write(_ e: Event) {
        guard let line = Self.encodeLine(e) else { return }
        if let data = (line + "\n").data(using: .utf8) {
            handle?.write(data)
        }
        #if DEBUG
        print(Self.renderLine(e))
        #endif
    }
}
