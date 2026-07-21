import Foundation
import HealthKit

/// HealthKit metric catalog — core types always requested; optional types are user-togglable.
enum KenosHealthMetricID: String, CaseIterable, Codable, Identifiable, Sendable {
    // Core (State Engine)
    case sleep
    case restingHR
    case hrv
    case steps
    // Optional activity / recovery
    case activeEnergy
    case exerciseTime
    case standTime
    case distance
    case workouts
    case mindful
    case spo2
    case respiratoryRate
    case bodyMass

    var id: String { rawValue }

    var isCore: Bool {
        switch self {
        case .sleep, .restingHR, .hrv, .steps: return true
        default: return false
        }
    }

    var title: String {
        switch self {
        case .sleep: return "Sleep"
        case .restingHR: return "Resting HR"
        case .hrv: return "HRV"
        case .steps: return "Steps"
        case .activeEnergy: return "Active energy"
        case .exerciseTime: return "Exercise minutes"
        case .standTime: return "Stand minutes"
        case .distance: return "Walking + running"
        case .workouts: return "Workouts"
        case .mindful: return "Mindful minutes"
        case .spo2: return "Blood oxygen"
        case .respiratoryRate: return "Respiratory rate"
        case .bodyMass: return "Weight"
        }
    }

    var systemImage: String {
        switch self {
        case .sleep: return "bed.double.fill"
        case .restingHR: return "heart.fill"
        case .hrv: return "waveform.path.ecg"
        case .steps: return "figure.walk"
        case .activeEnergy: return "flame.fill"
        case .exerciseTime: return "figure.run"
        case .standTime: return "figure.stand"
        case .distance: return "map"
        case .workouts: return "dumbbell.fill"
        case .mindful: return "brain.head.profile"
        case .spo2: return "lungs.fill"
        case .respiratoryRate: return "wind"
        case .bodyMass: return "scalemass.fill"
        }
    }

    /// Default on for optional metrics that commonly exist on Apple Watch.
    var defaultEnabled: Bool {
        if isCore { return true }
        switch self {
        case .activeEnergy, .exerciseTime, .standTime, .distance, .workouts:
            return true
        default:
            return false
        }
    }

    static var core: [KenosHealthMetricID] { allCases.filter(\.isCore) }
    static var optional: [KenosHealthMetricID] { allCases.filter { !$0.isCore } }
}

enum KenosHealthMetricCatalog {
    static func objectTypes(for ids: Set<KenosHealthMetricID>) -> Set<HKObjectType> {
        var s = Set<HKObjectType>()
        for id in ids {
            switch id {
            case .sleep:
                if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { s.insert(t) }
            case .restingHR:
                if let t = HKObjectType.quantityType(forIdentifier: .restingHeartRate) { s.insert(t) }
            case .hrv:
                if let t = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) { s.insert(t) }
            case .steps:
                if let t = HKObjectType.quantityType(forIdentifier: .stepCount) { s.insert(t) }
            case .activeEnergy:
                if let t = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { s.insert(t) }
            case .exerciseTime:
                if let t = HKObjectType.quantityType(forIdentifier: .appleExerciseTime) { s.insert(t) }
            case .standTime:
                if let t = HKObjectType.quantityType(forIdentifier: .appleStandTime) { s.insert(t) }
            case .distance:
                if let t = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) { s.insert(t) }
            case .workouts:
                s.insert(HKObjectType.workoutType())
            case .mindful:
                if let t = HKObjectType.categoryType(forIdentifier: .mindfulSession) { s.insert(t) }
            case .spo2:
                if let t = HKObjectType.quantityType(forIdentifier: .oxygenSaturation) { s.insert(t) }
            case .respiratoryRate:
                if let t = HKObjectType.quantityType(forIdentifier: .respiratoryRate) { s.insert(t) }
            case .bodyMass:
                if let t = HKObjectType.quantityType(forIdentifier: .bodyMass) { s.insert(t) }
            }
        }
        return s
    }

    /// Which metric IDs have at least one non-nil value in the day set.
    static func coverage(in days: [KenosHealthDay], enabled: Set<KenosHealthMetricID>) -> [KenosHealthMetricID: Bool] {
        var out: [KenosHealthMetricID: Bool] = [:]
        for id in enabled {
            out[id] = days.contains { day in
                switch id {
                case .sleep: return day.sleepHours != nil
                case .restingHR: return day.restingHR != nil
                case .hrv: return day.hrv != nil
                case .steps: return day.steps != nil
                case .activeEnergy: return day.activeEnergyKcal != nil
                case .exerciseTime: return day.exerciseMinutes != nil
                case .standTime: return day.standMinutes != nil
                case .distance: return day.distanceKm != nil
                case .workouts: return (day.workoutCount ?? 0) > 0 || day.workoutMinutes != nil
                case .mindful: return day.mindfulMinutes != nil
                case .spo2: return day.spo2Pct != nil
                case .respiratoryRate: return day.respiratoryRate != nil
                case .bodyMass: return day.bodyMassKg != nil
                }
            }
        }
        return out
    }
}
