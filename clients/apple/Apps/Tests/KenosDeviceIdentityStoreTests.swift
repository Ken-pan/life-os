import XCTest
@testable import KenosIOS

final class KenosDeviceIdentityStoreTests: XCTestCase {
    override func setUp() {
        super.setUp()
        KenosDeviceIdentityStore.clearAllForTests()
    }

    override func tearDown() {
        KenosDeviceIdentityStore.clearAllForTests()
        super.tearDown()
    }

    func testEnsureIdentityStableAndSignable() throws {
        let a = try KenosDeviceIdentityStore.ensureIdentity()
        let b = try KenosDeviceIdentityStore.ensureIdentity()
        XCTAssertEqual(a.deviceId, b.deviceId)
        XCTAssertEqual(a.publicKeyBase64, b.publicKeyBase64)
        XCTAssertFalse(a.publicKeyBase64.isEmpty)
        XCTAssertTrue(["mobile", "desktop"].contains(a.deviceClass))
        XCTAssertTrue(["ios", "macos"].contains(a.platform))
        XCTAssertTrue(
            a.keyStorage == .secureEnclave || a.keyStorage == .software,
            "expected SE or software key storage"
        )

        let sig = try KenosDeviceIdentityStore.sign(challenge: "test-challenge-bytes")
        XCTAssertFalse(sig.isEmpty)
        // P-256 IEEE P1363 signature is 64 bytes → 88 base64 chars typical.
        XCTAssertGreaterThanOrEqual(Data(base64Encoded: sig)?.count ?? 0, 64)
    }

    func testPairingFlag() {
        XCTAssertFalse(KenosDeviceIdentityStore.isPaired)
        KenosDeviceIdentityStore.markPaired(rowId: "row-1")
        XCTAssertTrue(KenosDeviceIdentityStore.isPaired)
        XCTAssertEqual(KenosDeviceIdentityStore.pairedRowId, "row-1")
        KenosDeviceIdentityStore.clearPairing()
        XCTAssertFalse(KenosDeviceIdentityStore.isPaired)
    }
}
