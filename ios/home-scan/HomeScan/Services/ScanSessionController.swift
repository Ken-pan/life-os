import Foundation
import Observation
import ARKit
import RoomPlan

/// 多房间扫描:一个共享 ARSession 贯穿全程(所有房间与拍照位姿同一世界坐标),
/// 每个房间一个 RoomCaptureSession;房间之间 stop(pauseARSession: false) 保持
/// 世界地图不丢。全部扫完 StructureBuilder 合并。
@Observable
final class ScanSessionController: NSObject, RoomCaptureSessionDelegate {
    let arSession = ARSession()

    private(set) var capturedRooms: [CapturedRoom] = []
    private(set) var roomProcessing = false
    var lastError: String?

    /// 递增让 SwiftUI 重建 RoomCaptureView(= 开新一间房)
    private(set) var roomGeneration = 0

    private var captureView: RoomCaptureView?
    private let roomBuilder = RoomBuilder(options: [.beautifyObjects])

    /// 家具自动抓拍:跨房间共用一个(同一 ARSession 同一世界系)
    let shotCapture = ObjectShotCapture()
    /// RoomPlan 实时快照里的物体(didUpdate 喂进来,抓拍定时器消费)
    private var liveObjects: [CapturedRoom.Object] = []
    private var shotTimer: Timer?
    /// HUD 用:已抓到照片的家具件数
    private(set) var objectShotCount = 0

    var roomCount: Int { capturedRooms.count }

    /// ScanView 每一代调用一次;RoomCaptureView 挂共享 ARSession
    @MainActor
    func makeCaptureView() -> RoomCaptureView {
        let view = RoomCaptureView(frame: .zero, arSession: arSession)
        view.captureSession.delegate = self
        view.captureSession.run(configuration: RoomCaptureSession.Configuration())
        captureView = view
        startShotTimer()
        return view
    }

    /// 2Hz 评估当前帧 —— 打分轻(24 次矩阵乘/件),只有明显更好的一眼才真裁图。
    @MainActor
    private func startShotTimer() {
        guard shotTimer == nil else { return }
        let timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self, !self.liveObjects.isEmpty,
                  let frame = self.arSession.currentFrame else { return }
            self.shotCapture.consider(objects: self.liveObjects, frame: frame)
            self.objectShotCount = self.shotCapture.count
        }
        timer.tolerance = 0.15 // 打分不挑时刻,给系统合并唤醒的余地
        shotTimer = timer
    }

    private var pendingCompletion: CheckedContinuation<Void, Never>?

    /// 「完成本房间」:停当前房间(ARSession 不停),等 RoomBuilder 处理完入列。
    @MainActor
    func finishRoomAndWait() async {
        guard captureView != nil else { return }
        await withCheckedContinuation { cont in
            pendingCompletion = cont
            captureView?.captureSession.stop(pauseARSession: false)
        }
    }

    /// 「再扫一间」:上一间已入列后重建采集视图
    @MainActor
    func startNextRoom() {
        roomGeneration += 1
    }

    /// 全部房间 → CapturedStructure
    func mergeAll() async throws -> CapturedStructure {
        let builder = StructureBuilder(options: [.beautifyObjects])
        return try await builder.capturedStructure(from: capturedRooms)
    }

    @MainActor
    func reset() {
        captureView?.captureSession.stop()
        captureView = nil
        capturedRooms = []
        roomGeneration = 0
        lastError = nil
        shotTimer?.invalidate()
        shotTimer = nil
        liveObjects = []
        shotCapture.reset()
        objectShotCount = 0
        arSession.pause()
    }

    // MARK: - RoomCaptureSessionDelegate

    nonisolated func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        let objects = room.objects
        Task { @MainActor in
            self.liveObjects = objects
        }
    }

    nonisolated func captureSession(
        _ session: RoomCaptureSession,
        didEndWith data: CapturedRoomData,
        error: (any Error)?
    ) {
        Task { @MainActor in
            self.liveObjects = []  // 房间收尾,别再对着旧快照抓拍
        }
        if let error {
            Task { @MainActor in
                self.lastError = "本房间扫描失败:\(error.localizedDescription)"
                self.pendingCompletion?.resume()
                self.pendingCompletion = nil
            }
            return
        }
        Task { @MainActor in
            self.roomProcessing = true
            defer {
                self.roomProcessing = false
                self.pendingCompletion?.resume()
                self.pendingCompletion = nil
            }
            do {
                let room = try await self.roomBuilder.capturedRoom(from: data)
                self.capturedRooms.append(room)
            } catch {
                self.lastError = "房间处理失败:\(error.localizedDescription)"
            }
        }
    }
}
