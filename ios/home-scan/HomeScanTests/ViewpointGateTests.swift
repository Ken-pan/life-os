import XCTest
@testable import HomeScan

/// 自动机位准入判定单测。
///
/// 这个模块存在的理由就是「站着不动它也不拍」那个卡死:六道门全静默 return,
/// 提示只有一句「站稳就会自动拍」。所以这里的断言重点不是「什么时候拍」,
/// 而是 **拒绝有没有名字** 和 **会不会永久拒绝**。
final class ViewpointGateTests: XCTestCase {
    /// 一切正常、该拍的基线;各用例只改自己关心的那一项
    private func input(
        lux: Double? = 600,
        omega: Double = 0.1,
        inView: Int = 3,
        capturedInRoom: Int = 0,
        secondsInRoom: Double = 5,
        sinceLast: Double = 30,
        nearD: Double? = nil,
        nearDH: Double? = nil
    ) -> ViewpointGate.Input {
        ViewpointGate.Input(
            lux: lux,
            angularVelocity: omega,
            inViewCount: inView,
            capturedInRoom: capturedInRoom,
            secondsInRoom: secondsInRoom,
            secondsSinceLastCapture: sinceLast,
            nearestPoseDistanceM: nearD,
            nearestPoseHeadingDeltaDeg: nearDH
        )
    }

    func testHappyPathCaptures() {
        XCTAssertEqual(ViewpointGate.evaluate(input()), .capture)
    }

    // MARK: - 每一种拒绝都要有名字(HUD 照着说人话)

    func testEachBlockIsNamed() {
        XCTAssertEqual(ViewpointGate.evaluate(input(omega: 2.0)), .wait(.shaky))
        XCTAssertEqual(ViewpointGate.evaluate(input(lux: 100)), .wait(.dark))
        XCTAssertEqual(ViewpointGate.evaluate(input(inView: 0)), .wait(.noFurniture))
        XCTAssertEqual(ViewpointGate.evaluate(input(sinceLast: 1)), .wait(.cooldown))
        XCTAssertEqual(
            ViewpointGate.evaluate(input(capturedInRoom: 4)),
            .wait(.quotaFull)
        )
        // 站在已拍过的位置/朝向上 —— 这一条正是「我站着不动怎么没反应」的真身
        XCTAssertEqual(
            ViewpointGate.evaluate(input(nearD: 0.3, nearDH: 5)),
            .wait(.notNovel)
        )
    }

    /// 会拦住人的拒绝必须说得出话;短暂/正常的不许打扰
    func testActionableBlocksHaveHintTextAndTransientOnesDont() {
        for block in [ViewpointGate.Block.shaky, .dark, .noFurniture, .notNovel] {
            let text = ViewpointGate.hintText(for: block)
            XCTAssertNotNil(text, "\(block) 拦住了人却说不出原因")
            XCTAssertFalse(text!.isEmpty)
        }
        XCTAssertNil(ViewpointGate.hintText(for: .cooldown), "冷却是短暂的,别打扰")
        XCTAssertNil(ViewpointGate.hintText(for: .quotaFull), "拍够了不是问题")
    }

    // MARK: - 不许有永久拒绝(卡死的根)

    func testStarvingRoomRelaxesNoveltyAndDark() {
        // 小卫生间:挪了半米、转了 20° 已是极限,严格门槛(1m / 40°)还是拦
        let stuck = input(nearD: 0.5, nearDH: 20)
        XCTAssertEqual(ViewpointGate.evaluate(stuck), .wait(.notNovel), "一开始该拦")
        // 等久了就该放宽 —— 否则用户在小房间里物理上做不到「挪 1 米 + 转 40°」,
        // 站到天亮也拍不上,而且无法自救
        var relaxed = stuck
        relaxed.secondsInRoom = ViewpointGate.starveRelaxGatesS + 1
        XCTAssertEqual(ViewpointGate.evaluate(relaxed), .capture, "饿着的房间该放宽视角新度")

        // 但「原地一动没动」不在放宽的范围内:那是真·重复,
        // 该由 starveForceS 那道兜底接管(见 testStarvingRoomEventuallyForces…)
        var identical = input(nearD: 0.05, nearDH: 1)
        identical.secondsInRoom = ViewpointGate.starveRelaxGatesS + 1
        XCTAssertEqual(ViewpointGate.evaluate(identical), .wait(.notNovel))

        // 暗房间同理:先拦,等久了一张偏暗的也比没有强
        var dim = input(lux: 200)
        XCTAssertEqual(ViewpointGate.evaluate(dim), .wait(.dark))
        dim.secondsInRoom = ViewpointGate.starveRelaxGatesS + 1
        XCTAssertEqual(ViewpointGate.evaluate(dim), .capture, "暗但等久了,一张偏暗的也比没有强")
    }

