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

    var body: some View {
        NavigationStack {
            List {
                if let p = model.convertedProject {
                    Section {
                        PlanPreview(project: p)
                            .frame(height: 300)
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
                    }

                    if let rc = model.realityCheck {
                        Section {
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
                                .foregroundStyle(.orange)
                            }
                            if rc.possiblySame > 0 {
                                Text("\(rc.possiblySame) 件证据不足没敢认,先按新件处理")
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
                    Button("放弃") { model.cancelScanning() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("上传") { showUploadSheet = true }
                        .buttonStyle(.borderedProminent)
                }
            }
            .quickLookPreview($previewModelURL)
            .alert("命名这次扫描", isPresented: $showUploadSheet) {
                TextField(AppModel.defaultScanLabel(), text: $label)
                Button("上传") {
                    // 不填就用「全屋 · 7月15日 14:30」—— 一排「未命名扫描」谁也分不清
                    Task { await model.upload(label: label.isEmpty ? AppModel.defaultScanLabel() : label) }
                }
                Button("取消", role: .cancel) {}
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
