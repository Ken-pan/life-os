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

            VStack(spacing: 0) {
                // 同排的玻璃必须共用一个采样域 —— 玻璃采样不到玻璃,不包容器的话
                // 退出按钮和右边那颗标题胶囊会各自采背景、长得不一样,还各跑一遍
                // 背板采样。和扫描页顶栏同一个道理。
                GlassEffectContainer(spacing: HS.Space.tight) {
                    HStack {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.body.weight(.semibold))
                                .hsBigHit()
                        }
                        .buttonStyle(.glass)
                        .hsLabel("退出柜内测量")
                        Spacer()
                        Text(placement.label)
                            .fontWeight(.semibold)
                            .hsCapsule()
                            .hsLabel("正在测量 \(placement.label)")
                    }
                }
                .padding(.horizontal, HS.Space.base)
                .padding(.top, HS.Space.tight)

                Spacer()

                // 一次一条,和扫描页同一套规矩:出错了压倒指令 ——
                // 「没点到面」的时候再念第几步的操作说明没有意义,先把错处理掉
                if let err = controller.lastError {
                    // 只染图标,文字走默认(primary)—— 和扫描页的引导横幅同一套。
                    // 这条浮在**实时相机画面**上,背后可能是白墙也可能是黑柜子:
                    // 任何写死的颜色都赌不赢。玻璃 + primary 才是有保证的组合
                    // (primary 跟着外观走,玻璃负责压出可读的背板)。
                    // 这里也不能用 warnText —— 暗橙碰上暗柜内是更糟的组合。
                    Label {
                        Text(err)
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(HS.warn)
                    }
                    .labelStyle(.hsIconText)
                    .font(.callout.weight(.medium))
                    .padding(HS.Space.snug)
                        .glassEffect(.regular, in: .rect(cornerRadius: 18))
                        .padding(.horizontal, HS.Space.base)
                        .padding(.bottom, HS.Space.tight)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                } else if controller.step != .confirm {
                    instructionHUD
                }

                if controller.step == .confirm {
                    confirmPanel
                } else {
                    controls
                        .padding(.bottom, HS.Space.loose)
                }
            }
            .animation(.snappy(duration: 0.22), value: controller.lastError)
            .animation(.snappy(duration: 0.22), value: controller.step)
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            controller.stop()
        }
    }

    private var instructionHUD: some View {
        VStack(spacing: HS.Space.tight) {
            // 指令是长句(「点柜子内腔的左内壁…」),用 Capsule 装的话大字号下
            // 会被压成一条细长面条 —— 换成圆角矩形 + 图标独立成列(hsIconText)
            Label(
                stepPrefix + controller.step.instruction
                    .replacingOccurrences(of: "**", with: ""),
                systemImage: controller.step == .photoFront || controller.step == .photoSide
                    ? "camera.viewfinder" : "hand.point.up.left"
            )
            .labelStyle(.hsIconText)
            .font(.callout.weight(.medium))
            .padding(HS.Space.snug)
            .glassEffect(.regular, in: .rect(cornerRadius: 18))
            .accessibilityAddTraits(.updatesFrequently)

            // 边点边出数:点歪了(比如 3cm 的「内宽」)当场看见,不用等确认页
            if let dims = liveDimsText {
                Text(dims)
                    .font(.caption.monospacedDigit())
                    .hsCapsule()
                    .hsLabel("当前实测 \(dims)")
            }
        }
        .padding(.horizontal, HS.Space.base)
        .padding(.bottom, HS.Space.tight)
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
        GlassEffectContainer(spacing: HS.Space.tight) {
            HStack(spacing: HS.Space.tight) {
                Button {
                    controller.undoTap()
                } label: {
                    Label("撤销", systemImage: "arrow.uturn.backward")
                        .hsBigHit()
                        .padding(.horizontal, HS.Space.hair)
                }
                .buttonStyle(.glass)
                .disabled(controller.step == .left && controller.taps.left == nil)
                .hsLabel("撤销上一个点")

                switch controller.step {
                case .shelves:
                    Button {
                        controller.finishShelves()
                    } label: {
                        Label("完成层板(\(shelfCount) 块)", systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                            .hsBigHit()
                    }
                    .buttonStyle(.glassProminent)
                    .hsLabel("完成层板,已点 \(shelfCount) 块")
                case .photoFront, .photoSide:
                    Button {
                        controller.capturePhoto()
                    } label: {
                        Label("拍照", systemImage: "camera.fill")
                            .frame(maxWidth: .infinity)
                            .hsBigHit()
                    }
                    .buttonStyle(.glassProminent)
                    .hsLabel("拍这一面的照片")
                default:
                    EmptyView()
                }
            }
        }
        .padding(.horizontal, HS.Space.base)
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
                    // 这块浮在相机上(hsPanel 玻璃),背后颜色不可控 —— 只染图标,
                    // 文字交给 primary + 玻璃背板,和本屏其它提示同一套
                    Label {
                        Text(uploadError)
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(HS.danger)
                    }
                    .labelStyle(.hsIconText)
                    .font(.footnote)
                }
                // ⚠️ 这两个按钮**不能**用 .glass —— 它们坐在 hsPanel 这块玻璃里面,
                // 玻璃叠玻璃是 HIG 明令禁止的:内层玻璃折射的是外层玻璃,不是背后的
                // 相机画面,出来是一层浑的、还把面板边缘搅乱。
                // Apple 自己也是这么分的:sheet/面板拿玻璃,里面的按钮用常规实心。
                // 玻璃只属于**最外面那一层**。
                HStack(spacing: HS.Space.tight) {
                    Button {
                        controller.restart()
                    } label: {
                        Label("重新测量", systemImage: "arrow.counterclockwise")
                            .hsBigHit()
                            .padding(.horizontal, HS.Space.hair)
                    }
                    .buttonStyle(.bordered)
                    .hsLabel("重新测量", hint: "丢掉这次的点,从头再量")

                    Button {
                        upload()
                    } label: {
                        Label("上传", systemImage: "icloud.and.arrow.up")
                            .frame(maxWidth: .infinity)
                            .hsBigHit()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(controller.box == nil)
                    .hsLabel("上传柜内实测")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .hsPanel()
        .padding(HS.Space.base)
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