    func testEmptyRoomFallsBackAfterWait() {
        // 玄关/走廊一件家具都没有
        var empty = input(inView: 0)
        XCTAssertEqual(ViewpointGate.evaluate(empty), .wait(.noFurniture))
        empty.secondsInRoom = ViewpointGate.starveRelaxFurnitureS + 1
        XCTAssertEqual(ViewpointGate.evaluate(empty), .capture, "空房也得留下环境照")
    }

    func testStarvingRoomEventuallyForcesCaptureNoMatterWhat() {
        // 又暗、又没家具、又跟已有机位重样 —— 每一道门都拦
        var hopeless = input(lux: 30, inView: 0, nearD: 0.05, nearDH: 1)
        XCTAssertNotEqual(ViewpointGate.evaluate(hopeless), .capture)
        hopeless.secondsInRoom = ViewpointGate.starveForceS + 1
        XCTAssertEqual(
            ViewpointGate.evaluate(hopeless),
            .capture,
            "这间 40 秒还是零照片 —— 没有照片比不完美的照片糟得多"
        )
    }

    func testForcedCaptureStillRefusesBlur() {
        // 兜底放行也不能放糊的:糊掉的整屋照片没得裁、没得救,
        // 而且「手在晃」是用户一秒就能自己解决的事
        let blurry = input(omega: 3.0, secondsInRoom: ViewpointGate.starveForceS + 10)
        XCTAssertEqual(ViewpointGate.evaluate(blurry), .wait(.shaky))
    }

    func testSecondPhotoNeverGetsStarveRelaxation() {
        // 已经有一张了就不算饿:放宽只为「零照片」兜底,
        // 否则同一个角落会被连拍 4 张塞满配额
        var hasOne = input(inView: 3, capturedInRoom: 1, nearD: 0.1, nearDH: 1)
        hasOne.secondsInRoom = ViewpointGate.starveForceS + 30
        XCTAssertEqual(ViewpointGate.evaluate(hasOne), .wait(.notNovel))
    }

    // MARK: - 配额按房间面积伸缩(650 sqft 单间只给 4 张的真机教训)

    func testQuotaScalesWithRoomArea() {
        XCTAssertEqual(ViewpointGate.quota(roomAreaSqFt: nil), 4, "面积未知退旧值 4")
        XCTAssertEqual(ViewpointGate.quota(roomAreaSqFt: 0), 4, "0 面积当未知")
        XCTAssertEqual(ViewpointGate.quota(roomAreaSqFt: -10), 4, "负数当未知")
        XCTAssertEqual(ViewpointGate.quota(roomAreaSqFt: 40), 2, "小卫生间下限 2")
        XCTAssertEqual(ViewpointGate.quota(roomAreaSqFt: 80), 2, "80 sqft ≈ 1 张,被下限抬到 2")
        XCTAssertEqual(ViewpointGate.quota(roomAreaSqFt: 160), 2)
        XCTAssertEqual(ViewpointGate.quota(roomAreaSqFt: 320), 4)
        XCTAssertEqual(ViewpointGate.quota(roomAreaSqFt: 650), 6, "650 sqft 开放单间给到上限")
        XCTAssertEqual(ViewpointGate.quota(roomAreaSqFt: 5000), 6, "再大也封顶,别拍成监控")
    }

    func testQuotaGateUsesRoomArea() {
        // 650 sqft 开放单间:真机就是在「第 4 张就 quotaFull」上栽的 —— 现在得继续拍
        var big = input(capturedInRoom: 4)
        big.roomAreaSqFt = 650
        XCTAssertEqual(ViewpointGate.evaluate(big), .capture, "大房 4 张远远不够")
        big.capturedInRoom = 6
        XCTAssertEqual(ViewpointGate.evaluate(big), .wait(.quotaFull))

        // 小卫生间 2 张就该收手
        var small = input(capturedInRoom: 2)
        small.roomAreaSqFt = 45
        XCTAssertEqual(ViewpointGate.evaluate(small), .wait(.quotaFull))

        // 面积未知(RoomPlan 还没认出地板)= 完全的旧行为
        XCTAssertEqual(ViewpointGate.evaluate(input(capturedInRoom: 4)), .wait(.quotaFull))
        XCTAssertEqual(ViewpointGate.evaluate(input(capturedInRoom: 3)), .capture)
    }

    func testMissingLightEstimateDoesNotBlock() {
        // 拿不到光估计 ≠ 暗。因为读不到数就拒拍,是最冤的卡死
        XCTAssertEqual(ViewpointGate.evaluate(input(lux: nil)), .capture)
    }

    func testNoExistingPosesMeansAlwaysNovel() {
        // 第一张:没有可比的机位,新度门不该拦
        XCTAssertEqual(ViewpointGate.evaluate(input(nearD: nil, nearDH: nil)), .capture)
    }
}
