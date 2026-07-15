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

    var roomCount: Int { capturedRooms.count }

    /// ScanView 每一代调用一次;RoomCaptureView 挂共享 ARSession
    @MainActor
    func makeCaptureView() -> RoomCaptureView {
        let view = RoomCaptureView(frame: .zero, arSession: arSession)
        view.captureSession.delegate = self
        view.captureSession.run(configuration: RoomCaptureSession.Configuration())
        captureView = view
        return view
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
        arSession.pause()
    }

    // MARK: - RoomCaptureSessionDelegate

    nonisolated func captureSession(
        _ session: RoomCaptureSession,
        didEndWith data: CapturedRoomData,
        error: (any Error)?
    ) {
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
