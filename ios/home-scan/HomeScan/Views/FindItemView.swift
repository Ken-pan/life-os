import SwiftUI
import RealityKit
import ARKit
import simd

/// AR 寻物 —— 搜「东西在哪」,举起手机,箭头带路。
///
/// 流程:搜索(储藏物品 + 家具)→ 选中 → AR 取景 + 对墙环视定位
/// (ARLocateController 用竖直平面走 HomeFrame 配准)→ 定位成功后
/// 实时显示方向箭头、距离与「在 S4 格子柜 · 第 2 层」。
/// 认不出位置时如实引导「再走动走动」,绝不瞎指。
struct FindItemView: View {
    let home: CanonicalHome
    @Environment(\.dismiss) private var dismiss
    @State private var controller = ARLocateController()
    @State private var query = ""
    @State private var target: FindTarget?

    struct FindTarget: Identifiable {
        var id: String
        var title: String
        var subtitle: String
        var homePointM: SIMD2<Double>
    }

    /// 检索空间:柜内物品(带层号)+ 户型家具
    private var targets: [FindTarget] {
        let mPerPx = 0.3048 / home.wallGraph.pxPerFt
        let placementById = Dictionary(uniqueKeysWithValues: home.placements.map { ($0.id, $0) })
        var out: [FindTarget] = []
        for z in home.storageZones ?? [] {
            let pt: SIMD2<Double>? = {
                if let m = z.marker { return SIMD2(m.x * mPerPx, m.y * mPerPx) }
                if let pid = z.placementId, let pl = placementById[pid] {
                    return SIMD2((pl.x + pl.w / 2) * mPerPx, (pl.y + pl.h / 2) * mPerPx)
                }
                return nil
            }()
            guard let pt else { continue }
            for (i, item) in (z.items ?? []).enumerated() {
                let level = item.level.map { " · 第 \($0 + 1) 层" } ?? ""
                out.append(FindTarget(
                    id: "\(z.id)-item-\(i)",
                    title: item.name,
                    subtitle: "\(z.code) \(z.nameZh)\(level)",
                    homePointM: pt
                ))
            }
        }
        for pl in home.placements {
            out.append(FindTarget(
                id: "pl-\(pl.id)",
                title: pl.label,
                subtitle: "家具",
                homePointM: SIMD2((pl.x + pl.w / 2) * mPerPx, (pl.y + pl.h / 2) * mPerPx)
            ))
        }
        return out
    }

    private var filtered: [FindTarget] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return targets }
        return targets.filter { $0.title.localizedCaseInsensitiveContains(q) || $0.subtitle.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        NavigationStack {
            if let target {
                guide(target)
            } else {
                List(filtered) { t in
                    Button {
                        controller.targetHomeM = t.homePointM
                        self.target = t
                        controller.start(home: home)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.title)
                            Text(t.subtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .searchable(text: $query, prompt: "搜物品或家具(如:滤镜 / 格子柜)")
                .navigationTitle("寻找物品")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("关闭") { dismiss() }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func guide(_ t: FindTarget) -> some View {
        ZStack(alignment: .bottom) {
            ARPassthroughView(session: controller.session)
                .ignoresSafeArea()
            TimelineView(.periodic(from: .now, by: 0.3)) { _ in
                VStack(spacing: 10) {
                    if let g = controller.guidance() {
                        Image(systemName: "location.north.fill")
                            .font(.system(size: 44))
                            .rotationEffect(.degrees(g.bearingDeg))
                            .foregroundStyle(.green)
                        if g.distanceM < 0.8 {
                            Text("就在这里:\(t.subtitle)")
                                .font(.headline)
                        } else {
                            Text("\(g.direction) \(String(format: "%.1f", g.distanceM)) 米")
                                .font(.headline.monospacedDigit())
                        }
                        Text("「\(t.title)」· \(t.subtitle)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        ProgressView()
                        Text("对着墙缓慢环视,让我认出你在户型里的位置…")
                            .font(.subheadline)
                        Text("已识别 \(controller.wallCount) 面墙\(controller.registration?.reason.map { " · \($0)" } ?? "")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                .padding()
            }
        }
        .navigationTitle(t.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("返回") {
                    controller.stop()
                    target = nil
                }
            }
        }
        // 寻物过程保持常亮 —— 举着手机走,息屏就断了 AR 会话
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            controller.stop()
        }
    }
}

/// 相机透传(AR 会话由 ARLocateController 持有)
private struct ARPassthroughView: UIViewRepresentable {
    let session: ARSession

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero, cameraMode: .ar, automaticallyConfigureSession: false)
        view.session = session
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {}
}
