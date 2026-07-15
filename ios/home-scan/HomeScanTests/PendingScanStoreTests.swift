import XCTest
@testable import HomeScan

/// 扫描落盘与恢复:save → load → restore 一圈,照片/结构/清理都不走样。
final class PendingScanStoreTests: XCTestCase {
    override func tearDown() {
        PendingScanStore.clear()
        super.tearDown()
    }

    func testSaveLoadRestoreRoundtrip() throws {
        let projection = PlanProjector.projectScene(MockScan.scene(), scanId: "t", nameZh: "测试")
        var project = projection.project

        // 两个假机位,一个有照片一个没有(下标对齐语义)
        let tmp = FileManager.default.temporaryDirectory
        let photo = tmp.appendingPathComponent("pending-test-vp.jpg")
        try Data([0xFF, 0xD8, 0xFF, 0x00]).write(to: photo)
        let vp = HomeOSProject.Viewpoint(id: "vp-t1", x: 0, y: 0, heading: 0, fovDeg: 60)
        var vp2 = vp
        vp2.id = "vp-t2"
        project.viewpoints = [vp, vp2]

        let scanId = UUID()
        try PendingScanStore.save(
            scanId: scanId,
            project: project,
            photoFiles: [photo, nil],
            objectPhotoFiles: ["pl-1": [.init(url: photo, azimuthDeg: 123.4)]],
            structureJSON: Data("structure".utf8),
            modelFileURL: nil
        )

        let m = try XCTUnwrap(PendingScanStore.load(), "落盘后应能读回")
        XCTAssertEqual(m.scanId, scanId)
        XCTAssertEqual(m.project.placements.count, project.placements.count)
        XCTAssertEqual(m.photoNames.count, 2)
        XCTAssertNotNil(m.photoNames[0])
        XCTAssertNil(m.photoNames[1], "无照片机位保持 nil,下标不错位")

        let r = PendingScanStore.restore(m)
        XCTAssertEqual(r.photoFiles.count, 2)
        let restoredPhoto = try XCTUnwrap(r.photoFiles[0])
        XCTAssertEqual(try Data(contentsOf: restoredPhoto).count, 4, "照片内容是拷贝不是引用 temp")
        XCTAssertTrue(restoredPhoto.path.contains("pending-scan"), "恢复用落盘副本,不指望 temp 还活着")
        XCTAssertEqual(r.objectPhotoFiles["pl-1"]?.count, 1)
        XCTAssertEqual(r.objectPhotoFiles["pl-1"]?.first?.azimuthDeg, 123.4)
        XCTAssertEqual(r.structureJSON, Data("structure".utf8))
        XCTAssertNil(r.modelFileURL)

        PendingScanStore.clear()
        XCTAssertNil(PendingScanStore.load(), "清理后不再有未传扫描")
    }

    func testNewSaveReplacesOld() throws {
        let projection = PlanProjector.projectScene(MockScan.scene(), scanId: "t", nameZh: "测试")
        let a = UUID()
        let b = UUID()
        try PendingScanStore.save(
            scanId: a, project: projection.project,
            photoFiles: [], objectPhotoFiles: [:], structureJSON: nil, modelFileURL: nil
        )
        try PendingScanStore.save(
            scanId: b, project: projection.project,
            photoFiles: [], objectPhotoFiles: [:], structureJSON: nil, modelFileURL: nil
        )
        XCTAssertEqual(PendingScanStore.load()?.scanId, b, "只保留最新一次(全量语义)")
    }
}
