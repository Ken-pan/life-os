import Foundation

/// One-day measured aggregate. Core fields match Mac Focus agent `health.jsonl` /
/// `POST /ingest`. Extra fields are forward-compatible (agent upserts any key).
struct KenosHealthDay: Codable, Equatable, Sendable {
    let date: String
    // Core — State Engine
    var sleepHours: Double?
    var restingHR: Double?
    var hrv: Double?
    var steps: Int?
    // Optional — activity / recovery / body
    var activeEnergyKcal: Double?
    var exerciseMinutes: Double?
    var standMinutes: Double?
    var distanceKm: Double?
    var workoutMinutes: Double?
    var workoutCount: Int?
    var mindfulMinutes: Double?
    var spo2Pct: Double?
    var respiratoryRate: Double?
    var bodyMassKg: Double?

    var payload: [String: Any] {
        var o: [String: Any] = ["date": date]
        if let sleepHours { o["sleepHours"] = (sleepHours * 10).rounded() / 10 }
        if let restingHR { o["restingHR"] = restingHR.rounded() }
        if let hrv { o["hrv"] = hrv.rounded() }
        if let steps { o["steps"] = steps }
        if let activeEnergyKcal { o["activeEnergyKcal"] = activeEnergyKcal.rounded() }
        if let exerciseMinutes { o["exerciseMinutes"] = exerciseMinutes.rounded() }
        if let standMinutes { o["standMinutes"] = standMinutes.rounded() }
        if let distanceKm { o["distanceKm"] = (distanceKm * 100).rounded() / 100 }
        if let workoutMinutes { o["workoutMinutes"] = workoutMinutes.rounded() }
        if let workoutCount { o["workoutCount"] = workoutCount }
        if let mindfulMinutes { o["mindfulMinutes"] = mindfulMinutes.rounded() }
        if let spo2Pct { o["spo2Pct"] = (spo2Pct * 10).rounded() / 10 }
        if let respiratoryRate { o["respiratoryRate"] = (respiratoryRate * 10).rounded() / 10 }
        if let bodyMassKg { o["bodyMassKg"] = (bodyMassKg * 10).rounded() / 10 }
        return o
    }
}

enum KenosHealthDayKey {
    static let fmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    /// Wake-day key ≈ sleep start + 6h (same as Focus agent export parser).
    static func wakeDay(sleepStart: Date) -> String {
        fmt.string(from: sleepStart.addingTimeInterval(6 * 3600))
    }

    static func of(_ d: Date) -> String { fmt.string(from: d) }
}
