// healthos-focus-agent v3.0 — HealthOS Focus 模块的本地代理(原 vibeguard)
//
// 三层结构:
//   Detection  — 采样 AI 工具进程 CPU / 前台 app / 键鼠空闲(漏桶计分)
//   Policy     — 净累积满窗口 → 预警(可赎回)→ 保护性休息;聊天特赦/人离开跳过
//   Intervention — 菜单栏状态、预警卡片、全屏呼吸休息屏(夜空表盘)
//
// 对 HealthOS app 暴露本地只读状态(127.0.0.1:5193):
//   GET  /state     当前相位/净累积/信号/session
//   GET  /sessions  session 历史(sessions.jsonl)
//   GET  /events    干预记录(events.jsonl)
//   GET  /config    生效配置
//   POST /action    {"type":"break"|"pause30"|"pause2h"|"pauseToday"|"resume"}
//
// 数据目录:~/Library/Application Support/HealthOS/
// 用法: healthos-focus-agent                 常驻运行(launchd,install.sh 安装)
//       healthos-focus-agent --test-break 8  立即演示 8 秒休息屏后退出
//       healthos-focus-agent --test-warn 8   立即演示 8 秒预警条后退出
import Cocoa
import Network

// MARK: - 配置(config.json,缺省字段自动用默认值并回写)

struct Config: Codable {
    var limitSeconds = 1200
    var restSeconds = 300
    var warnSeconds = 60
    var sampleInterval = 5
    var cpuPerProcess = 8.0
    var cpuTotal = 20.0
    var drainRatio = 1.0
    var presenceSeconds = 180
    var chatSustainedSeconds = 120
    var warnCancelSeconds = 30
    var skipIfUserIdleSeconds = 180
    var processPattern = "cursor\\.app|claude\\.app|claude-code|chatgpt\\.app|copilot|windsurf"
    var codingFrontApps = ["Cursor", "Windsurf"]
    var chatFrontApps = ["ChatGPT", "Claude"]
    var playSound = true
    var httpPort = 5193

    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = Config()
        limitSeconds = try c.decodeIfPresent(Int.self, forKey: .limitSeconds) ?? d.limitSeconds
        restSeconds = try c.decodeIfPresent(Int.self, forKey: .restSeconds) ?? d.restSeconds
        warnSeconds = try c.decodeIfPresent(Int.self, forKey: .warnSeconds) ?? d.warnSeconds
        sampleInterval = try c.decodeIfPresent(Int.self, forKey: .sampleInterval) ?? d.sampleInterval
        cpuPerProcess = try c.decodeIfPresent(Double.self, forKey: .cpuPerProcess) ?? d.cpuPerProcess
        cpuTotal = try c.decodeIfPresent(Double.self, forKey: .cpuTotal) ?? d.cpuTotal
        drainRatio = try c.decodeIfPresent(Double.self, forKey: .drainRatio) ?? d.drainRatio
        presenceSeconds = try c.decodeIfPresent(Int.self, forKey: .presenceSeconds) ?? d.presenceSeconds
        chatSustainedSeconds = try c.decodeIfPresent(Int.self, forKey: .chatSustainedSeconds) ?? d.chatSustainedSeconds
        warnCancelSeconds = try c.decodeIfPresent(Int.self, forKey: .warnCancelSeconds) ?? d.warnCancelSeconds
        skipIfUserIdleSeconds = try c.decodeIfPresent(Int.self, forKey: .skipIfUserIdleSeconds) ?? d.skipIfUserIdleSeconds
        processPattern = try c.decodeIfPresent(String.self, forKey: .processPattern) ?? d.processPattern
        codingFrontApps = try c.decodeIfPresent([String].self, forKey: .codingFrontApps) ?? d.codingFrontApps
        chatFrontApps = try c.decodeIfPresent([String].self, forKey: .chatFrontApps) ?? d.chatFrontApps
        playSound = try c.decodeIfPresent(Bool.self, forKey: .playSound) ?? d.playSound
        httpPort = try c.decodeIfPresent(Int.self, forKey: .httpPort) ?? d.httpPort
    }

    static func load(dir: URL) -> Config {
        let url = dir.appendingPathComponent("config.json")
        // 首次运行:从旧 vibeguard 迁移配置
        if !FileManager.default.fileExists(atPath: url.path) {
            let legacy = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent(".vibeguard/config.json")
            if FileManager.default.fileExists(atPath: legacy.path) {
                try? FileManager.default.copyItem(at: legacy, to: url)
            }
        }
        var cfg = Config()
        if let data = try? Data(contentsOf: url),
           let parsed = try? JSONDecoder().decode(Config.self, from: data) {
            cfg = parsed
        }
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        try? enc.encode(cfg).write(to: url)
        return cfg
    }
}

// MARK: - 调色板(与 HealthOS 品牌 tokens 同源:indigo 夜空系)

enum P {
    static func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
        NSColor(calibratedRed: r / 255, green: g / 255, blue: b / 255, alpha: a)
    }
    static let bg = rgb(5, 7, 13)
    static let heroText = rgb(240, 243, 250)
    static let dimText = rgb(153, 161, 182)
    static let footText = rgb(69, 76, 96)
    static let accent = rgb(143, 163, 255)
    static let teal = rgb(94, 234, 212)
    static let indigo = rgb(91, 108, 255)
    static let violet = rgb(124, 91, 240)
    static let auroraBlue = rgb(84, 98, 255)
    static let auroraTeal = rgb(45, 212, 191)
    static let auroraViolet = rgb(139, 92, 246)
}

// MARK: - 可成为 key 的无边框窗

final class ShieldWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

// MARK: - 本地 HTTP 状态端点(仅 127.0.0.1)

final class AgentServer {
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "healthos.focus.http")
    /// (method, path, body) → (status, jsonBody);在主线程执行
    private let handle: (String, String, Data?) -> (Int, Data)

    init?(port: UInt16, handler: @escaping (String, String, Data?) -> (Int, Data)) {
        handle = handler
        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        params.requiredLocalEndpoint = NWEndpoint.hostPort(
            host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: port)!)
        guard let l = try? NWListener(using: params) else { return nil }
        listener = l
        l.newConnectionHandler = { [weak self] conn in self?.serve(conn) }
        l.start(queue: queue)
    }

    private func serve(_ conn: NWConnection) {
        conn.start(queue: queue)
        receive(conn, buffer: Data())
    }

    private func receive(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, done, error in
            guard let self, error == nil else { conn.cancel(); return }
            var buf = buffer
            if let data { buf.append(data) }
            if let request = Self.parseRequest(buf) {
                self.respond(conn, request: request)
            } else if done || buf.count > 256 * 1024 {
                conn.cancel()
            } else {
                self.receive(conn, buffer: buf)
            }
        }
    }

    /// 完整请求解析出 (method, path, body);头未收全返回 nil 继续收
    private static func parseRequest(_ buf: Data) -> (String, String, Data?)? {
        guard let headEnd = buf.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        guard let head = String(data: buf[..<headEnd.lowerBound], encoding: .utf8) else { return nil }
        let lines = head.components(separatedBy: "\r\n")
        let parts = lines.first?.components(separatedBy: " ") ?? []
        guard parts.count >= 2 else { return nil }
        let method = parts[0], path = parts[1]
        var contentLength = 0
        for line in lines.dropFirst() {
            let kv = line.split(separator: ":", maxSplits: 1)
            if kv.count == 2, kv[0].lowercased() == "content-length" {
                contentLength = Int(kv[1].trimmingCharacters(in: .whitespaces)) ?? 0
            }
        }
        let body = buf[headEnd.upperBound...]
        if body.count < contentLength { return nil }
        return (method, path, contentLength > 0 ? Data(body.prefix(contentLength)) : nil)
    }

    private func respond(_ conn: NWConnection, request: (String, String, Data?)) {
        let (method, path, body) = request
        if method == "OPTIONS" {
            send(conn, status: 204, body: Data())
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self else { conn.cancel(); return }
            let (status, payload) = self.handle(method, path, body)
            self.queue.async { self.send(conn, status: status, body: payload) }
        }
    }

    private func send(_ conn: NWConnection, status: Int, body: Data) {
        let reason = status == 200 ? "OK" : status == 204 ? "No Content" : status == 404 ? "Not Found" : "Bad Request"
        var head = "HTTP/1.1 \(status) \(reason)\r\n"
        head += "Content-Type: application/json; charset=utf-8\r\n"
        head += "Content-Length: \(body.count)\r\n"
        head += "Access-Control-Allow-Origin: *\r\n"
        head += "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        head += "Access-Control-Allow-Headers: content-type\r\n"
        head += "Connection: close\r\n\r\n"
        var out = Data(head.utf8)
        out.append(body)
        conn.send(content: out, completion: .contentProcessed { _ in conn.cancel() })
    }
}

