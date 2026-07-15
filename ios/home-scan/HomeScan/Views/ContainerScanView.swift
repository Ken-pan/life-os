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
    /// 已有柜内数据的柜子(placementId → payload)—— 标「已扫」+ 尺寸摘要
    @State private var scanned: [String: ContainerGeometry.Payload] = [:]

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
                                        if let done = scanned[pl.id] {
                                            // 已扫:内腔摘要,一眼看出还剩哪些没扫
                                            Text("已扫:内 \(dimsCm(done.interiorIn)) · \(done.compartments.count) 层")
                                                .font(.caption)
                                                .foregroundStyle(.teal)
                                        } else {
                                            Text("外部 \(cm(pl.w)) × \(cm(pl.h)) cm · 未扫内部")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()
                                    Text(scanned[pl.id] == nil ? "去扫" : "重测")
                                        .font(.caption)
                                        .foregroundStyle(scanned[pl.id] == nil ? .blue : .secondary)
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
            .task { await load() }
            .fullScreenCover(item: $target, onDismiss: {
                // 扫完回来刷新「已扫」标记(上传成功后摘要立刻可见)
                Task { scanned = (try? await model.supabase.containerPayloads(scanId: scan.id)) ?? scanned }
            }) { pl in
                ContainerScanView(scanId: scan.id, placement: pl)
            }
        }
    }

    private func load() async {
        do {
            // 家具清单是硬依赖;已扫标记拉不到不挡路(只是少了摘要)
            placements = try await model.supabase.storagePlacements(scanId: scan.id)
            scanned = (try? await model.supabase.containerPayloads(scanId: scan.id)) ?? [:]
        } catch {
            loadError = error.localizedDescription
        }
    }

    /// plan px → cm(3 px = 1 英寸)
    private func cm(_ px: Double) -> String {
        String(format: "%.0f", px / 3 * 2.54)
    }

    /// 英寸三维 → 「80×35×190cm」
    private func dimsCm(_ d: ContainerGeometry.Payload.Dims) -> String {
        let c = { (v: Double) in String(format: "%.0f", v * 2.54) }
        return "\(c(d.w))×\(c(d.d))×\(c(d.h))cm"
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
    /// 确认页微调值(cm)—— 卷尺量出偏差时不用重测;实测原值仍随 payload 保留
    @State private var adjW: Double = 0
    @State private var adjD: Double = 0
    @State private var adjH: Double = 0
    @State private var adjSeeded = false

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
        VStack(spacing: 6) {
            Label(
                stepPrefix + controller.step.instruction
                    .replacingOccurrences(of: "**", with: ""),
                systemImage: controller.step == .photoFront || controller.step == .photoSide
                    ? "camera.viewfinder" : "hand.point.up.left"
            )
            .font(.footnote)
            .padding(8)
            .background(.ultraThinMaterial, in: Capsule())

            // 边点边出数:点歪了(比如 3cm 的「内宽」)当场看见,不用等确认页
            if let dims = liveDimsText {
                Text(dims)
                    .font(.caption.monospacedDigit())
                    .padding(6)
                    .background(.ultraThinMaterial, in: Capsule())
            }
        }
        .padding(.bottom, 4)
    }

    /// 打点步显示「第 N/6 点」
    private var stepPrefix: String {
        let i = controller.step.rawValue
        return i <= ContainerScanController.Step.front.rawValue ? "第 \(i + 1)/6 点:" : ""
    }

    private var liveDimsText: String? {
        let d = controller.partialDims
        var parts: [String] = []
        if let w = d.widthM { parts.append("内宽 \(Int((w * 100).rounded()))") }
        if let dp = d.depthM { parts.append("内深 \(Int((dp * 100).rounded()))") }
        if let h = d.heightM { parts.append("内高 \(Int((h * 100).rounded()))") }
        guard !parts.isEmpty else { return nil }
        return parts.joined(separator: " · ") + " cm"
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
                Text("内腔实测(可微调)").font(.headline)
                // 卷尺核对出小偏差直接在这里改;实测原值仍随 payload 上传
                adjustRow("内宽", value: $adjW, measured: box.widthM)
                adjustRow("内深", value: $adjD, measured: box.depthM)
                adjustRow("内高", value: $adjH, measured: box.heightM)

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
                Text("容积约 \(String(format: "%.0f", adjW * adjD * adjH / 1000)) 升")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if !controller.photoURLs.isEmpty {
                    HStack(spacing: 8) {
                        ForEach(controller.photoURLs, id: \.self) { url in
                            if let img = UIImage(contentsOfFile: url.path) {
                                Image(uiImage: img)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 56, height: 74)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                }
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
        .onAppear { seedAdjust() }
        .onDisappear { adjSeeded = false } // 重新测量后回来,微调值重播新实测
    }

    /// 一维的微调行:显示当前值 + stepper;偏离实测时标出实测原值
    private func adjustRow(
        _ name: String,
        value: Binding<Double>,
        measured: Double
    ) -> some View {
        HStack {
            Text(name)
            Text("\(Int(value.wrappedValue.rounded())) cm")
                .monospacedDigit()
                .frame(minWidth: 56, alignment: .trailing)
            if abs(value.wrappedValue - measured * 100) > 0.5 {
                Text("(实测 \(Int((measured * 100).rounded())))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Stepper("", value: value, in: 1...350, step: 1)
                .labelsHidden()
        }
        .font(.subheadline)
    }

    private func seedAdjust() {
        guard !adjSeeded, controller.step == .confirm, let box = controller.box else { return }
        adjW = (box.widthM * 100).rounded()
        adjD = (box.depthM * 100).rounded()
        adjH = (box.heightM * 100).rounded()
        adjSeeded = true
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
            shelfYs: controller.shelfYs,
            adjustedM: (w: adjW / 100, d: adjD / 100, h: adjH / 100)
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
