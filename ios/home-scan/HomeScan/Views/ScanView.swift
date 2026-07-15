import SwiftUI
import RoomPlan

/// 扫描屏:RoomCaptureView 全屏 + 叠加控制。
/// 流程:逐间扫 →「完成本房间」→「再扫一间」/「全部完成」;随时「拍照」记机位。
struct ScanView: View {
    @Environment(AppModel.self) private var model
    @State private var betweenRooms = false
    @State private var busy = false
    @State private var confirmNoPhotos = false
    @State private var confirmCancel = false

    private var hasProgress: Bool {
        model.scanController.roomCount > 0 || !model.poses.isEmpty
    }

    var body: some View {
        ZStack {
            RoomCaptureContainer(controller: model.scanController)
                .id(model.scanController.roomGeneration)
                .ignoresSafeArea()

            VStack {
                HStack {
                    Button("取消") {
                        // 已扫的房间/照片会被丢掉 —— 必须二次确认
                        // (实测有人误以为数据已丢而点取消,反而真丢了)
                        if hasProgress {
                            confirmCancel = true
                        } else {
                            model.cancelScanning()
                        }
                    }
                    .buttonStyle(.bordered)
                    .confirmationDialog(
                        "丢弃这次扫描?",
                        isPresented: $confirmCancel,
                        titleVisibility: .visible
                    ) {
                        Button("丢弃已扫的 \(model.scanController.roomCount) 间和 \(model.poses.count) 张照片", role: .destructive) {
                            model.cancelScanning()
                        }
                        Button("继续扫描", role: .cancel) {}
                    }
                    Spacer()
                    Text("已扫 \(model.scanController.roomCount) 间 · \(model.poses.count) 张机位 · \(model.scanController.objectShotCount) 件家具照")
                        .font(.footnote)
                        .padding(6)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .padding()

                Spacer()

                if let err = model.scanController.lastError {
                    Text(err)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding(6)
                        .background(.ultraThinMaterial, in: Capsule())
                }

                if betweenRooms {
                    HStack(spacing: 16) {
                        // 房间之间 ARSession 还活着 —— 补拍不需要「再扫一间」,
                        // 在这里直接拍(此前退回去补拍,取景重建像丢了建模,
                        // 吓得人点取消,才真把数据丢了)
                        Button {
                            if let pose = ViewpointCapture.capture(
                                from: model.scanController.arSession
                            ) {
                                model.poses.append(pose)
                            }
                        } label: {
                            Label("拍照", systemImage: "camera.fill")
                        }
                        .buttonStyle(.borderedProminent)

                        Button {
                            model.scanController.startNextRoom()
                            betweenRooms = false
                        } label: {
                            Label("再扫一间", systemImage: "plus.viewfinder")
                        }
                        .buttonStyle(.borderedProminent)

                        Button {
                            if model.poses.isEmpty {
                                confirmNoPhotos = true
                            } else {
                                finishAll()
                            }
                        } label: {
                            if busy {
                                ProgressView()
                            } else {
                                Label("全部完成", systemImage: "checkmark")
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                        .disabled(busy || model.scanController.roomCount == 0)
                    }
                    .padding(.bottom, 32)
                    .alert("还没拍机位照片", isPresented: $confirmNoPhotos) {
                        Button("好,就在这里拍") {}
                        Button("不拍了,直接完成", role: .destructive) { finishAll() }
                    } message: {
                        Text("已扫的 \(model.scanController.roomCount) 间都在,不用退回去 —— 对着想记录的地方按「拍照」即可。照片带着精确位置和朝向进 HomeOS,建议每个房间 2-3 张。")
                    }
                } else {
                    HStack(spacing: 16) {
                        Button {
                            if let pose = ViewpointCapture.capture(
                                from: model.scanController.arSession
                            ) {
                                model.poses.append(pose)
                            }
                        } label: {
                            Label("拍照", systemImage: "camera.fill")
                        }
                        .buttonStyle(.borderedProminent)

                        Button {
                            busy = true
                            Task {
                                await model.scanController.finishRoomAndWait()
                                busy = false
                                betweenRooms = true
                            }
                        } label: {
                            if busy {
                                ProgressView()
                            } else {
                                Label("完成本房间", systemImage: "stop.circle")
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.orange)
                        .disabled(busy)
                    }
                    .padding(.bottom, 32)
                }
            }
        }
    }
}

extension ScanView {
    private func finishAll() {
        busy = true
        Task {
            await model.finishScanning()
            busy = false
        }
    }
}

private struct RoomCaptureContainer: UIViewRepresentable {
    let controller: ScanSessionController

    func makeUIView(context: Context) -> RoomCaptureView {
        controller.makeCaptureView()
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}