// MARK: - Apple Health export.xml 流式解析

/// SAX 解析 iOS 健康导出的 <Record>,按天聚合睡眠/静息心率/HRV/步数。
/// 内存恒定(不建 DOM),百万级记录也扛得住。
final class HealthExportDelegate: NSObject, XMLParserDelegate {
    private let cutoffStr: String                 // "yyyy-MM-dd",早于此的记录直接跳过
    private let df = DateFormatter()               // 解析 "yyyy-MM-dd HH:mm:ss Z"
    private let dayFmt = DateFormatter()
    private let asleep: Set<String> = [
        "HKCategoryValueSleepAnalysisAsleepUnspecified",
        "HKCategoryValueSleepAnalysisAsleepCore",
        "HKCategoryValueSleepAnalysisAsleepDeep",
        "HKCategoryValueSleepAnalysisAsleepREM",
    ]
    private var sleepSec: [String: Double] = [:]
    private var hr: [String: (sum: Double, n: Int)] = [:]
    private var hrv: [String: (sum: Double, n: Int)] = [:]
    private var steps: [String: Double] = [:]

    init(cutoff: Date) {
        df.dateFormat = "yyyy-MM-dd HH:mm:ss Z"
        df.locale = Locale(identifier: "en_US_POSIX")
        dayFmt.dateFormat = "yyyy-MM-dd"
        dayFmt.locale = Locale(identifier: "en_US_POSIX")
        let c = DateFormatter()
        c.dateFormat = "yyyy-MM-dd"
        cutoffStr = c.string(from: cutoff)
        super.init()
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?, attributes a: [String: String]) {
        guard elementName == "Record", let type = a["type"], let startStr = a["startDate"] else { return }
        if startStr.count >= 10, String(startStr.prefix(10)) < cutoffStr { return }  // ISO 字典序早筛

        switch type {
        case "HKCategoryTypeIdentifierSleepAnalysis":
            guard let v = a["value"], asleep.contains(v), let endStr = a["endDate"],
                  let s = df.date(from: startStr), let e = df.date(from: endStr) else { return }
            let dur = e.timeIntervalSince(s)
            guard dur > 0, dur <= 16 * 3600 else { return }
            // 一夜归到醒来那天 ≈ 入睡 + 6 小时的日期
            sleepSec[dayFmt.string(from: s.addingTimeInterval(6 * 3600)), default: 0] += dur
        case "HKQuantityTypeIdentifierRestingHeartRate":
            guard let v = a["value"].flatMap({ Double($0) }), let s = df.date(from: startStr) else { return }
            let k = dayFmt.string(from: s); let c = hr[k] ?? (0, 0); hr[k] = (c.sum + v, c.n + 1)
        case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
            guard let v = a["value"].flatMap({ Double($0) }), let s = df.date(from: startStr) else { return }
            let k = dayFmt.string(from: s); let c = hrv[k] ?? (0, 0); hrv[k] = (c.sum + v, c.n + 1)
        case "HKQuantityTypeIdentifierStepCount":
            guard let v = a["value"].flatMap({ Double($0) }), let s = df.date(from: startStr) else { return }
            steps[dayFmt.string(from: s), default: 0] += v
        default: break
        }
    }

    /// 按天合并成 [{date, sleepHours?, restingHR?, hrv?, steps?}],按日期升序
    func finish() -> [[String: Any]] {
        var keys = Set(sleepSec.keys)
        keys.formUnion(hr.keys); keys.formUnion(hrv.keys); keys.formUnion(steps.keys)
        var rows: [[String: Any]] = []
        for k in keys.sorted() where k >= cutoffStr {
            var row: [String: Any] = ["date": k]
            if let s = sleepSec[k] { row["sleepHours"] = (s / 3600 * 10).rounded() / 10 }
            if let c = hr[k], c.n > 0 { row["restingHR"] = (c.sum / Double(c.n)).rounded() }
            if let c = hrv[k], c.n > 0 { row["hrv"] = (c.sum / Double(c.n)).rounded() }
            if let st = steps[k] { row["steps"] = Int(st) }
            rows.append(row)
        }
        return rows
    }
}

