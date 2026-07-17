import Foundation
import HealthKit

/// 从 HealthKit 读取近 N 天的睡眠 / 静息心率 / HRV / 步数,按天聚合成 [HealthDay]。
/// Apple Watch 采集的数据会自动同步到 iPhone 的健康库,所以 iPhone app 读一处即可拿到全部。
/// 聚合口径与 Mac 代理的 export.xml 解析严格同源(见 apps/health/agent/FocusAgent.swift)。
final class HealthKitReader {
    let store = HKHealthStore()

    var readTypes: Set<HKObjectType> {
        var s = Set<HKObjectType>()
        if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { s.insert(t) }
        for id in [HKQuantityTypeIdentifier.restingHeartRate,
                   .heartRateVariabilitySDNN, .stepCount] {
            if let t = HKObjectType.quantityType(forIdentifier: id) { s.insert(t) }
        }
        return s
    }

    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestAuthorization() async throws {
        guard Self.isAvailable else { throw NSError(domain: "healthos", code: 1) }
        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    /// 拉近 days 天,聚合为按日 map(醒来日为 key)
    func fetchDays(_ days: Int = 14) async -> [HealthDay] {
        let start = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        var byDate: [String: HealthDay] = [:]
        func upsert(_ key: String, _ mutate: (inout HealthDay) -> Void) {
            var d = byDate[key] ?? HealthDay(date: key)
            mutate(&d)
            byDate[key] = d
        }

        // 睡眠:累加 asleep 段时长,归到醒来日
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            let samples = await self.query(sleepType, since: start) as? [HKCategorySample] ?? []
            var sleepSec: [String: Double] = [:]
            for s in samples where Self.isAsleep(s.value) {
                let dur = s.endDate.timeIntervalSince(s.startDate)
                guard dur > 0, dur <= 16 * 3600 else { continue }
                sleepSec[DayKey.wakeDay(sleepStart: s.startDate), default: 0] += dur
            }
            for (k, sec) in sleepSec { upsert(k) { $0.sleepHours = sec / 3600 } }
        }

        // 静息心率 / HRV:当天取均值
        await averageQuantity(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), since: start) { k, v in upsert(k) { $0.restingHR = v } }
        await averageQuantity(.heartRateVariabilitySDNN, unit: HKUnit.secondUnit(with: .milli), since: start) { k, v in upsert(k) { $0.hrv = v } }
        // 步数:当天求和
        await sumQuantity(.stepCount, unit: .count(), since: start) { k, v in upsert(k) { $0.steps = Int(v) } }

        return byDate.values.sorted { $0.date < $1.date }
    }

    // MARK: 私有

    static func isAsleep(_ value: Int) -> Bool {
        if #available(iOS 16.0, watchOS 9.0, *) {
            return [HKCategoryValueSleepAnalysis.asleepCore,
                    .asleepDeep, .asleepREM, .asleepUnspecified].map(\.rawValue).contains(value)
        }
        return value == HKCategoryValueSleepAnalysis.asleep.rawValue
    }

    private func query(_ type: HKSampleType, since: Date) async -> [HKSample] {
        await withCheckedContinuation { cont in
            let pred = HKQuery.predicateForSamples(withStart: since, end: Date())
            let q = HKSampleQuery(sampleType: type, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                cont.resume(returning: samples ?? [])
            }
            store.execute(q)
        }
    }

    private func averageQuantity(_ id: HKQuantityTypeIdentifier, unit: HKUnit, since: Date, into: (String, Double) -> Void) async {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return }
        let samples = await query(type, since: since) as? [HKQuantitySample] ?? []
        var acc: [String: (sum: Double, n: Int)] = [:]
        for s in samples {
            let k = DayKey.of(s.startDate)
            let v = s.quantity.doubleValue(for: unit)
            let cur = acc[k] ?? (0, 0); acc[k] = (cur.sum + v, cur.n + 1)
        }
        for (k, c) in acc where c.n > 0 { into(k, c.sum / Double(c.n)) }
    }

    private func sumQuantity(_ id: HKQuantityTypeIdentifier, unit: HKUnit, since: Date, into: (String, Double) -> Void) async {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return }
        let samples = await query(type, since: since) as? [HKQuantitySample] ?? []
        var acc: [String: Double] = [:]
        for s in samples { acc[DayKey.of(s.startDate), default: 0] += s.quantity.doubleValue(for: unit) }
        for (k, v) in acc { into(k, v) }
    }
}
