import Foundation

/// 一天的健康测量聚合,schema 与 Mac 代理 health.jsonl / POST /ingest 完全一致。
/// 契约同源:date "yyyy-MM-dd"(醒来日),缺的字段省略(不写 0)。
struct HealthDay: Codable {
    let date: String
    var sleepHours: Double?
    var restingHR: Double?
    var hrv: Double?
    var steps: Int?

    /// 导出为 [String: Any],省略 nil 字段,供 JSONSerialization
    var payload: [String: Any] {
        var o: [String: Any] = ["date": date]
        if let sleepHours { o["sleepHours"] = (sleepHours * 10).rounded() / 10 }
        if let restingHR { o["restingHR"] = restingHR.rounded() }
        if let hrv { o["hrv"] = hrv.rounded() }
        if let steps { o["steps"] = steps }
        return o
    }
}

enum DayKey {
    static let fmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
    /// 睡眠归到醒来那天 ≈ 入睡 + 6 小时的日期(与代理 export 解析一致)
    static func wakeDay(sleepStart: Date) -> String { fmt.string(from: sleepStart.addingTimeInterval(6 * 3600)) }
    static func of(_ d: Date) -> String { fmt.string(from: d) }
}
