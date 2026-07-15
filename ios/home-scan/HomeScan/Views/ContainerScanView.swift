import SwiftUI
import ARKit
import RealityKit
import UIKit

extension HomeOSProject.Placement: Identifiable {}

/// 柜内扫描入口:先挑这次扫描里的哪个柜子,再进 AR 引导测量。
struct ContainerPickView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let scan: SupabaseService.ScanRow

    @State private var placements: [HomeOSProject.Placement]?
    @State private var loadError: String?
    @State private var target: HomeOSProject.Placement?

    var body: some View {
        NavigationStack {
            Group {
                if let loadError {
                    ContentUnavailableView(
                        "拉取失败",
                        systemImage: "wifi.exclamationmark",
                        description: Text(loadError)
                    )
                } else if let placements {
                    if placements.isEmpty {
                        ContentUnavailableView(
                            "这次扫描里没有柜类家具",
                            systemImage: "archivebox",
                            description: Text("柜内扫描要挂在柜/架/衣柜上;先在网页端确认家具类别,或重扫一次。")
                        )
                    } else {
                        List(placements) { pl in
                            Button {
                                target = pl
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(pl.label)
                                        Text("外部 \(cm(pl.w)) × \(cm(pl.h)) cm")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .foregroundStyle(.tertiary)
                                }
                            }
                            .tint(.primary)
                        }
                    }
                } else {
                    ProgressView("拉取家具清单…")
                }
            }
            .navigationTitle("柜内扫描")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("关闭") { dismiss() }
                }
            }
            .task {
                do {
                    placements = try await model.supabase.storagePlacements(scanId: scan.id)
                } catch {
                    loadError = error.localizedDescription
                }
            }
            .fullScreenCover(item: $target) { pl in
                ContainerScanView(scanId: scan.id, placement: pl)
            }
        }
    }

    /// plan px → cm(3 px = 1 英寸)
    private func cm(_ px: Double) -> String {
        String(format: "%.0f", px / 3 * 2.54)
    }
}

/// AR 引导测量:六点拟合内腔 → 层板 → 两张证据照 → 确认上传。
struct ContainerScanView: View {
    @Environment(\.dismiss) private var dismiss
    let scanId: UUID
    let placement: HomeOSProject.Placement

    @State private var controller = ContainerScanController()
    @State private var uploading = false
    @State private var uploadStatus = ""
    @State private var uploadError: String?

    private var arSupported: Bool {
        ARWorldTrackingConfiguration.isSupported
    }

    var body: some View {
        ZStack {
            if arSupported {
                ContainerARContainer(controller: controller)
                    .ignoresSafeArea()
                    .onTapGesture(coordinateSpace: .local) { point in
                        controller.handleTap(at: point)
                    }
            } else {
                Color.black.ignoresSafeArea()
                VStack(spacing: 12) {
                    Text("此设备没有 AR 相机")
                        .foregroundStyle(.white)
                    #if DEBUG
                    Button("模拟测量(联调)") {
                        controller.loadMockMeasurement()
                    }
                    .buttonStyle(.borderedProminent)
                    #endif
                }
            }

            VStack {
                HStack {
                    Button("取消") { dismiss() }
                        .buttonStyle(.bordered)
                    Spacer()
                    Text(placement.label)
                        .font(.footnote.bold())
                        .padding(6)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .padding()

                Spacer()

                if controller.step != .confirm {
                    instructionHUD
                }

                if let err = controller.lastError {
                    Text(err)
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .padding(6)
                        .background(.ultraThinMaterial, in: Capsule())
                }

                if controller.step == .confirm {
                    confirmPanel
                } else {
                    controls
                        .padding(.bottom, 32)
                }
            }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            controller.stop()
        }
    }

    private var instructionHUD: some View {
        Label(
            controller.step.instruction
                .replacingOccurrences(of: "**", with: ""),
            systemImage: controller.step == .photoFront || controller.step == .photoSide
                ? "camera.viewfinder" : "hand.point.up.left"
        )
        .font(.footnote)
        .padding(8)
        .background(.ultraThinMaterial, in: Capsule())
        .padding(.bottom, 4)
    }

    @ViewBuilder
    private var controls: some View {
        HStack(spacing: 16) {
            Button {
                controller.undoTap()
            } label: {
                Label("撤销", systemImage: "arrow.uturn.backward")
            }
            .buttonStyle(.bordered)
            .disabled(controller.step == .left && controller.taps.left == nil)

            switch controller.step {
            case .shelves:
                Button {
                    controller.finishShelves()
                } label: {
                    Label("完成层板(\(shelfCount) 块)", systemImage: "checkmark")
                }
                .buttonStyle(.borderedProminent)
            case .photoFront, .photoSide:
                Button {
                    controller.capturePhoto()
                } label: {
                    Label("拍照", systemImage: "camera.fill")
                }
                .buttonStyle(.borderedProminent)
            default:
                EmptyView()
            }
        }
    }

    private var shelfCount: Int {
        controller.shelfYs.count
    }

    private var confirmPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let box = controller.box {
                Text("内腔实测").font(.headline)
                Text("内宽 \(cmText(box.widthM)) · 内深 \(cmText(box.depthM)) · 内高 \(cmText(box.heightM))")
                    .monospacedDigit()
                let levels = ContainerGeometry.compartments(
                    shelfYs: controller.shelfYs, box: box
                )
                Text(levels.count > 1
                     ? "层板 \(levels.count - 1) 块 → \(levels.count) 层"
                     : "无层板 · 整腔 1 层")
                    .font(.subheadline)
                ForEach(levels, id: \.level) { lv in
                    Text("第 \(lv.level + 1) 层(自下而上):高 \(cmText(lv.heightM))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                Text("容积约 \(String(format: "%.0f", box.widthM * box.depthM * box.heightM * 1000)) 升 · 照片 \(controller.photoURLs.count) 张")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if uploading {
                HStack {
                    ProgressView()
                    Text(uploadStatus).font(.footnote)
                }
            } else {
                if let uploadError {
                    Text(uploadError).font(.footnote).foregroundStyle(.red)
                }
                HStack(spacing: 12) {
                    Button {
                        controller.restart()
                    } label: {
                        Label("重新测量", systemImage: "arrow.counterclockwise")
                    }
                    .buttonStyle(.bordered)

                    Button {
                        upload()
                    } label: {
                        Label("上传", systemImage: "icloud.and.arrow.up")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(controller.box == nil)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .padding()
    }

    private func cmText(_ m: Double) -> String {
        String(format: "%.0f cm", m * 100)
    }

    private func upload() {
        guard let box = controller.box else { return }
        uploading = true
        uploadError = nil
        let payload = ContainerGeometry.payload(
            scanId: scanId.uuidString.lowercased(),
            placementId: placement.id,
            placementLabel: placement.label,
            capturedAt: ISO8601DateFormatter().string(from: Date()),
            device: "\(UIDevice.current.name) / iOS \(UIDevice.current.systemVersion)",
            box: box,
            shelfYs: controller.shelfYs
        )
        let photos = controller.photoURLs
        Task {
            do {
                try await SupabaseService.shared.uploadContainer(
                    scanId: scanId,
                    payload: payload,
                    photoFiles: photos,
                    onProgress: { msg in uploadStatus = msg }
                )
                uploading = false
                dismiss()
            } catch {
                uploading = false
                uploadError = "上传失败:\(error.localizedDescription)"
            }
        }
    }
}

private struct ContainerARContainer: UIViewRepresentable {
    let controller: ContainerScanController

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        controller.attach(view)
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {}
}
