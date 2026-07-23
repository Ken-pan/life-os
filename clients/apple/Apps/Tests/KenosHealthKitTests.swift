import XCTest
@testable import KenosIOS

final class KenosHealthKitTests: XCTestCase {
    func testHealthDayPayloadOmitsNilsAndIncludesExtras() {
        var day = KenosHealthDay(date: "2026-07-21")
        day.sleepHours = 7.25
        day.restingHR = 58
        day.steps = 4200
        day.activeEnergyKcal = 512.4
        day.distanceKm = 3.456
        day.spo2Pct = 97.25
        let p = day.payload
        XCTAssertEqual(p["date"] as? String, "2026-07-21")
        XCTAssertEqual(p["sleepHours"] as? Double, 7.3)
        XCTAssertEqual(p["restingHR"] as? Double, 58)
        XCTAssertEqual(p["steps"] as? Int, 4200)
        XCTAssertNil(p["hrv"])
        XCTAssertEqual(p["activeEnergyKcal"] as? Double, 512)
        XCTAssertEqual(p["distanceKm"] as? Double, 3.46)
        XCTAssertEqual(p["spo2Pct"] as? Double, 97.3)
    }

    func testWakeDayKeyAddsSixHours() {
        let start = Date(timeIntervalSince1970: 1_721_520_000) // fixed instant
        let expected = KenosHealthDayKey.fmt.string(from: start.addingTimeInterval(6 * 3600))
        XCTAssertEqual(KenosHealthDayKey.wakeDay(sleepStart: start), expected)
    }

    func testPreferredMacHostFallsBackToDailyBeta() {
        let host = KenosHealthDelivery.preferredMacHost(override: "  ")
        XCTAssertFalse(host.isEmpty)
        XCTAssertEqual(KenosHealthDelivery.preferredMacHost(override: "10.0.0.2"), "10.0.0.2")
    }

    func testMetricCatalogCoreAlwaysPresent() {
        let core = Set(KenosHealthMetricID.core)
        XCTAssertEqual(core.count, 4)
        XCTAssertTrue(core.contains(.sleep))
        XCTAssertTrue(core.contains(.steps))
        let types = KenosHealthMetricCatalog.objectTypes(for: core)
        XCTAssertGreaterThanOrEqual(types.count, 4)
    }

    func testCoverageDetectsPresentFields() {
        var day = KenosHealthDay(date: "2026-07-21")
        day.sleepHours = 7
        day.steps = 1000
        day.activeEnergyKcal = 400
        let enabled: Set<KenosHealthMetricID> = [.sleep, .steps, .hrv, .activeEnergy]
        let cov = KenosHealthMetricCatalog.coverage(in: [day], enabled: enabled)
        XCTAssertEqual(cov[.sleep], true)
        XCTAssertEqual(cov[.steps], true)
        XCTAssertEqual(cov[.hrv], false)
        XCTAssertEqual(cov[.activeEnergy], true)
    }

    func testDefaultOptionalIncludesActivityRingMetrics() {
        let defaults = Set(KenosHealthMetricID.allCases.filter(\.defaultEnabled))
        XCTAssertTrue(defaults.isSuperset(of: Set(KenosHealthMetricID.core)))
        XCTAssertTrue(defaults.contains(.activeEnergy))
        XCTAssertTrue(defaults.contains(.workouts))
        XCTAssertFalse(defaults.contains(.bodyMass))
        XCTAssertFalse(defaults.contains(.spo2))
    }

    func testHealthInjectionScopedByOrigin() {
        let health = URL(string: "https://health.kenos.space/")!
        let shell = URL(string: "https://www.kenos.space/")!
        let plan = URL(string: "https://plan.kenos.space/")!
        let work = URL(string: "https://www.kenos.space/work")!
        XCTAssertTrue(KenosDomainRegistry.allowsAppleHealthDaysInjection(for: health))
        XCTAssertTrue(KenosDomainRegistry.allowsHealthReadinessInjection(for: health))
        XCTAssertFalse(KenosDomainRegistry.allowsAppleHealthDaysInjection(for: shell))
        XCTAssertTrue(KenosDomainRegistry.allowsHealthReadinessInjection(for: shell))
        XCTAssertFalse(KenosDomainRegistry.allowsAppleHealthDaysInjection(for: plan))
        XCTAssertFalse(KenosDomainRegistry.allowsHealthReadinessInjection(for: plan))
        XCTAssertFalse(KenosDomainRegistry.allowsAppleHealthDaysInjection(for: work))
        XCTAssertFalse(KenosDomainRegistry.allowsHealthReadinessInjection(for: work))
    }

    func testReadinessNativeSummaryStripsVitals() throws {
        let days: [[String: Any]] = [[
            "date": "2026-07-20",
            "sleepHours": 7.2,
            "restingHR": 58,
            "hrv": 45,
            "steps": 8000,
            "activeEnergyKcal": 400,
            "workoutMinutes": 45,
            "workoutCount": 1,
        ]]
        let raw = KenosHealthReadinessNative.summaryJSON(
            days: days,
            now: Date(timeIntervalSince1970: 1_753_120_000),
            source: "healthkit"
        )
        XCTAssertNotEqual(raw, "null")
        let data = try XCTUnwrap(raw.data(using: .utf8))
        let obj = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(obj["version"] as? Int, 1)
        XCTAssertNotNil(obj["focusCapacity"] as? String)
        XCTAssertNil(obj["hrv"])
        XCTAssertNil(obj["sleepHours"])
        XCTAssertNil(obj["steps"])
        let blob = raw.lowercased()
        XCTAssertFalse(blob.contains("sleephours"))
        XCTAssertFalse(blob.contains("\"hrv\""))
        XCTAssertFalse(blob.contains("\"steps\""))
    }
}