// MARK: - 主程序

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    let dir = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/HealthOS", isDirectory: true)
    lazy var config = Config.load(dir: dir)

    enum Phase { case normal, warning(endsAt: Date), breaking(endsAt: Date) }
    var phase: Phase = .normal
    var score = 0.0
    var chatFrontSeconds = 0
    var warnInactiveSeconds = 0
    var lastSampleActive = false
    var lastSampleNote = "尚未采样"
    var lastMilestone = 0
    var pausedUntil: Date?
    var breaksToday = 0

    // Session 生命周期(净累积 ≥60s 起算,回落到 0 时落盘)
    var sessionStart: Date?
    var sessionPeak = 0.0

    var statusItem: NSStatusItem!
    var tickTimer: Timer?
    var ticks = 0
    var server: AgentServer?

    // 休息屏
    var shieldWindows: [NSWindow] = []
    var countdownLabels: [NSTextField] = []
    var breathLabels: [NSTextField] = []
    var tipLabels: [NSTextField] = []
    var arcMasks: [CAShapeLayer] = []
    var arcGlows: [CAShapeLayer] = []
    var eventMonitor: Any?
    var breakDuration: TimeInterval = 300
    var breakStart = Date()
    var lastTipIndex = -1
    let tips = [
        "站起来,伸个懒腰",
        "看看窗外最远的东西",
        "喝口水,眨眨眼睛",
        "转转肩膀,松松脖子",
        "什么都不想,就这样待一会儿",
    ]

    // 预警卡片
    var warnPanel: NSPanel?
    var warnNumLabel: NSTextField?
    var warnRing: CAShapeLayer?

    // HLT-3 自适应策略:State Engine 按当日状态推来的专注窗口覆盖(当日有效,按日过期)
    var policyLimitSeconds: Int?
    var policyReason: String?
    var policyDate: String?

    var testMode = false

    func applicationDidFinishLaunching(_ note: Notification) {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        let args = CommandLine.arguments
        // Apple Health 导出导入(离线,无需运行守护):
        //   healthos-focus-agent --import-health ~/Downloads/apple_health_export/export.xml
        if let i = args.firstIndex(of: "--import-health") {
            let path = args.count > i + 1 ? args[i + 1] : ""
            let n = importAppleHealth(path: path)
            FileHandle.standardOutput.write("imported \(n) days → \(dir.appendingPathComponent("health.jsonl").path)\n".data(using: .utf8)!)
            exit(n >= 0 ? 0 : 1)
        }
        loadPolicy()
        if let i = args.firstIndex(of: "--test-break") {
            testMode = true
            let secs = args.count > i + 1 ? (Double(args[i + 1]) ?? 8) : 8
            startBreak(duration: secs, force: true)
            return
        }
        if let i = args.firstIndex(of: "--test-warn") {
            testMode = true
            let secs = args.count > i + 1 ? (Double(args[i + 1]) ?? 8) : 8
            phase = .warning(endsAt: Date().addingTimeInterval(secs))
            showWarnPanel()
            startTicking()
            return
        }

        setupStatusItem()
        startTicking()
        try? FileManager.default.createDirectory(
            at: dir.appendingPathComponent("inbox"), withIntermediateDirectories: true)
        scanInbox()
        // 伴侣 app 经 iCloud/本地 inbox 投递:每 30 秒扫一次
        let inboxTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.scanInbox()
        }
        inboxTimer.tolerance = 5
        server = AgentServer(port: UInt16(config.httpPort)) { [weak self] method, path, body in
            self?.route(method: method, path: path, body: body) ?? (500, Data("{}".utf8))
        }

        let wc = NSWorkspace.shared.notificationCenter
        wc.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in
            self?.resetScore(reason: "系统睡眠", kind: "sleep")
        }
        wc.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.resetScore(reason: "系统唤醒", kind: "sleep")
        }
        log("healthos-focus-agent v3.2 启动 (limit=\(config.limitSeconds)s rest=\(config.restSeconds)s warn=\(config.warnSeconds)s http=\(config.httpPort) inbox=on)")
        logEvent("agent_started", detail: nil)
    }

    func startTicking() {
        tickTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in self?.tick() }
        tickTimer?.tolerance = 0.2
        RunLoop.main.add(tickTimer!, forMode: .common)
    }

    // MARK: HTTP 路由(主线程)

    func route(method: String, path: String, body: Data?) -> (Int, Data) {
        httpAccessLog(method: method, path: path)
        func json(_ obj: Any) -> Data {
            (try? JSONSerialization.data(withJSONObject: obj)) ?? Data("{}".utf8)
        }
        switch (method, path.split(separator: "?").first.map(String.init) ?? path) {
        case ("GET", "/state"):
            return (200, json(stateSnapshot()))
        case ("GET", "/sessions"):
            return (200, json(["sessions": readJsonl("sessions.jsonl", limit: 100)]))
        case ("GET", "/events"):
            return (200, json(["events": readJsonl("events.jsonl", limit: 200)]))
        case ("GET", "/config"):
            let data = (try? Data(contentsOf: dir.appendingPathComponent("config.json"))) ?? Data("{}".utf8)
            return (200, data)
        case ("GET", "/health"):
            return (200, json(["days": readJsonl("health.jsonl", limit: 60)]))
        case ("POST", "/ingest"):
            // 伴侣 app 投递健康样本:{days:[{date,sleepHours?,restingHR?,hrv?,steps?}]}
            guard let body,
                  let obj = try? JSONSerialization.jsonObject(with: body) else { return (400, json(["ok": false])) }
            let days = (obj as? [String: Any])?["days"] as? [[String: Any]] ?? (obj as? [[String: Any]])
            guard let days else { return (400, json(["ok": false, "error": "days[] required"])) }
            let n = ingestHealth(days: days)
            log("POST /ingest 摄入 \(days.count) 条,现有 \(n) 天")
            return (200, json(["ok": true, "days": n]))
        case ("POST", "/policy"):
            // HLT-3:State Engine 推来当日专注窗口覆盖 {limitSeconds, reason}。清除传 {clear:true}
            guard let body,
                  let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any]
            else { return (400, json(["ok": false])) }
            if obj["clear"] as? Bool == true {
                clearPolicy()
            } else if let lim = (obj["limitSeconds"] as? NSNumber)?.intValue {
                setPolicy(limitSeconds: lim, reason: obj["reason"] as? String)
            } else {
                return (400, json(["ok": false, "error": "limitSeconds required"]))
            }
            return (200, json(["ok": true, "effectiveLimitSeconds": effectiveLimit()]))
        case ("POST", "/action"):
            guard let body,
                  let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
                  let type = obj["type"] as? String else { return (400, json(["ok": false])) }
            switch type {
            case "break": breakNow()
            case "pause30": pause30()
            case "pause2h": pause2h()
            case "pauseToday": pauseToday()
            case "resume": resumeNow()
            default: return (400, json(["ok": false, "error": "unknown action"]))
            }
            return (200, json(["ok": true]))
        default:
            return (404, json(["error": "not found"]))
        }
    }

    func stateSnapshot() -> [String: Any] {
        var phaseStr = "normal"
        var phaseEndsAt: Any = NSNull()
        switch phase {
        case .normal: break
        case .warning(let t): phaseStr = "warning"; phaseEndsAt = t.timeIntervalSince1970
        case .breaking(let t): phaseStr = "breaking"; phaseEndsAt = t.timeIntervalSince1970
        }
        let filePaused = isFilePaused()
        let menuPaused = pausedUntil.map { $0 > Date() } ?? false
        var session: Any = NSNull()
        if let start = sessionStart {
            session = ["start": start.timeIntervalSince1970, "netSeconds": Int(score)]
        }
        return [
            "agent": "healthos-focus-agent",
            "version": "3.1",
            "phase": phaseStr,
            "phaseEndsAt": phaseEndsAt,
            "score": Int(score),
            "limitSeconds": effectiveLimit(),
            "baseLimitSeconds": config.limitSeconds,
            "policyReason": policyReason as Any? ?? NSNull(),
            "warnSeconds": config.warnSeconds,
            "restSeconds": config.restSeconds,
            "active": lastSampleActive,
            "note": lastSampleNote,
            "paused": filePaused || menuPaused,
            "pausedUntil": pausedUntil.map { $0.timeIntervalSince1970 } ?? NSNull(),
            "breaksToday": breaksToday,
            "session": session,
            "updatedAt": Date().timeIntervalSince1970,
        ]
    }

    // MARK: HLT-3 自适应策略

    func todayStr() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    /// 生效专注窗口:当日策略覆盖优先,否则回落 config;覆盖按日过期
    func effectiveLimit() -> Int {
        if let lim = policyLimitSeconds, policyDate == todayStr() { return lim }
        return config.limitSeconds
    }

    func setPolicy(limitSeconds: Int, reason: String?) {
        let clamped = max(5 * 60, min(60 * 60, limitSeconds))
        policyLimitSeconds = clamped
        policyReason = reason
        policyDate = todayStr()
        persistPolicy()
        log("自适应策略:今日专注窗口 \(clamped / 60) 分钟(\(reason ?? "—"))")
        logEvent("policy_set", detail: "\(clamped / 60)min · \(reason ?? "")")
    }

    func clearPolicy() {
        policyLimitSeconds = nil
        policyReason = nil
        policyDate = nil
        try? FileManager.default.removeItem(at: dir.appendingPathComponent("policy.json"))
        logEvent("policy_cleared", detail: nil)
    }

    func persistPolicy() {
        let obj: [String: Any] = [
            "date": policyDate ?? "",
            "limitSeconds": policyLimitSeconds ?? config.limitSeconds,
            "reason": policyReason ?? "",
        ]
        if let data = try? JSONSerialization.data(withJSONObject: obj, options: .prettyPrinted) {
            try? data.write(to: dir.appendingPathComponent("policy.json"))
        }
    }

    func loadPolicy() {
        guard let data = try? Data(contentsOf: dir.appendingPathComponent("policy.json")),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }
        // 只认当日策略,隔日自动失效
        if (obj["date"] as? String) == todayStr(), let lim = (obj["limitSeconds"] as? NSNumber)?.intValue {
            policyLimitSeconds = lim
            policyDate = todayStr()
            policyReason = obj["reason"] as? String
        }
    }

    // MARK: Apple Health 导出导入(export.xml → health.jsonl)
    //
    // macOS 没有 HealthKit,唯一现实路径是导入 iOS「健康」导出的 export.xml。
    // 流式(SAX)解析,内存恒定;抽取近 N 天睡眠时长 / 静息心率 / HRV / 步数,
    // 按天聚合成 health.jsonl,供 State Engine 用测量数据替代手动睡眠。
    // 返回写入的天数;失败返回 -1。
    func importAppleHealth(path: String, days: Int = 30) -> Int {
        let url = URL(fileURLWithPath: (path as NSString).expandingTildeInPath)
        guard let stream = InputStream(url: url) else {
            FileHandle.standardError.write("找不到文件:\(url.path)\n".data(using: .utf8)!)
            return -1
        }
        let cutoff = Date().addingTimeInterval(-Double(days) * 86400)
        let parser = XMLParser(stream: stream)
        let delegate = HealthExportDelegate(cutoff: cutoff)
        parser.delegate = delegate
        guard parser.parse() else {
            FileHandle.standardError.write("解析失败:\(parser.parserError?.localizedDescription ?? "?")\n".data(using: .utf8)!)
            return -1
        }
        let rows = delegate.finish()
        return ingestHealth(days: rows)
    }

    // MARK: 健康数据摄入(伴侣 app / 导入共用)
    //
    // 单一 upsert 入口:按 date 合并进 health.jsonl(逐字段覆盖,保留旧字段),
    // 排序去重,只留最近 60 天。Watch/iPhone 伴侣 app 经 POST /ingest 或 iCloud
    // inbox 投递,与 --import-health 走同一条落盘路径。返回落盘的天数。
    @discardableResult
    func ingestHealth(days newDays: [[String: Any]]) -> Int {
        var byDate: [String: [String: Any]] = [:]
        // 读现有
        for row in readJsonl("health.jsonl", limit: 400) {
            if let d = row["date"] as? String { byDate[d] = row }
        }
        // 合并新数据(逐字段 upsert)
        for day in newDays {
            guard let d = day["date"] as? String else { continue }
            var merged = byDate[d] ?? ["date": d]
            for (k, v) in day where k != "date" { merged[k] = v }
            byDate[d] = merged
        }
        // 排序、截断最近 60 天
        let sorted = byDate.keys.sorted().suffix(60).map { byDate[$0]! }
        let out = sorted
            .compactMap { (try? JSONSerialization.data(withJSONObject: $0)).flatMap { String(data: $0, encoding: .utf8) } }
            .joined(separator: "\n")
        try? (out + (out.isEmpty ? "" : "\n")).data(using: .utf8)?
            .write(to: dir.appendingPathComponent("health.jsonl"))
        return sorted.count
    }

    /// 扫描 inbox 里的 *.json 投递(伴侣 app 写入),摄入后删除。
    /// 两个投递口:本地 inbox/ 与 iCloud Drive(伴侣 app 写 iCloud,同步到 Mac,无需联网)。
    /// 文件格式:{"days":[{date,sleepHours?,restingHR?,hrv?,steps?}]} 或裸数组。
    func inboxDirs() -> [URL] {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return [
            dir.appendingPathComponent("inbox", isDirectory: true),
            // iCloud Drive 容器(伴侣 app 的 iCloud.space.kenos.healthos)。裸二进制无需
            // entitlement 也能读已同步到本地的文件。
            home.appendingPathComponent(
                "Library/Mobile Documents/iCloud~space~kenos~healthos/Documents/inbox",
                isDirectory: true),
        ]
    }

    func scanInbox() {
        var total = 0
        for inbox in inboxDirs() {
            guard let files = try? FileManager.default.contentsOfDirectory(
                at: inbox, includingPropertiesForKeys: nil) else { continue }
            for f in files where f.pathExtension == "json" {
                guard let data = try? Data(contentsOf: f) else { continue }
                let obj = try? JSONSerialization.jsonObject(with: data)
                let days = (obj as? [String: Any])?["days"] as? [[String: Any]] ?? (obj as? [[String: Any]])
                if let days { ingestHealth(days: days); total += days.count }
                try? FileManager.default.removeItem(at: f)
            }
        }
        if total > 0 { log("inbox 摄入 \(total) 条健康样本") }
    }

    // MARK: 事件与 session 落盘

    func jsonlAppend(_ file: String, _ obj: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: obj) else { return }
        let url = dir.appendingPathComponent(file)
        var line = data
        line.append(Data("\n".utf8))
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile()
            h.write(line)
            try? h.close()
        } else {
            try? line.write(to: url)
        }
    }

    func readJsonl(_ file: String, limit: Int) -> [[String: Any]] {
        guard let text = try? String(contentsOf: dir.appendingPathComponent(file), encoding: .utf8) else { return [] }
        return text.split(separator: "\n").suffix(limit).reversed().compactMap {
            (try? JSONSerialization.jsonObject(with: Data($0.utf8))) as? [String: Any]
        }
    }

    func logEvent(_ type: String, detail: String?) {
        jsonlAppend("events.jsonl", [
            "ts": Date().timeIntervalSince1970,
            "type": type,
            "detail": detail ?? NSNull(),
        ])
    }

    func closeSession(kind: String) {
        guard let start = sessionStart else { return }
        jsonlAppend("sessions.jsonl", [
            "start": start.timeIntervalSince1970,
            "end": Date().timeIntervalSince1970,
            "peakNetSeconds": Int(sessionPeak),
            "endReason": kind,
        ])
        sessionStart = nil
        sessionPeak = 0
    }

    // MARK: 菜单栏

    func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu
        setStatus(symbol: "figure.mind.and.body", fallback: "🧘", text: "")
    }

    func setStatus(symbol: String, fallback: String, text: String) {
        guard let btn = statusItem?.button else { return }
        if let img = NSImage(systemSymbolName: symbol, accessibilityDescription: "HealthOS Focus")?
            .withSymbolConfiguration(.init(pointSize: 12.5, weight: .medium)) {
            img.isTemplate = true
            btn.image = img
            btn.imagePosition = text.isEmpty ? .imageOnly : .imageLeading
            btn.title = text.isEmpty ? "" : " " + text
        } else {
            btn.image = nil
            btn.title = fallback + (text.isEmpty ? "" : " " + text)
        }
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        func info(_ s: String) {
            let item = NSMenuItem(title: s, action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        }
        info(statusText())
        info("此刻:\(lastSampleNote)")
        info("今天已休息 \(breaksToday) 次")
        menu.addItem(.separator())

        if let until = pausedUntil, until > Date() {
            let fmt = DateFormatter(); fmt.dateFormat = "HH:mm"
            menu.addItem(withTitle: "▶️ 恢复计时(暂停至 \(fmt.string(from: until)))", action: #selector(resumeNow), keyEquivalent: "").target = self
        } else {
            menu.addItem(withTitle: "🌙 现在就休息", action: #selector(breakNow), keyEquivalent: "").target = self
            menu.addItem(withTitle: "⏸ 暂停 30 分钟", action: #selector(pause30), keyEquivalent: "").target = self
            menu.addItem(withTitle: "⏸ 暂停 2 小时", action: #selector(pause2h), keyEquivalent: "").target = self
            menu.addItem(withTitle: "💤 今天不再打扰", action: #selector(pauseToday), keyEquivalent: "").target = self
        }
        menu.addItem(.separator())
        menu.addItem(withTitle: "🩺 打开 HealthOS", action: #selector(openHealthOS), keyEquivalent: "").target = self
        menu.addItem(withTitle: "📄 打开日志", action: #selector(openLog), keyEquivalent: "").target = self
        menu.addItem(withTitle: "⚙️ 编辑配置", action: #selector(openConfig), keyEquivalent: "").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "退出 Focus 代理", action: #selector(quit), keyEquivalent: "").target = self
    }

    func statusText() -> String {
        switch phase {
        case .normal:
            let m = Int(score) / 60, lim = effectiveLimit() / 60
            let suffix = policyReason != nil && policyDate == todayStr() ? " · 自适应" : ""
            return "vibe coding 净累积 \(m) / \(lim) 分钟\(suffix)"
        case .warning(let t):
            return "⚠️ \(max(0, Int(t.timeIntervalSinceNow))) 秒后休息(停手 \(config.warnCancelSeconds) 秒可取消)"
        case .breaking(let t):
            return "🌙 休息中,还剩 \(max(0, Int(t.timeIntervalSinceNow))) 秒"
        }
    }

    func updateStatusTitle() {
        guard statusItem != nil else { return }
        if let until = pausedUntil, until > Date() {
            setStatus(symbol: "pause.circle", fallback: "⏸", text: "")
            return
        }
        switch phase {
        case .normal:
            let remain = max(0.0, Double(effectiveLimit()) - score)
            setStatus(symbol: "figure.mind.and.body", fallback: "🧘",
                      text: score < 60 ? "" : "\(Int(ceil(remain / 60)))m")
        case .warning(let t):
            setStatus(symbol: "hourglass", fallback: "⚠️",
                      text: "\(max(0, Int(t.timeIntervalSinceNow)))s")
        case .breaking(let t):
            let s = max(0, Int(t.timeIntervalSinceNow))
            setStatus(symbol: "moon.zzz.fill", fallback: "🌙",
                      text: String(format: "%d:%02d", s / 60, s % 60))
        }
    }

    @objc func breakNow() { startBreak(duration: TimeInterval(config.restSeconds), force: true) }
    @objc func pause30() { pauseFor(30 * 60) }
    @objc func pause2h() { pauseFor(2 * 3600) }
    @objc func pauseToday() {
        pausedUntil = Calendar.current.startOfDay(for: Date()).addingTimeInterval(24 * 3600)
        resetScore(reason: "今天不再打扰", kind: "pause")
        logEvent("paused", detail: "今天不再打扰")
    }
    @objc func resumeNow() {
        pausedUntil = nil
        log("手动恢复计时")
        logEvent("resumed", detail: nil)
    }
    @objc func openHealthOS() {
        // 优先打开原生壳;没装则退回网页
        if !NSWorkspace.shared.open(URL(fileURLWithPath: "/Applications/HealthOS.app")) {
            NSWorkspace.shared.open(URL(string: "http://127.0.0.1:5192/")!)
        }
    }
    @objc func openLog() { NSWorkspace.shared.open(dir.appendingPathComponent("agent.log")) }
    @objc func openConfig() { NSWorkspace.shared.open(dir.appendingPathComponent("config.json")) }
    @objc func quit() { NSApp.terminate(nil) }

    func pauseFor(_ secs: TimeInterval) {
        pausedUntil = Date().addingTimeInterval(secs)
        resetScore(reason: "暂停 \(Int(secs / 60)) 分钟", kind: "pause")
        logEvent("paused", detail: "\(Int(secs / 60)) 分钟")
        if case .warning = phase { closeWarnPanel(); phase = .normal }
    }

    func isFilePaused() -> Bool {
        FileManager.default.fileExists(atPath: dir.appendingPathComponent("pause").path)
            || FileManager.default.fileExists(
                atPath: FileManager.default.homeDirectoryForCurrentUser
                    .appendingPathComponent(".vibeguard/pause").path)
    }

    // MARK: 每秒心跳

    func tick() {
        let filePaused = isFilePaused()
        let menuPaused = pausedUntil.map { $0 > Date() } ?? false
        if pausedUntil != nil && !menuPaused { pausedUntil = nil }
        let paused = filePaused || menuPaused

        if paused, case .breaking = phase {} else if paused {
            if case .warning = phase { closeWarnPanel(); phase = .normal }
            if score > 0 { resetScore(reason: "暂停", kind: "pause") }
            lastSampleNote = "已暂停"
            updateStatusTitle()
            return
        }

        ticks += 1
        switch phase {
        case .normal:
            if ticks % config.sampleInterval == 0 { sampleActivity() }
            if Int(score) >= effectiveLimit() - config.warnSeconds {
                phase = .warning(endsAt: Date().addingTimeInterval(TimeInterval(config.warnSeconds)))
                warnInactiveSeconds = 0
                showWarnPanel()
                if config.playSound { NSSound(named: "Glass")?.play() }
                log("预警:\(config.warnSeconds) 秒后休息(净累积 \(Int(score) / 60) 分钟)")
                logEvent("warn_shown", detail: "净累积 \(Int(score) / 60) 分钟")
            }
        case .warning(let endsAt):
            if ticks % config.sampleInterval == 0 {
                sampleActivity()
                if lastSampleActive {
                    warnInactiveSeconds = 0
                } else {
                    warnInactiveSeconds += config.sampleInterval
                    if warnInactiveSeconds >= config.warnCancelSeconds {
                        closeWarnPanel()
                        phase = .normal
                        score = min(score, Double(effectiveLimit() - config.warnSeconds - 120))
                        log("你停手了,本次休息取消(净累积回拉至 \(Int(score) / 60) 分钟)")
                        logEvent("warn_cancelled", detail: nil)
                        if testMode { NSApp.terminate(nil) }
                        break
                    }
                }
            }
            updateWarnPanel(remaining: endsAt.timeIntervalSinceNow)
            if Date() >= endsAt {
                closeWarnPanel()
                if testMode { NSApp.terminate(nil); return }
                startBreak(duration: TimeInterval(config.restSeconds), force: false)
            }
        case .breaking(let endsAt):
            updateBreakUI(remaining: endsAt.timeIntervalSinceNow)
            if Date() >= endsAt { endBreak() }
        }
        updateStatusTitle()
    }

    func resetScore(reason: String, kind: String = "reset") {
        if score >= 60 { log("清零(\(reason),此前净累积 \(Int(score) / 60) 分钟)") }
        closeSession(kind: kind)
        score = 0
        chatFrontSeconds = 0
        lastMilestone = 0
    }

    // MARK: 活跃度采样(漏桶)

    func sampleActivity() {
        let (maxCpu, sumCpu) = aiCpuStats()
        let front = NSWorkspace.shared.frontmostApplication?.localizedName ?? ""
        let idle = userIdleSeconds()
        let present = idle < Double(config.presenceSeconds)

        let frontCoding = config.codingFrontApps.contains { front.caseInsensitiveCompare($0) == .orderedSame }
        let frontChat = config.chatFrontApps.contains { front.caseInsensitiveCompare($0) == .orderedSame }

        if frontChat && present {
            chatFrontSeconds += config.sampleInterval
        } else {
            chatFrontSeconds = 0
        }
        let chatCounts = chatFrontSeconds >= config.chatSustainedSeconds

        let cpuBusy = maxCpu > config.cpuPerProcess || sumCpu > config.cpuTotal
        let isActive = present && (cpuBusy || frontCoding || chatCounts)

        if isActive {
            score += Double(config.sampleInterval)
        } else {
            score = max(0, score - Double(config.sampleInterval) * config.drainRatio)
        }
        lastSampleActive = isActive

        // session 生命周期
        if score >= 60 {
            if sessionStart == nil {
                sessionStart = Date().addingTimeInterval(-score)
            }
            sessionPeak = max(sessionPeak, score)
        } else if score == 0, sessionStart != nil {
            closeSession(kind: "reset")
        }

        var why: [String] = []
        if !present { why.append("人离开 \(Int(idle))s") }
        if cpuBusy { why.append(String(format: "CPU 峰%.0f%%/合%.0f%%", maxCpu, sumCpu)) }
        if frontCoding { why.append("前台 \(front)") }
        if frontChat { why.append(chatCounts ? "聊天 \(front) 已 \(chatFrontSeconds / 60) 分钟" : "聊天 \(front) 未满 \(config.chatSustainedSeconds / 60) 分钟(不计)") }
        lastSampleNote = (isActive ? "计时中 · " : "漏水中 · ") + (why.isEmpty ? "无活跃信号" : why.joined(separator: " · "))

        let milestone = Int(score) / 300
        if milestone > lastMilestone {
            log("净累积达 \(milestone * 5) 分钟(\(lastSampleNote))")
        }
        lastMilestone = milestone
    }

    func aiCpuStats() -> (maxCpu: Double, sumCpu: Double) {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/ps")
        p.arguments = ["-A", "-o", "%cpu=,comm="]
        let pipe = Pipe()
        p.standardOutput = pipe
        do { try p.run() } catch { return (0, 0) }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        guard let out = String(data: data, encoding: .utf8) else { return (0, 0) }
        var sum = 0.0, maxCpu = 0.0
        for raw in out.split(separator: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            guard let sp = line.firstIndex(of: " ") else { continue }
            let comm = String(line[line.index(after: sp)...]).lowercased()
            guard comm.range(of: config.processPattern, options: [.regularExpression, .caseInsensitive]) != nil else { continue }
            let cpu = Double(line[..<sp]) ?? 0
            sum += cpu
            maxCpu = max(maxCpu, cpu)
        }
        return (maxCpu, sum)
    }

    func userIdleSeconds() -> Double {
        let types: [CGEventType] = [.keyDown, .mouseMoved, .leftMouseDown, .rightMouseDown, .scrollWheel, .leftMouseDragged]
        let secs = types.map { CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: $0) }
        return secs.min() ?? 0
    }

    // MARK: 预警卡片(毛玻璃 + 环形秒数 + 胶囊按钮)

    func showWarnPanel() {
        guard warnPanel == nil, let screen = NSScreen.main else { return }
        let size = NSSize(width: 356, height: 120)
        let vf = screen.visibleFrame
        let origin = NSPoint(x: vf.maxX - size.width - 18, y: vf.maxY - size.height - 14)
        let panel = NSPanel(contentRect: NSRect(origin: origin, size: size),
                            styleMask: [.nonactivatingPanel, .borderless],
                            backing: .buffered, defer: false)
        panel.level = .statusBar
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isFloatingPanel = true

        let blur = NSVisualEffectView(frame: NSRect(origin: .zero, size: size))
        blur.material = .hudWindow
        blur.state = .active
        blur.wantsLayer = true
        blur.layer?.cornerRadius = 22
        blur.layer?.masksToBounds = true
        blur.layer?.borderWidth = 1
        blur.layer?.borderColor = NSColor(calibratedWhite: 1, alpha: 0.08).cgColor

        let ringBox = NSView(frame: NSRect(x: 18, y: size.height - 16 - 46, width: 46, height: 46))
        ringBox.wantsLayer = true
        let ringPath = CGMutablePath()
        ringPath.addArc(center: CGPoint(x: 23, y: 23), radius: 20,
                        startAngle: .pi / 2, endAngle: .pi / 2 - 2 * .pi, clockwise: true)
        let track = CAShapeLayer()
        track.path = ringPath
        track.fillColor = NSColor.clear.cgColor
        track.strokeColor = NSColor(calibratedWhite: 1, alpha: 0.09).cgColor
        track.lineWidth = 2.5
        ringBox.layer?.addSublayer(track)
        let fill = CAShapeLayer()
        fill.path = ringPath
        fill.fillColor = NSColor.clear.cgColor
        fill.strokeColor = P.accent.cgColor
        fill.lineWidth = 2.5
        fill.lineCap = .round
        fill.strokeEnd = 1
        ringBox.layer?.addSublayer(fill)
        warnRing = fill
        let num = NSTextField(labelWithString: "\(config.warnSeconds)")
        num.font = .monospacedDigitSystemFont(ofSize: 14, weight: .medium)
        num.textColor = P.rgb(223, 228, 255)
        num.alignment = .center
        num.frame = NSRect(x: 0, y: 14, width: 46, height: 18)
        ringBox.addSubview(num)
        warnNumLabel = num
        blur.addSubview(ringBox)

        let title = NSTextField(labelWithString: "该收尾了 · 快满 \(effectiveLimit() / 60) 分钟")
        title.font = .systemFont(ofSize: 13.5, weight: .semibold)
        title.textColor = P.rgb(240, 242, 248)
        title.lineBreakMode = .byTruncatingTail
        title.frame = NSRect(x: 78, y: size.height - 16 - 20, width: size.width - 78 - 18, height: 20)
        blur.addSubview(title)

        let sub = NSTextField(labelWithString: "停手 \(config.warnCancelSeconds) 秒自动取消 · 到点休息 \(config.restSeconds / 60) 分钟")
        sub.font = .systemFont(ofSize: 11.5, weight: .regular)
        sub.textColor = P.rgb(152, 160, 182)
        sub.lineBreakMode = .byTruncatingTail
        sub.frame = NSRect(x: 78, y: size.height - 16 - 20 - 19, width: size.width - 78 - 18, height: 16)
        blur.addSubview(sub)

        let pill = NSView(frame: NSRect(x: 78, y: 13, width: 100, height: 28))
        pill.wantsLayer = true
        let pillGrad = CAGradientLayer()
        pillGrad.frame = pill.bounds
        pillGrad.colors = [P.indigo.cgColor, P.violet.cgColor]
        pillGrad.startPoint = CGPoint(x: 0, y: 1)
        pillGrad.endPoint = CGPoint(x: 1, y: 0)
        pillGrad.cornerRadius = 14
        pill.layer?.addSublayer(pillGrad)
        pill.layer?.shadowColor = P.indigo.cgColor
        pill.layer?.shadowOpacity = 0.35
        pill.layer?.shadowRadius = 7
        pill.layer?.shadowOffset = CGSize(width: 0, height: -2)
        let pillLabel = NSTextField(labelWithString: "现在就休息")
        pillLabel.font = .systemFont(ofSize: 12, weight: .semibold)
        pillLabel.textColor = .white
        pillLabel.alignment = .center
        pillLabel.frame = NSRect(x: 0, y: 6, width: 100, height: 16)
        pill.addSubview(pillLabel)
        pill.addGestureRecognizer(NSClickGestureRecognizer(target: self, action: #selector(breakNow)))
        blur.addSubview(pill)

        let ghost = NSTextField(labelWithString: "保存工作,喘口气")
        ghost.font = .systemFont(ofSize: 11.5, weight: .regular)
        ghost.textColor = P.rgb(109, 116, 136)
        ghost.frame = NSRect(x: 190, y: 19, width: size.width - 190 - 18, height: 16)
        blur.addSubview(ghost)

        panel.contentView = blur
        panel.alphaValue = 0
        var frame = panel.frame
        frame.origin.y += 16
        panel.setFrame(frame, display: false)
        panel.orderFrontRegardless()
        frame.origin.y -= 16
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.45
            ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().alphaValue = 1
            panel.animator().setFrame(frame, display: true)
        }
        warnPanel = panel
        updateWarnPanel(remaining: TimeInterval(config.warnSeconds))
    }

    func updateWarnPanel(remaining: TimeInterval) {
        let s = max(0, Int(remaining))
        warnNumLabel?.stringValue = "\(s)"
        if let ring = warnRing {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            ring.strokeEnd = CGFloat(max(0, min(1, remaining / Double(config.warnSeconds))))
            CATransaction.commit()
        }
    }

    func closeWarnPanel() {
        warnPanel?.orderOut(nil)
        warnPanel = nil
        warnNumLabel = nil
        warnRing = nil
    }

    // MARK: 休息屏(夜空极光 + 呼吸表盘)

    func startBreak(duration: TimeInterval, force: Bool) {
        closeWarnPanel()
        if !force && userIdleSeconds() > Double(config.skipIfUserIdleSeconds) {
            log("触发时你已离开 \(Int(userIdleSeconds())) 秒,视为已休息,跳过黑屏")
            logEvent("break_skipped_idle", detail: "离开 \(Int(userIdleSeconds()))s")
            resetScore(reason: "自然休息", kind: "reset")
            phase = .normal
            return
        }
        breakDuration = duration
        breakStart = Date()
        lastTipIndex = -1
        phase = .breaking(endsAt: Date().addingTimeInterval(duration))
        breaksToday += 1
        log("休息开始 \(Int(duration)) 秒")
        logEvent("break_started", detail: "\(Int(duration))s")

        let level = NSWindow.Level(rawValue: Int(CGShieldingWindowLevel()) + 1)
        for screen in NSScreen.screens {
            let w = ShieldWindow(contentRect: screen.frame, styleMask: .borderless,
                                 backing: .buffered, defer: false)
            w.level = level
            w.isOpaque = false
            w.backgroundColor = .clear
            w.hasShadow = false
            w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
            w.setFrame(screen.frame, display: true)

            let sw = screen.frame.width, sh = screen.frame.height
            let root = NSView(frame: NSRect(x: 0, y: 0, width: sw, height: sh))
            root.wantsLayer = true
            root.layer?.backgroundColor = P.bg.cgColor

            func aurora(_ color: NSColor, alpha: CGFloat, w bw: CGFloat, h bh: CGFloat,
                        cx acx: CGFloat, cy acy: CGFloat, dx: CGFloat, dy: CGFloat, secs: Double) {
                let g = CAGradientLayer()
                g.type = .radial
                g.colors = [color.withAlphaComponent(alpha).cgColor,
                            color.withAlphaComponent(alpha * 0.4).cgColor,
                            color.withAlphaComponent(0).cgColor]
                g.locations = [0, 0.45, 1]
                g.startPoint = CGPoint(x: 0.5, y: 0.5)
                g.endPoint = CGPoint(x: 1, y: 1)
                g.bounds = CGRect(x: 0, y: 0, width: bw, height: bh)
                g.position = CGPoint(x: acx, y: acy)
                let drift = CABasicAnimation(keyPath: "position")
                drift.fromValue = NSValue(point: CGPoint(x: acx, y: acy))
                drift.toValue = NSValue(point: CGPoint(x: acx + dx, y: acy + dy))
                drift.duration = secs
                drift.autoreverses = true
                drift.repeatCount = .infinity
                drift.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                g.add(drift, forKey: "drift")
                root.layer?.addSublayer(g)
            }
            aurora(P.auroraBlue, alpha: 0.26, w: sw * 0.64, h: sw * 0.46,
                   cx: sw * 0.36, cy: sh * 0.60, dx: sw * 0.06, dy: sh * 0.06, secs: 26)
            aurora(P.auroraTeal, alpha: 0.15, w: sw * 0.52, h: sw * 0.38,
                   cx: sw * 0.78, cy: sh * 0.36, dx: -sw * 0.05, dy: -sh * 0.05, secs: 34)
            aurora(P.auroraViolet, alpha: 0.14, w: sw * 0.44, h: sw * 0.32,
                   cx: sw * 0.52, cy: sh * 0.10, dx: sw * 0.05, dy: sh * 0.05, secs: 42)

            let vignette = CAGradientLayer()
            vignette.type = .radial
            vignette.colors = [NSColor.clear.cgColor, NSColor.clear.cgColor,
                               NSColor(calibratedWhite: 0, alpha: 0.62).cgColor]
            vignette.locations = [0, 0.42, 1]
            vignette.startPoint = CGPoint(x: 0.5, y: 0.54)
            vignette.endPoint = CGPoint(x: 1.1, y: 1.1)
            vignette.frame = root.bounds
            root.layer?.addSublayer(vignette)

            let cx = sw / 2
            let cyc = sh / 2 + 14

            let breathe = CABasicAnimation(keyPath: "transform.scale")
            breathe.fromValue = 0.92
            breathe.toValue = 1.08
            breathe.duration = 4.0
            breathe.autoreverses = true
            breathe.repeatCount = .infinity
            breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)

            let halo = CAGradientLayer()
            halo.type = .radial
            halo.colors = [P.rgb(99, 112, 255, 0.20).cgColor,
                           P.rgb(99, 112, 255, 0.05).cgColor,
                           P.rgb(99, 112, 255, 0).cgColor]
            halo.locations = [0, 0.55, 0.74]
            halo.startPoint = CGPoint(x: 0.5, y: 0.5)
            halo.endPoint = CGPoint(x: 1, y: 1)
            halo.bounds = CGRect(x: 0, y: 0, width: 420, height: 420)
            halo.position = CGPoint(x: cx, y: cyc)
            halo.add(breathe, forKey: "breathe")
            root.layer?.addSublayer(halo)

            let halo2 = CAShapeLayer()
            halo2.path = CGPath(ellipseIn: CGRect(x: 0, y: 0, width: 300, height: 300), transform: nil)
            halo2.fillColor = NSColor.clear.cgColor
            halo2.strokeColor = P.rgb(160, 175, 255, 0.14).cgColor
            halo2.lineWidth = 1
            halo2.bounds = CGRect(x: 0, y: 0, width: 300, height: 300)
            halo2.position = CGPoint(x: cx, y: cyc)
            halo2.add(breathe, forKey: "breathe")
            root.layer?.addSublayer(halo2)

            let dialD: CGFloat = 456
            let arcPath = CGMutablePath()
            arcPath.addArc(center: CGPoint(x: dialD / 2, y: dialD / 2), radius: dialD / 2 - 2,
                           startAngle: .pi / 2, endAngle: .pi / 2 - 2 * .pi, clockwise: true)

            let dialTrack = CAShapeLayer()
            dialTrack.path = arcPath
            dialTrack.fillColor = NSColor.clear.cgColor
            dialTrack.strokeColor = NSColor(calibratedWhite: 1, alpha: 0.07).cgColor
            dialTrack.lineWidth = 1.5
            dialTrack.bounds = CGRect(x: 0, y: 0, width: dialD, height: dialD)
            dialTrack.position = CGPoint(x: cx, y: cyc)
            root.layer?.addSublayer(dialTrack)

            let glow = CAShapeLayer()
            glow.path = arcPath
            glow.fillColor = NSColor.clear.cgColor
            glow.strokeColor = P.rgb(120, 140, 255, 0.25).cgColor
            glow.lineWidth = 9
            glow.lineCap = .round
            glow.strokeEnd = 0
            glow.bounds = CGRect(x: 0, y: 0, width: dialD, height: dialD)
            glow.position = CGPoint(x: cx, y: cyc)
            root.layer?.addSublayer(glow)
            arcGlows.append(glow)

            let arcMask = CAShapeLayer()
            arcMask.path = arcPath
            arcMask.fillColor = NSColor.clear.cgColor
            arcMask.strokeColor = NSColor.white.cgColor
            arcMask.lineWidth = 3
            arcMask.lineCap = .round
            arcMask.strokeEnd = 0
            arcMask.frame = CGRect(x: 0, y: 0, width: dialD, height: dialD)
            let arcGrad = CAGradientLayer()
            arcGrad.colors = [P.indigo.cgColor, P.teal.cgColor]
            arcGrad.startPoint = CGPoint(x: 0, y: 1)
            arcGrad.endPoint = CGPoint(x: 1, y: 0)
            arcGrad.bounds = CGRect(x: 0, y: 0, width: dialD, height: dialD)
            arcGrad.position = CGPoint(x: cx, y: cyc)
            arcGrad.mask = arcMask
            root.layer?.addSublayer(arcGrad)
            arcMasks.append(arcMask)

            func addLabel(_ attr: NSAttributedString, centerY: CGFloat, h: CGFloat) -> NSTextField {
                let l = NSTextField(labelWithString: "")
                l.attributedStringValue = attr
                l.alignment = .center
                l.frame = NSRect(x: 0, y: centerY - h / 2, width: sw, height: h)
                root.addSubview(l)
                return l
            }

            _ = addLabel(kerned("该休息了", kern: 6.5,
                                font: .systemFont(ofSize: 13, weight: .medium),
                                color: P.dimText),
                         centerY: cyc + 96, h: 20)

            let countdown = NSTextField(labelWithString: "")
            countdown.font = .monospacedDigitSystemFont(ofSize: 118, weight: .thin)
            countdown.textColor = P.heroText
            countdown.alignment = .center
            countdown.frame = NSRect(x: 0, y: cyc - 62, width: sw, height: 128)
            let heroShadow = NSShadow()
            heroShadow.shadowColor = P.rgb(120, 140, 255, 0.25)
            heroShadow.shadowBlurRadius = 40
            heroShadow.shadowOffset = .zero
            countdown.shadow = heroShadow
            root.addSubview(countdown)
            countdownLabels.append(countdown)

            let breath = addLabel(kerned("吸 气", kern: 6,
                                         font: .systemFont(ofSize: 12.5, weight: .medium),
                                         color: P.accent),
                                  centerY: cyc - 96, h: 18)
            breathLabels.append(breath)

            let dot = CAShapeLayer()
            dot.path = CGPath(ellipseIn: CGRect(x: 0, y: 0, width: 5, height: 5), transform: nil)
            dot.fillColor = P.accent.cgColor
            dot.bounds = CGRect(x: 0, y: 0, width: 5, height: 5)
            dot.position = CGPoint(x: cx - 42, y: cyc - 96)
            dot.shadowColor = P.accent.cgColor
            dot.shadowOpacity = 0.9
            dot.shadowRadius = 7
            dot.shadowOffset = .zero
            dot.add(breathe, forKey: "breathe")
            root.layer?.addSublayer(dot)

            let tip = addLabel(kerned(tips[0], kern: 2,
                                      font: .systemFont(ofSize: 15.5, weight: .light),
                                      color: P.dimText),
                               centerY: cyc - dialD / 2 - 52, h: 24)
            tipLabels.append(tip)

            let brand = NSTextField(labelWithString: "")
            brand.attributedStringValue = kerned("HEALTH.OS · FOCUS", kern: 5,
                                                 font: .systemFont(ofSize: 10, weight: .medium),
                                                 color: P.footText)
            brand.frame = NSRect(x: 28, y: 20, width: 280, height: 14)
            root.addSubview(brand)

            let count = NSTextField(labelWithString: "")
            count.attributedStringValue = kerned("今日第 \(breaksToday) 次休息", kern: 5,
                                                 font: .systemFont(ofSize: 10, weight: .medium),
                                                 color: P.footText)
            count.alignment = .right
            count.frame = NSRect(x: sw - 268, y: 20, width: 240, height: 14)
            root.addSubview(count)

            w.contentView = root
            w.alphaValue = 0
            w.makeKeyAndOrderFront(nil)
            shieldWindows.append(w)
        }

        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 2.0
            for w in shieldWindows { w.animator().alphaValue = 1 }
        }

        NSCursor.hide()
        NSApp.activate(ignoringOtherApps: true)
        eventMonitor = NSEvent.addLocalMonitorForEvents(
            matching: [.keyDown, .keyUp, .flagsChanged,
                       .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp,
                       .otherMouseDown, .otherMouseUp, .scrollWheel]) { _ in nil }
        if testMode || tickTimer == nil { startTicking() }
    }

    func kerned(_ s: String, kern: CGFloat, font: NSFont, color: NSColor) -> NSAttributedString {
        NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: color, .kern: kern])
    }

    func updateBreakUI(remaining: TimeInterval) {
        let r = max(0, remaining)
        let text = String(format: "%d:%02d", Int(r) / 60, Int(r) % 60)
        for l in countdownLabels { l.stringValue = text }

        let elapsed = Date().timeIntervalSince(breakStart)

        let inhale = elapsed.truncatingRemainder(dividingBy: 8) < 4
        let breathAttr = kerned(inhale ? "吸 气" : "呼 气", kern: 6,
                                font: .systemFont(ofSize: 12.5, weight: .medium),
                                color: P.accent)
        for l in breathLabels { l.attributedStringValue = breathAttr }

        let tipIndex = Int(elapsed / 45) % tips.count
        if tipIndex != lastTipIndex {
            lastTipIndex = tipIndex
            let attr = kerned(tips[tipIndex], kern: 2,
                              font: .systemFont(ofSize: 15.5, weight: .light),
                              color: P.dimText)
            for l in tipLabels {
                l.attributedStringValue = attr
                l.alphaValue = 0
                l.animator().alphaValue = 1
            }
        }

        let frac = breakDuration > 0 ? CGFloat(1 - r / breakDuration) : 1
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for m in arcMasks { m.strokeEnd = min(1, max(0, frac)) }
        for g in arcGlows { g.strokeEnd = min(1, max(0, frac)) }
        CATransaction.commit()

        NSApp.activate(ignoringOtherApps: true)
        for w in shieldWindows { w.makeKeyAndOrderFront(nil) }
        NSCursor.hide()
    }

    func endBreak() {
        log("休息结束")
        logEvent("break_ended", detail: nil)
        if let m = eventMonitor { NSEvent.removeMonitor(m); eventMonitor = nil }
        let windows = shieldWindows
        shieldWindows = []
        countdownLabels = []
        breathLabels = []
        tipLabels = []
        arcMasks = []
        arcGlows = []
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 1.2
            for w in windows { w.animator().alphaValue = 0 }
        }, completionHandler: { [weak self] in
            for w in windows { w.orderOut(nil) }
            NSCursor.unhide()
            guard let self else { return }
            if self.config.playSound { NSSound(named: "Glass")?.play() }
            if self.testMode { NSApp.terminate(nil) }
        })
        phase = .normal
        resetScore(reason: "休息完成", kind: "break")
    }

    // MARK: 日志

    /// http.log 只留最近访问痕迹(诊断 app↔代理连通性),每次启动清空
    var httpLogCleared = false
    func httpAccessLog(method: String, path: String) {
        let url = dir.appendingPathComponent("http.log")
        if !httpLogCleared {
            try? FileManager.default.removeItem(at: url)
            httpLogCleared = true
        }
        let fmt = DateFormatter()
        fmt.dateFormat = "HH:mm:ss"
        let line = "\(fmt.string(from: Date())) \(method) \(path)\n"
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile()
            h.write(line.data(using: .utf8)!)
            try? h.close()
        } else {
            try? line.data(using: .utf8)!.write(to: url)
        }
    }

    func log(_ msg: String) {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let line = "\(fmt.string(from: Date())) \(msg)\n"
        let url = dir.appendingPathComponent("agent.log")
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile()
            h.write(line.data(using: .utf8)!)
            try? h.close()
        } else {
            try? line.data(using: .utf8)!.write(to: url)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.setActivationPolicy(.accessory)
app.delegate = delegate
app.run()
