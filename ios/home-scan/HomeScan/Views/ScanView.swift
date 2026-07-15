import SwiftUI
import RoomPlan

/// 扫描屏:RoomCaptureView 全屏 + 叠加控制。
/// 流程:逐间扫 →「完成本房间」→「再扫一间」/「全部完成」;随时「拍照」记机位。
struct ScanView: View {
    @Environment(AppModel.self) private var model
    @State private var betweenRooms = false
    @State private var busy = false
    @State private var confirmNoPhotos = false

    var body: some View {
        ZStack {
            RoomCaptureContainer(controller: model.scanController)
                .id(model.scanController.roomGeneration)
                .ignoresSafeArea()

            VStack {
                HStack {
                    Button("取消") { model.cancelScanning() }
                        .buttonStyle(.bordered)
                    Spacer()
                    Text("已扫 \(model.scanController.roomCount) 间 · \(model.poses.count) 张机位")
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
                        Button("继续扫,去拍几张") {
                            model.scanController.startNextRoom()
                            betweenRooms = false
                        }
                        Button("不拍了,直接完成", role: .destructive) { finishAll() }
                    } message: {
                        Text("机位照片会带着精确位置和朝向进 HomeOS,是网页端标注房间状态的底料。建议每个房间拍 2-3 张。")
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
