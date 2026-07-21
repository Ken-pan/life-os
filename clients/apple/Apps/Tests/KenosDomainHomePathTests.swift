import XCTest
#if canImport(UIKit)
@testable import KenosIOS
#endif

#if os(iOS)
final class KenosDomainHomePathTests: XCTestCase {
    func testPlanHomeAndPeerTabs() {
        XCTAssertTrue(KenosDomainRegistry.isDomainHomePath("/", domainId: "plan"))
        XCTAssertTrue(KenosDomainRegistry.isDomainHomePath("/today", domainId: "plan"))
        XCTAssertTrue(KenosDomainRegistry.isDomainHomePath("/triage", domainId: "plan"))
        XCTAssertFalse(KenosDomainRegistry.isDomainHomePath("/calendar", domainId: "plan"))
        XCTAssertFalse(KenosDomainRegistry.isDomainHomePath("/inbox", domainId: "plan"))
        XCTAssertEqual(
            KenosDomainRegistry.normalizeContinuityPath("/schedule", domainId: "plan"),
            "/calendar"
        )
    }

    func testTrainingHomeVersusProgram() {
        XCTAssertTrue(KenosDomainRegistry.isDomainHomePath("/", domainId: "training"))
        XCTAssertFalse(KenosDomainRegistry.isDomainHomePath("/program", domainId: "training"))
        XCTAssertFalse(KenosDomainRegistry.isDomainHomePath("/discover", domainId: "training"))
        XCTAssertEqual(
            KenosDomainRegistry.normalizeContinuityPath("/day/push", domainId: "training"),
            "/program"
        )
    }

    func testMoneyAndLibraryHomes() {
        XCTAssertTrue(KenosDomainRegistry.isDomainHomePath("/home/today", domainId: "money"))
        XCTAssertFalse(KenosDomainRegistry.isDomainHomePath("/accounts", domainId: "money"))
        // Library capsule home is Inbox (`/`); `/library` is the second tab.
        XCTAssertTrue(KenosDomainRegistry.isDomainHomePath("/", domainId: "library"))
        XCTAssertFalse(KenosDomainRegistry.isDomainHomePath("/library", domainId: "library"))
    }

    func testPrimaryDockPathMatchesFirstCapsule() {
        XCTAssertEqual(KenosDomainRegistry.primaryDockPath(for: "plan"), "/")
        XCTAssertEqual(KenosDomainRegistry.primaryDockPath(for: "money"), "/home/today")
        XCTAssertEqual(KenosDomainRegistry.primaryDockPath(for: "work"), "/work")
        XCTAssertEqual(KenosDomainRegistry.primaryDockPath(for: "home"), "/plan")
    }

    func testShelfLabelsAvoidGenericHomeOnDomainLanding() {
        XCTAssertEqual(KenosSpaceShelfLabels.homeDestination(for: "plan"), "Tasks")
        XCTAssertEqual(KenosSpaceShelfLabels.homeDestination(for: "training"), "Today")
        XCTAssertEqual(KenosSpaceShelfLabels.homeDestination(for: "music"), "Library")
        XCTAssertEqual(KenosSpaceShelfLabels.homeDestination(for: "money"), "Overview")

        let planHome = URL(string: "https://planner.kenos.space/")
        XCTAssertEqual(
            KenosSpaceShelfLabels.destinationLabel(for: planHome, spaceId: "plan"),
            "Tasks"
        )
        XCTAssertEqual(
            KenosSpaceShelfLabels.destinationLabel(
                for: URL(string: "https://planner.kenos.space/calendar"),
                spaceId: "plan"
            ),
            "Calendar"
        )
        XCTAssertEqual(
            KenosSpaceShelfLabels.currentSubtitle(
                spaceId: "plan",
                url: planHome,
                resumeSubtitle: "Home",
                spaceTitle: "Plan",
                catalogSubtitle: "Tasks and schedule"
            ),
            "Tasks"
        )
        XCTAssertEqual(
            KenosSpaceShelfLabels.currentSubtitle(
                spaceId: "training",
                url: URL(string: "https://fitness.kenos.space/"),
                resumeSubtitle: "Chest",
                spaceTitle: "Training",
                catalogSubtitle: "Fitness workouts"
            ),
            "Today · Chest"
        )
    }
}
#endif
