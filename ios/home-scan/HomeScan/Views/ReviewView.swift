import SwiftUI
import QuickLook

/// 扫描结果预览:用**转换后的 plan-px 数据**画 2D 顶视图(等于在验证转换),
/// 家具清单带真实尺寸;真机扫描另有 USDZ 3D 模型(QuickLook 可旋转/AR/分享);
/// 确认后进上传。
struct ReviewView: View {
    @Environment(AppModel.self) private var model
    @State private var label = ""
    @State private var showUploadSheet = false
    @State private var previewModelURL: URL?
    @State private var confirmDiscard = false
    /// 覆盖差报只算一次:上传失败弹回这页时别把同样几条再叠一遍
    @State private var coverageChecked = false

    /// 「放弃」到底会毁掉什么 —— 说清楚了人才敢按,也才不会误按
    private var discardSummary: String {
        guard let p = model.convertedProject else { return "这次扫描" }
        let photos = model.photoFiles.compactMap { $0 }.count
            + model.objectPhotoFiles.values.reduce(0) { $0 + $1.count }
        return "\(p.zones.count) 个分区 · \(p.placements.count + p.fixtures.count) 件家具 · \(photos) 张照片"
    }

    var body: some View {
        NavigationStack {
            List {
                // 上传失败会把人扔回这一页 —— 以前这里没有任何显示它的地方,
                // 于是体验是「进度条跑着跑着,画面自己跳回来了,什么都没说」。
                // 放在最上面:失败信息排在预览下面等于没有。
                if let err = model.lastError {
                    Section {
                        HStack(alignment: .top, spacing: HS.Space.snug) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(HS.danger)
                            Text(err)
                                .font(.footnote)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .accessibilityElement(children: .combine)
                    } footer: {
                        Text("扫描没丢,还在这页上 —— 网络好了直接再点右上角「上传」,已传的部分不会重来。")
                    }
                }

                if let p = model.convertedProject {
                    // 「只在有事时弹」(RECOG.1r 真机反馈,2026-07-17):这里原本有一张
                    // 永远显示的「基础扫描已保存 · N 件家具 · K 件认出」安心总账。真实
                    // 用户反馈「反正我都不会看」——一个说「一切正常」的被动横幅没人读,
                    // 只是死表面。已删。页面现在天然遵循「只在有事时弹」:上传失败、覆盖
                    // 提醒(scanWarnings)、现实核对(含 possiblySame 难例)三个 Section
                    // 本就是有内容才出;没事就直接是户型图 + 上传,不再拿假总账占顶。
                    // 呼应战略文档「最后只把 ≤3–5 个难例交给用户」。别再加回被动摘要。
                    Section {
                        PlanPreview(project: p)
                            // 高度跟着户型的实际比例走,不写死。写死 300 的话,
                            // 宽扁户型(大多数)缩放后只用到上半截,下面白掉一大片。
                            // 夹在 160…320:太扁看不清家具,太高把下面的清单挤出屏幕。
                            .frame(height: PlanPreview.fittedHeight(for: p))
                            .listRowInsets(EdgeInsets())
                    } footer: {
                        Text(summary(p))
                    }

                    if model.modelFileURL != nil {
                        Section {
                            Button {
                                previewModelURL = model.modelFileURL
                            } label: {
                                Label("查看 3D 模型(真实空间)", systemImage: "cube.transparent")
                            }
                        } footer: {
                            Text("可旋转查看、AR 摆回现场,分享按钮可 AirDrop 给别人。上传时会一并存入云端。")
                        }
                    }

                    if !p.meta.scanWarnings.isEmpty {
                        Section("提醒") {
                            ForEach(p.meta.scanWarnings, id: \.self) { w in
                                Label(w, systemImage: "exclamationmark.triangle")
                                    .font(.footnote)
                            }
                        }
                        // 这一整区装的都是长句(「7 件家具照片证据不足:stairs 0/3
                        // 个方位、床 1/3 个方位…」),默认 Label 一换行文字就绕到
                        // 图标底下 —— 大字号下整块糊成一坨。见 HSIconTextLabelStyle。
                        .labelStyle(.hsIconText)
                    }

                    if let rc = model.realityCheck {
                        Section {
                            // 家具名是拼出来的,可以很长(「新发现 5 件:床、五斗柜、
                            // 洗衣篮、宠物围栏、金属置物架」)—— 整组套上 style,
                            // 免得文字换行时绕到图标底下。见 HSIconTextLabelStyle。
                            Group {
                                let unchanged = rc.recognized.filter { !$0.moved }.count
                                let moved = rc.recognized.filter(\.moved)
                                Label(
                                    "认出 \(rc.recognized.count) 件(\(unchanged) 件原位)",
                                    systemImage: "checkmark.seal"
                                )
                                ForEach(moved, id: \.scanPlacementId) { r in
                                    Label(
                                        String(format: "「%@」挪了 %.1f ft", r.label, r.movedFt),
                                        systemImage: "arrow.left.arrow.right"
                                    )
                                    .font(.footnote)
                                }
                                if !rc.added.isEmpty {
                                    Label(
                                        "新发现 \(rc.added.count) 件:\(rc.added.map(\.label).joined(separator: "、"))",
                                        systemImage: "plus.circle"
                                    )
                                    .font(.footnote)
                                }
                                if !rc.missing.isEmpty {
                                    Label(
                                        "没扫到:\(rc.missing.joined(separator: "、"))",
                                        systemImage: "questionmark.circle"
                                    )
                                    .font(.footnote)
                                    // 浅色底上的正文 —— 亮橙对比度不够,见 DesignSystem
                                    .foregroundStyle(HS.warnText)
                                }
                            }
                            .labelStyle(.hsIconText)

                            if rc.possiblySame > 0 {
                                Text("\(rc.possiblySame) 件证据不足没敢认,先按新件处理")
                                    .fixedSize(horizontal: false, vertical: true)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        } header: {
                            Text("现实核对")
                        } footer: {
                            Text("已对齐永久户型(残差 \(Int(rc.registeredCm ?? 0))cm)。认出的家具直接用了你起的名字;「没扫到」可能是被挡住,不影响上传。")
                        }
                    }

                    Section {
                        ForEach(p.placements, id: \.id) { pl in
                            row(name: pl.label, w: pl.w, h: pl.h)
                                .contextMenu {
                                    // RoomPlan 认错类别时当场改,不用等网页端
                                    ForEach(Self.kindChoices, id: \.kind) { c in
                                        Button(c.label) {
                                            model.correctPlacement(id: pl.id, kind: c.kind, label: c.label)
                                        }
                                    }
                                }
                        }
                        ForEach(p.fixtures, id: \.id) { fx in
                            row(name: "\(fx.label)(固定)", w: fx.bounds.w, h: fx.bounds.h)
                        }
                    } header: {
                        Text("家具与设施(实测尺寸)")
                    } footer: {
                        Text("类别认错了?长按那一行直接改。")
                    }

                    if !p.viewpoints.isEmpty {
                        Section("机位照片") {
                            PhotoStrip(files: model.photoFiles)
                        }
                    }
                }
            }
            .navigationTitle("扫描预览")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    // 必须二次确认:这里是**整次扫描做完之后**,沉没成本比扫描页更大,
                    // 而按钮就在左上角 —— iOS 用户找「返回」的肌肉记忆正落在这。
                    // cancelScanning() 连盘上的保险副本一起清,按下去没有后悔药。
                    // (扫描页 ScanView 早就补了同样的确认,当时的教训没跟到这一页)
                    Button("放弃") { confirmDiscard = true }
                        .confirmationDialog(
                            "放弃这次扫描?",
                            isPresented: $confirmDiscard,
                            titleVisibility: .visible
                        ) {
                            Button("放弃 \(discardSummary)", role: .destructive) {
                                model.cancelScanning()
                            }
                            // 大多数人点左上角想要的是「先离开」,不是「毁掉」——
                            // 把这条给出来,放弃才不会变成唯一的出口
                            Button("稍后再传(留着扫描)") {
                                Task { await model.keepScanForLater() }
                            }
                            Button("继续看", role: .cancel) {}
                        } message: {
                            Text("「放弃」会永久删除扫描结果和照片,包括本机的保险副本 —— 无法恢复,只能重扫一遍。")
                        }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    // 顶栏留一个:滚到半截想传时不用滑到底
                    Button("上传") { showUploadSheet = true }
                        .disabled(model.convertedProject == nil)
                }
            }
            // 主操作栏走 safeAreaBar —— iOS 26 专门为「浮在滚动内容之上的操作栏」
            // 准备的 API。前两版都试错过,记下来免得有人改回去:
            //
            // 1. ToolbarItem(.bottomBar):被工具栏约束压成一颗浮动药丸,
            //    `.frame(maxWidth:.infinity)` 完全失效 —— 实测只剩一个光秃秃的
            //    图标圆,「上传到 HomeOS」几个字全没了。
            // 2. safeAreaInset:宽度对了,但它只是"垫开"内容,**没有背板** ——
            //    列表照样从按钮后面滚过去,文字在按钮边缘露出半截
            //    (大字号下尤其明显)。补 .scrollEdgeEffectStyle 也救不回来,
            //    那个收边要有 bar 才认。
            //
            // safeAreaBar 三样一起给:全宽、玻璃背板、内容贴近时自动收边。
            .safeAreaBar(edge: .bottom) {
                Button {
                    showUploadSheet = true
                } label: {
                    Label("上传到 HomeOS", systemImage: "icloud.and.arrow.up")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .hsBigHit()
                }
                .buttonStyle(.glassProminent)
                .disabled(model.convertedProject == nil)
                .hsLabel("上传到 HomeOS", hint: "先给这次扫描起个名字")
                .padding(.horizontal, HS.Space.base)
                .padding(.bottom, HS.Space.tight)
            }
            .quickLookPreview($previewModelURL)
            .alert("命名这次扫描", isPresented: $showUploadSheet) {
                TextField(AppModel.defaultScanLabel(), text: $label)
                Button("上传") {
                    // 不填就用「全屋 · 7月15日 14:30」—— 一排「未命名扫描」谁也分不清
                    // 走 startUpload:它留着 Task 句柄,上传页的「取消」才有的按
                    model.startUpload(label: label.isEmpty ? AppModel.defaultScanLabel() : label)
                }
                Button("取消", role: .cancel) {}
            }
            // 覆盖差报:进预览页那一刻对照权威副本算一次「这轮少了什么」——
            // 洗衣间整间漏扫、门窗少一截、某间只有 1 张状态照,都要在**还能
            // 回去补扫的时候**说出来,而不是等网页端拉取后才发现。
            // 条目直接追加进 meta.scanWarnings:上面的「提醒」区就地展示,
            // 上传时随 payload 带走,网页端原样展示。判定本体在 CoverageDiff
            // (纯函数核),这里只做接线;权威副本不可用(第一次建家/断网
            // 且无缓存)就整个静默跳过 —— 差报永远不挡上传。
            .task {
                guard !coverageChecked else { return }
                coverageChecked = true
                guard let project = model.convertedProject,
                      let home = model.canonicalHome ?? CanonicalHomeCache.load()
                else { return }
                let fresh = CoverageDiff.warnings(
                    scan: project,
                    canonical: home,
                    // 旧缓存没有 graphOpenings 时为 nil → 门窗那条静默跳过
                    canonicalOpeningCount: home.graphOpenings?.count
                )
                    .filter { !project.meta.scanWarnings.contains($0) }
                guard !fresh.isEmpty else { return }
                model.convertedProject?.meta.scanWarnings.append(contentsOf: fresh)
            }
        }
    }

    /// 长按改类别的候选(kind 必须在网页 PLACEMENT_KINDS 词表内)
    static let kindChoices: [(kind: String, label: String)] = [
        ("cabinet", "柜"), ("shelf", "架子"), ("wire_rack", "金属置物架"),
        ("table", "桌"), ("coffee_table", "茶几"), ("desk", "书桌"),
        ("chair", "椅"), ("office_chair", "办公椅"),
        ("sofa", "沙发"), ("armchair", "单人沙发"), ("bed", "床"),
        ("tv", "电视"), ("washer", "洗衣机"), ("dryer", "烘干机"),
    ]

    private func summary(_ p: HomeOSProject) -> String {
        var parts = [
            "\(p.wallGraph.edges.count) 墙段",
            "\(p.graphOpenings.count) 门窗",
            "\(p.zones.count) 分区",
            "\(p.placements.count + p.fixtures.count) 家具",
            "\(p.viewpoints.count) 机位",
        ]
        if let sqft = p.meta.sqft {
            parts.append(String(format: "%.0f sqft", sqft))
        }
        if let reg = model.lastHomeFrame, reg.ok {
            parts.append(String(format: "已对齐永久户型 ✓(残差 %.0fcm)", reg.medianCm))
        }
        return parts.joined(separator: " · ")
    }

    /// plan px → 实际尺寸标签(厘米,3 px = 1 英寸)
    private func row(name: String, w: Double, h: Double) -> some View {
        HStack {
            Text(name)
            Spacer()
            Text("\(cm(w)) × \(cm(h)) cm")
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
    }

    private func cm(_ px: Double) -> String {
        String(format: "%.0f", px / 3 * 2.54)
    }
}

