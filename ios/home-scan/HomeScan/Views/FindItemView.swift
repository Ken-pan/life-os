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
    /// 方向箭头和下面的距离文字是一个整体 —— 一起缩放。
    /// (它跟 ScanView 的准星不一样:那个锚在 AR 目标上、必须固定;
    ///  这个是面板里的一个图示,跟着文字走才对。)
    @ScaledMetric(relativeTo: .largeTitle) private var arrow: CGFloat = 44

    struct FindTarget: Identifiable {
        var id: String
        var title: String
        var subtitle: String
        var homePointM: SIMD2<Double>
    }

    /// 检索空间:柜内物品(带层号)+ 户型家具。
    /// 静态数据建一次 —— 计算属性会在每次输入字符重渲染时整表重建
    private let allTargets: [FindTarget]

    init(home: CanonicalHome) {
        self.home = home
        self.allTargets = Self.buildTargets(home)
    }

    private static func buildTargets(_ home: CanonicalHome) -> [FindTarget] {
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

    /// 没搜时给最近登记的一批,不是全量。
    ///
    /// 「找东西」的前提是**你已经知道要找什么** —— 开屏甩一份上百条的全清单
    /// (柜内每一件 + 每件家具),等于逼人滚着找,而搜索框才是这一屏的正路。
    /// 给一小撮当"手边常用",其余交给搜索。
    private var filtered: [FindTarget] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return Array(allTargets.prefix(Self.browseLimit)) }
        return allTargets.filter {
            $0.title.localizedCaseInsensitiveContains(q)
                || $0.subtitle.localizedCaseInsensitiveContains(q)
        }
    }

    private static let browseLimit = 12

    var body: some View {
        NavigationStack {
            if let target {
                guide(target)
            } else {
                picker
            }
        }
    }

    @ViewBuilder
    private var picker: some View {
        let hits = filtered
        List {
            if hits.isEmpty {
                // 搜了没结果 vs 家里本来就没登记东西,是两种处境、两种下一步
                ContentUnavailableView {
                    Label(
                        allTargets.isEmpty ? "还没有可找的东西" : "没找到「\(query)」",
                        systemImage: "location.magnifyingglass"
                    )
                } description: {
                    Text(allTargets.isEmpty
                         ? "去网页端的储藏页把物品登记进柜子,这里就能搜了。"
                         : "换个说法试试 —— 也可以搜柜子名(如「格子柜」)。")
                }
                .listRowBackground(Color.clear)
            } else {
                Section {
                    ForEach(hits) { t in
                        Button {
                            controller.targetHomeM = t.homePointM
                            self.target = t
                            controller.start(home: home)
                        } label: {
                            HStack(spacing: HS.Space.snug) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(t.title)
                                        .foregroundStyle(.primary)
                                    Text(t.subtitle)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "location.north.fill")
                                    .font(.caption)
                                    .foregroundStyle(HS.accent)
                            }
                            .contentShape(.rect)
                        }
                        .hsLabel("\(t.title),在 \(t.subtitle)", hint: "开始 AR 导航")
                    }
                } footer: {
                    // 截断了就得说。不说的话,人会以为家里登记的东西就这 12 件 ——
                    // 悄悄少给是最容易让人误判的一种"贴心"。
                    if query.isEmpty, allTargets.count > hits.count {
                        Text("共 \(allTargets.count) 件已登记 —— 上面搜就能找到其余的。")
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "搜物品或家具(如:滤镜 / 格子柜)")
        .navigationTitle("寻找物品")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("关闭") { dismiss() }
            }
        }
    }

    @ViewBuilder
    private func guide(_ t: FindTarget) -> some View {
        ZStack(alignment: .bottom) {
            ARPassthroughView(session: controller.session)
                .ignoresSafeArea()
            TimelineView(.periodic(from: .now, by: 0.3)) { _ in
                VStack(spacing: HS.Space.snug) {
                    if let g = controller.guidance() {
                        let arrived = g.distanceM < 0.8
                        Image(systemName: arrived ? "checkmark.circle.fill" : "location.north.fill")
                            .font(.system(size: arrow))
                            // 到了就别再转箭头 —— 近距离下方位角会疯狂抖动,
                            // 一个乱甩的箭头比不给箭头更让人不知所措
                            .rotationEffect(.degrees(arrived ? 0 : g.bearingDeg))
                            .foregroundStyle(HS.good)
                            .animation(.snappy, value: arrived)
                        if arrived {
                            Text("就在这里:\(t.subtitle)")
                                .font(.headline)
                                .multilineTextAlignment(.center)
                        } else {
                            Text("\(g.direction) \(String(format: "%.1f", g.distanceM)) 米")
                                .font(.title3.weight(.semibold).monospacedDigit())
                                .contentTransition(.numericText())
                        }
                        Text("「\(t.title)」· \(t.subtitle)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    } else {
                        ProgressView()
                        Text("对着墙缓慢环视,让我认出你在户型里的位置…")
                            .font(.subheadline)
                            .multilineTextAlignment(.center)
                        Text("已识别 \(controller.wallCount) 面墙\(controller.registration?.reason.map { " · \($0)" } ?? "")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .contentTransition(.numericText())
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
                .hsPanel()
                .padding(HS.Space.base)
                // 举着手机找东西时人不看屏幕 —— 这块必须能被念出来
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.updatesFrequently)
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
