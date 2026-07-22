import Foundation
import HealthKit

/// Read enabled HealthKit metrics and aggregate by day.
/// Apple Watch samples sync into the iPhone health store automatically.
@MainActor
final class KenosHealthKitReader {
    private let store = HKHealthStore()

    static var isAvailable: Bool {
        KenosHealthKitFeature.isEnabled && HKHealthStore.isHealthDataAvailable()
    }

    func requestAuthorization(for metrics: Set<KenosHealthMetricID>) async throws {
        guard Self.isAvailable else {
            throw NSError(
                domain: "kenos.healthkit",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "HealthKit unavailable on this device"]
            )
        }
        let types = KenosHealthMetricCatalog.objectTypes(for: metrics)
        guard !types.isEmpty else { return }
        try await store.requestAuthorization(toShare: [], read: types)
    }

    func fetchDays(_ days: Int = 14, metrics: Set<KenosHealthMetricID>) async -> [KenosHealthDay] {
        let start = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        var byDate: [String: KenosHealthDay] = [:]
        func upsert(_ key: String, _ mutate: (inout KenosHealthDay) -> Void) {
            var d = byDate[key] ?? KenosHealthDay(date: key)
            mutate(&d)
            byDate[key] = d
        }

        // Core
        if metrics.contains(.sleep) { await fetchSleep(since: start, upsert: upsert) }
        if metrics.contains(.restingHR) {
            await averageQuantity(
                .restingHeartRate,
                unit: HKUnit.count().unitDivided(by: .minute()),
                since: start
            ) { k, v in upsert(k) { $0.restingHR = v } }
        }
        if metrics.contains(.hrv) {
            await averageQuantity(
                .heartRateVariabilitySDNN,
                unit: HKUnit.secondUnit(with: .milli),
                since: start
            ) { k, v in upsert(k) { $0.hrv = v } }
        }
        if metrics.contains(.steps) {
            await sumQuantity(.stepCount, unit: .count(), since: start) { k, v in
                upsert(k) { $0.steps = Int(v) }
            }
        }

        // Optional activity
        if metrics.contains(.activeEnergy) {
            await sumQuantity(.activeEnergyBurned, unit: .kilocalorie(), since: start) { k, v in
                upsert(k) { $0.activeEnergyKcal = v }
            }
        }
        if metrics.contains(.exerciseTime) {
            await sumQuantity(.appleExerciseTime, unit: .minute(), since: start) { k, v in
                upsert(k) { $0.exerciseMinutes = v }
            }
        }
        if metrics.contains(.standTime) {
            await sumQuantity(.appleStandTime, unit: .minute(), since: start) { k, v in
                upsert(k) { $0.standMinutes = v }
            }
        }
        if metrics.contains(.distance) {
            await sumQuantity(.distanceWalkingRunning, unit: .meterUnit(with: .kilo), since: start) { k, v in
                upsert(k) { $0.distanceKm = v }
            }
        }
        if metrics.contains(.workouts) { await fetchWorkouts(since: start, upsert: upsert) }
        if metrics.contains(.mindful) { await fetchMindful(since: start, upsert: upsert) }

        // Optional vitals / body
        if metrics.contains(.spo2) {
            await averageQuantity(.oxygenSaturation, unit: .percent(), since: start) { k, v in
                // HealthKit stores 0…1; expose as 0…100 for readability.
                upsert(k) { $0.spo2Pct = v * 100 }
            }
        }
        if metrics.contains(.respiratoryRate) {
            await averageQuantity(
                .respiratoryRate,
                unit: HKUnit.count().unitDivided(by: .minute()),
                since: start
            ) { k, v in upsert(k) { $0.respiratoryRate = v } }
        }
        if metrics.contains(.bodyMass) {
            await latestQuantity(.bodyMass, unit: .gramUnit(with: .kilo), since: start) { k, v in
                upsert(k) { $0.bodyMassKg = v }
            }
        }

        return byDate.values.sorted { $0.date < $1.date }
    }

    // MARK: - Specialized fetches

    private func fetchSleep(
        since: Date,
        upsert: (String, (inout KenosHealthDay) -> Void) -> Void
    ) async {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return }
        let samples = await query(sleepType, since: since) as? [HKCategorySample] ?? []
        var sleepSec: [String: Double] = [:]
        for s in samples where Self.isAsleep(s.value) {
            let dur = s.endDate.timeIntervalSince(s.startDate)
            guard dur > 0, dur <= 16 * 3600 else { continue }
            sleepSec[KenosHealthDayKey.wakeDay(sleepStart: s.startDate), default: 0] += dur
        }
        for (k, sec) in sleepSec {
            upsert(k) { $0.sleepHours = sec / 3600 }
        }
    }

    private func fetchWorkouts(
        since: Date,
        upsert: (String, (inout KenosHealthDay) -> Void) -> Void
    ) async {
        let samples = await query(HKObjectType.workoutType(), since: since) as? [HKWorkout] ?? []
        var minutes: [String: Double] = [:]
        var counts: [String: Int] = [:]
        for w in samples {
            let k = KenosHealthDayKey.of(w.startDate)
            minutes[k, default: 0] += w.duration / 60
            counts[k, default: 0] += 1
        }
        for (k, m) in minutes {
            upsert(k) {
                $0.workoutMinutes = m
                $0.workoutCount = counts[k]
            }
        }
    }

    private func fetchMindful(
        since: Date,
        upsert: (String, (inout KenosHealthDay) -> Void) -> Void
    ) async {
        guard let type = HKObjectType.categoryType(forIdentifier: .mindfulSession) else { return }
        let samples = await query(type, since: since) as? [HKCategorySample] ?? []
        var minutes: [String: Double] = [:]
        for s in samples {
            let dur = s.endDate.timeIntervalSince(s.startDate)
            guard dur > 0 else { continue }
            minutes[KenosHealthDayKey.of(s.startDate), default: 0] += dur / 60
        }
        for (k, m) in minutes {
            upsert(k) { $0.mindfulMinutes = m }
        }
    }

    // MARK: - Helpers

    static func isAsleep(_ value: Int) -> Bool {
        if #available(iOS 16.0, *) {
            return [
                HKCategoryValueSleepAnalysis.asleepCore,
                .asleepDeep,
                .asleepREM,
                .asleepUnspecified,
            ].map(\.rawValue).contains(value)
        }
        return value == HKCategoryValueSleepAnalysis.asleep.rawValue
    }

    private func query(_ type: HKSampleType, since: Date) async -> [HKSample] {
        await withCheckedContinuation { cont in
            let pred = HKQuery.predicateForSamples(withStart: since, end: Date())
            let q = HKSampleQuery(
                sampleType: type,
                predicate: pred,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, _ in
                cont.resume(returning: samples ?? [])
            }
            store.execute(q)
        }
    }

    private func averageQuantity(
        _ id: HKQuantityTypeIdentifier,
        unit: HKUnit,
        since: Date,
        into: (String, Double) -> Void
    ) async {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return }
        let samples = await query(type, since: since) as? [HKQuantitySample] ?? []
        var acc: [String: (sum: Double, n: Int)] = [:]
        for s in samples {
            let k = KenosHealthDayKey.of(s.startDate)
            let v = s.quantity.doubleValue(for: unit)
            let cur = acc[k] ?? (0, 0)
            acc[k] = (cur.sum + v, cur.n + 1)
        }
        for (k, c) in acc where c.n > 0 {
            into(k, c.sum / Double(c.n))
        }
    }

    private func sumQuantity(
        _ id: HKQuantityTypeIdentifier,
        unit: HKUnit,
        since: Date,
        into: (String, Double) -> Void
    ) async {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return }
        let samples = await query(type, since: since) as? [HKQuantitySample] ?? []
        var acc: [String: Double] = [:]
        for s in samples {
            acc[KenosHealthDayKey.of(s.startDate), default: 0] += s.quantity.doubleValue(for: unit)
        }
        for (k, v) in acc {
            into(k, v)
        }
    }

    /// Latest sample per calendar day (body mass).
    private func latestQuantity(
        _ id: HKQuantityTypeIdentifier,
        unit: HKUnit,
        since: Date,
        into: (String, Double) -> Void
    ) async {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return }
        let samples = await query(type, since: since) as? [HKQuantitySample] ?? []
        var latest: [String: (date: Date, value: Double)] = [:]
        for s in samples {
            let k = KenosHealthDayKey.of(s.startDate)
            let v = s.quantity.doubleValue(for: unit)
            if let cur = latest[k], cur.date >= s.startDate { continue }
            latest[k] = (s.startDate, v)
        }
        for (k, item) in latest {
            into(k, item.value)
        }
    }
}
