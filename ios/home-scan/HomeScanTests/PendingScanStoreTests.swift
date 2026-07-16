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

    func testIncrementalResaveSurvivesTempCleanup() throws {
        // 同一 scanId 二次落盘(预览页改类别):照片源(temp)已被系统清掉
        // 也不丢 —— 盘上副本就是真相,只重写 manifest
        let projection = PlanProjector.projectScene(MockScan.scene(), scanId: "t", nameZh: "测试")
        let tmp = FileManager.default.temporaryDirectory
        let photo = tmp.appendingPathComponent("pending-incr-photo.jpg")
        try Data([0xFF, 0xD8, 0xFF, 0x01, 0x02]).write(to: photo)
        let scanId = UUID()
        try PendingScanStore.save(
            scanId: scanId, project: projection.project,
            photoFiles: [], objectPhotoFiles: ["pl-1": [.init(url: photo, azimuthDeg: 90)]],
            structureJSON: nil, modelFileURL: nil
        )
        try FileManager.default.removeItem(at: photo) // temp 被清

        var edited = projection.project
        edited.meta.nameZh = "改过类别之后"
        try PendingScanStore.save(
            scanId: scanId, project: edited,
            photoFiles: [], objectPhotoFiles: ["pl-1": [.init(url: photo, azimuthDeg: 90)]],
            structureJSON: nil, modelFileURL: nil
        )
        let m = try XCTUnwrap(PendingScanStore.load())
        XCTAssertEqual(m.project.meta.nameZh, "改过类别之后", "manifest 更新了")
        let r = PendingScanStore.restore(m)
        let url = try XCTUnwrap(r.objectPhotoFiles["pl-1"]?.first?.url, "照片没因源丢失而消失")
        XCTAssertEqual(try Data(contentsOf: url).count, 5)
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

    /// 取消一次**新**扫描,不许删掉上一次还没传完的那份。
    ///
    /// 回归锁:cancelScanning() 曾经无条件 clear(),而 startScanning() 根本不碰
    /// 盘上副本 —— 首页挂着没传完的 A、你点开扫描又立刻取消(hasProgress=false,
    /// 连确认都不弹),A 的照片就没了,首页还继续显示「继续」骗你点进一个空壳。
    @MainActor
    func testCancellingFreshScanKeepsEarlierPendingScan() async throws {
        let projection = PlanProjector.projectScene(MockScan.scene(), scanId: "t", nameZh: "测试")
        let older = UUID()
        try PendingScanStore.save(
            scanId: older, project: projection.project,
            photoFiles: [], objectPhotoFiles: [:], structureJSON: nil, modelFileURL: nil
        )

        let model = AppModel()
        model.pendingScan = PendingScanStore.load()
        // 新开一次扫描:scanId 换新,盘上仍是上一次的 older
        model.scanId = UUID()
        model.cancelScanning()
        // 清理判断在后台 Task 里(要先等落盘收尾),让它跑完
        await Task.yield()
        try await Task.sleep(for: .milliseconds(120))

        XCTAssertEqual(
            PendingScanStore.load()?.scanId, older,
            "取消新扫描不该删掉上一次没传完的副本"
        )
        XCTAssertNotNil(model.pendingScan, "首页的「继续」入口要留着 —— 副本还在")
    }

    /// 进了预览页,首页就不该再挂着「继续上传」——那份扫描已经在你眼前了。
    ///
    /// 回归锁:落盘只留最新一次(换 scanId 会整目录清掉重来),所以新扫描一落盘,
    /// 上一次没传完的 A 的照片就没了。这时内存里的 pendingScan 若还是 A,
    /// 它就是个指向已删文件的幽灵。
    @MainActor
    func testEnteringReviewClearsPendingPointer() async throws {
        let older = UUID()
        try PendingScanStore.save(
            scanId: older,
            project: PlanProjector.projectScene(MockScan.scene(), scanId: "t", nameZh: "旧").project,
            photoFiles: [], objectPhotoFiles: [:], structureJSON: nil, modelFileURL: nil
        )
        let model = AppModel()
        model.pendingScan = PendingScanStore.load()
        XCTAssertNotNil(model.pendingScan, "前提:首页此刻确实挂着上一次没传完的")

        // 新扫一次 → 进预览页
        model.scanId = UUID()
        model.applyScene(MockScan.scene())

        XCTAssertEqual(model.route, .reviewing)
        XCTAssertNil(model.pendingScan, "扫描已摊在预览页上,不该再是「待恢复」")
    }

    /// 反面:放弃的就是盘上那一份时,才真清掉(否则会留幽灵)
    @MainActor
    func testCancellingOwnScanClearsItsCopy() async throws {
        let projection = PlanProjector.projectScene(MockScan.scene(), scanId: "t", nameZh: "测试")
        let mine = UUID()
        try PendingScanStore.save(
            scanId: mine, project: projection.project,
            photoFiles: [], objectPhotoFiles: [:], structureJSON: nil, modelFileURL: nil
        )

        let model = AppModel()
        model.pendingScan = PendingScanStore.load()
        model.scanId = mine // 预览页「放弃」:盘上这份就是我这次扫的
        model.cancelScanning()
        await Task.yield()
        try await Task.sleep(for: .milliseconds(120))

        XCTAssertNil(PendingScanStore.load(), "明确放弃自己这次扫描时才清盘")
        XCTAssertNil(model.pendingScan, "首页不该再显示「继续」")
    }
}