/// 顶视图画布:墙(线) + 分区(填充) + 家具(框) + 门窗(缺口标记) + 机位(点+朝向)
struct PlanPreview: View {
    let project: HomeOSProject

    /// 按户型的宽高比算一个合身的高度(以列表满宽 ~360pt 估)。
    /// 户型多半是宽扁的,固定高度会在图下方留一大块死白。
    static func fittedHeight(for p: HomeOSProject, assumedWidth: CGFloat = 360) -> CGFloat {
        let vs = p.wallGraph.vertices
        guard vs.count >= 2 else { return 200 }
        let w = (vs.map(\.x).max() ?? 0) - (vs.map(\.x).min() ?? 0) + 40
        let h = (vs.map(\.y).max() ?? 0) - (vs.map(\.y).min() ?? 0) + 40
        guard w > 0, h > 0 else { return 200 }
        return min(max(assumedWidth * CGFloat(h / w), 160), 320)
    }

    var body: some View {
        Canvas { ctx, size in
            let g = project.wallGraph
            guard !g.vertices.isEmpty else { return }
            let xs = g.vertices.map(\.x)
            let ys = g.vertices.map(\.y)
            let minX = xs.min()! - 20
            let minY = ys.min()! - 20
            let w = xs.max()! - minX + 20
            let h = ys.max()! - minY + 20
            let scale = min(size.width / w, size.height / h)
            func pt(_ x: Double, _ y: Double) -> CGPoint {
                CGPoint(x: (x - minX) * scale, y: (y - minY) * scale)
            }
            var vById: [String: (Double, Double)] = [:]
            for v in g.vertices { vById[v.id] = (v.x, v.y) }

            // 分区
            for zone in project.zones {
                guard zone.polygon.count >= 3 else { continue }
                var path = Path()
                path.move(to: pt(zone.polygon[0].x, zone.polygon[0].y))
                for p in zone.polygon.dropFirst() { path.addLine(to: pt(p.x, p.y)) }
                path.closeSubpath()
                ctx.fill(path, with: .color(.blue.opacity(0.08)))
            }

            // 墙
            for e in g.edges {
                guard let a = vById[e.a], let b = vById[e.b] else { continue }
                var path = Path()
                path.move(to: pt(a.0, a.1))
                path.addLine(to: pt(b.0, b.1))
                ctx.stroke(path, with: .color(.primary), lineWidth: 3)
            }

            // 门窗:宿主边上画亮色短段
            for op in project.graphOpenings {
                guard
                    let e = g.edges.first(where: { $0.id == op.edgeId }),
                    let a = vById[e.a], let b = vById[e.b]
                else { continue }
                let len = hypot(b.0 - a.0, b.1 - a.1)
                guard len > 0 else { continue }
                let inPx = 3.0
                let t0 = op.offsetIn * inPx / len
                let t1 = (op.offsetIn + op.spanIn) * inPx / len
                var path = Path()
                path.move(to: pt(a.0 + (b.0 - a.0) * t0, a.1 + (b.1 - a.1) * t0))
                path.addLine(to: pt(a.0 + (b.0 - a.0) * t1, a.1 + (b.1 - a.1) * t1))
                ctx.stroke(
                    path,
                    with: .color(op.type == "door" ? .orange : .cyan),
                    lineWidth: 4
                )
            }

            // 家具/设施
            for pl in project.placements {
                let rect = CGRect(
                    origin: pt(pl.x, pl.y),
                    size: CGSize(width: pl.w * scale, height: pl.h * scale)
                )
                ctx.stroke(Path(rect), with: .color(.indigo), lineWidth: 1.5)
                ctx.draw(
                    Text(pl.label).font(.system(size: 9)),
                    at: CGPoint(x: rect.midX, y: rect.midY)
                )
            }
            for fx in project.fixtures {
                let rect = CGRect(
                    origin: pt(fx.bounds.x, fx.bounds.y),
                    size: CGSize(width: fx.bounds.w * scale, height: fx.bounds.h * scale)
                )
                ctx.stroke(
                    Path(rect),
                    with: .color(.gray),
                    style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])
                )
            }

            // 机位
            for vp in project.viewpoints {
                let c = pt(vp.x, vp.y)
                ctx.fill(
                    Path(ellipseIn: CGRect(x: c.x - 4, y: c.y - 4, width: 8, height: 8)),
                    with: .color(.red)
                )
                // heading:0=上、顺时针 → 屏幕向量 (sin, -cos)
                let rad = vp.heading * .pi / 180
                var arrow = Path()
                arrow.move(to: c)
                arrow.addLine(to: CGPoint(x: c.x + sin(rad) * 14, y: c.y - cos(rad) * 14))
                ctx.stroke(arrow, with: .color(.red), lineWidth: 2)
            }
        }
        .background(Color(.secondarySystemBackground))
    }
}

private struct PhotoStrip: View {
    let files: [URL?]

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Array(files.enumerated()), id: \.offset) { _, url in
                    if let url, let img = UIImage(contentsOfFile: url.path) {
                        Image(uiImage: img)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 72, height: 96)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }
}
