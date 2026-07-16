import SwiftUI
import RoomPlan

/// 扫描屏:RoomCaptureView 全屏 + 叠加控制。
/// 流程:逐间扫 →「完成本房间」→「再扫一间」/「全部完成」;随时「拍照」记机位。
///
/// 叠加层只有两种东西,别混:
///
/// - **状态徽标**(顶部,常驻):已扫几间、对齐上没有、是不是在降级采集。
///   它们描述「现在是什么情况」,变化慢,人瞟一眼就够。
/// - **引导横幅**(底部,一次一条):「往右走两步」「对准床」。它描述
///   「现在该干嘛」,是唯一需要人立刻照做的东西。
///
/// 这条分界是有来历的:控制器早就把三种 hint 按「跟踪异常 > 补拍走位 >
/// 机位站位」收敛成了唯一一条(ScanSessionController 的 HUD 优先级),而这一屏
/// 曾经把降级提示、对齐徽标、hint、错误、漏扫五条**并排堆在取景器上** ——
/// 等于把控制器的优先级判断作废,人举着手机在动,五条胶囊糊在房间上,
/// 哪条都读不进去。
///
/// 状态进徽标还解决了另一个问题:过热降级是个**持续状态**,如果和指令抢同一
/// 条横幅,手机一热就永久盖住行走引导 —— 人再也收不到「往哪走」了。
struct ScanView: View {
    @Environment(AppModel.self) private var model
    @State private var betweenRooms = false
    @State private var busy = false
    @State private var confirmNoPhotos = false
    @State private var confirmCancel = false
    /// 快门计数器 —— 只用来触发触觉(.sensoryFeedback 认「值变了」)
    @State private var shutterOK = 0
    @State private var shutterFail = 0
    /// 快门失败时的临时提示。光震一下只说明「没成」,不说明该干嘛。
    @State private var shutterHint: String?
    /// 玻璃形变的命名空间 —— 引导横幅换文案时靠它认出「还是同一块玻璃」
    @Namespace private var glassNS

    private var hasProgress: Bool {
        model.scanController.roomCount > 0 || !model.poses.isEmpty
    }

    /// 此刻唯一该说的那句话。一次一条 —— 见类型头注释。
    private var guidance: (text: String, icon: String, tint: Color)? {
        let c = model.scanController
        // 正在合并/出模型:这一段要跑好几秒。它压倒一切 —— 此刻屏幕上任何
        // 「往右走两步」都是过期指令,人已经按完「全部完成」了。
        if let status = model.processingStatus {
            return (status, "gearshape.2.fill", .primary)
        }
        // 出错了压倒一切:数据正在丢
        if let err = c.lastError {
            return (err, "exclamationmark.octagon.fill", HS.danger)
        }
        // 刚按的快门没成 —— 这是人此刻唯一在等的答复
        if let hint = shutterHint {
            return (hint, "camera.badge.ellipsis", HS.warn)
        }
        // 房间之间:该决定「再扫一间还是收工」,漏扫哪间是唯一有用的输入
        if betweenRooms {
            if let reg = c.homeFrame, reg.ok, !c.uncoveredRooms.isEmpty {
                return ("还没扫到:\(c.uncoveredRooms.joined(separator: "、"))",
                        "location.slash.fill", HS.warn)
            }
        } else if let hint = c.hudHint {
            // 扫描中:控制器已经挑好了那一条,照搬它的优先级,别在这儿二次发挥
            return (hint.text, hint.kind.icon, hint.kind == .tracking ? HS.warn : .primary)
        }
        // 垫底:降级原因。
        //
        // 它必须**排在最后**,但也必须出现。两头都有理由:
        // - 排最后:它是持续状态,放前面的话手机一热就永久盖住行走引导,
        //   人再也收不到「往哪走」。
        // - 必须出现:文案是「手机偏热:已降速采集,**歇几秒更快**」——里面带着
        //   行动指令。顶上那颗徽标只写得下「降级」两个字,把这句话吃掉了
        //   (只有 VoiceOver 还读得到,能看见的人反而不知道该干嘛)。
        // 垫底 = 没有别的话要说时才讲,既不抢,也不丢。
        if let reason = c.degradedReason {
            return (reason, "thermometer.sun.fill", HS.warn)
        }
        return nil
    }

    var body: some View {
        ZStack {
            RoomCaptureContainer(controller: model.scanController)
                .id(model.scanController.roomGeneration)
                .ignoresSafeArea()

            // 目标标记要和 RoomCaptureView 同一个坐标系 —— 一样忽略安全区,
            // 否则准星会整体偏掉一条状态栏的高度
            GeometryReader { geo in
                Color.clear
                    .onAppear { model.scanController.viewportSize = geo.size }
                    .onChange(of: geo.size) { _, s in model.scanController.viewportSize = s }
            }
            .ignoresSafeArea()

            // 「他让我拍的是哪一件」:在画面里就套准星,不在就在边缘画箭头
            if !betweenRooms, let marker = model.scanController.guideMarker {
                GuideMarkerOverlay(marker: marker)
                    .ignoresSafeArea()
                    // 「对上了,别动」是整个引导循环的**成交时刻** —— 而它恰恰发生在
                    // 人举着手机盯着房间、不看屏幕的时候。准星变绿只有看着才知道;
                    // 震一下,手上就知道了,可以停手。
                    .sensoryFeedback(.impact(weight: .light), trigger: marker.framed) { _, now in now }
            }

            VStack(spacing: 0) {
                statusBar
                Spacer()
                guidanceBanner
                actionBar
            }
        }
        // 玻璃件之间会互相感知、融合边缘 —— 同一屏的浮层套在一个容器里,
        // 它们才是「一层玻璃上的几个控件」,而不是几片各自为政的塑料。
        .animation(.snappy(duration: 0.22), value: betweenRooms)
        .animation(.snappy(duration: 0.22), value: guidance?.text)
        // 合并期间别让人误点「取消」——那一秒他以为卡住了,一点就真丢了
        .disabled(model.processingStatus != nil)
        // 「一间扫完了」是这个流程里为数不多的里程碑,而人此刻多半在看房间不看屏幕
        .sensoryFeedback(.success, trigger: betweenRooms) { _, now in now }
        // 快门失败提示是临时的:说完就走,不然它会一直垫在底下挡住真正的引导
        .task(id: shutterFail) {
            guard shutterHint != nil else { return }
            try? await Task.sleep(for: .seconds(2.5))
            shutterHint = nil
        }
        // 扫描要举着手机好几分钟,息屏会直接打断 ARSession —— 全程保持常亮
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }
}

// MARK: - 叠加层

extension ScanView {
    /// 顶部:退出 + 状态徽标。全是「现在是什么情况」,变化慢,瞟一眼就够。
    ///
    /// 整排包一个 GlassEffectContainer,不是"顺手包一下":
    /// **玻璃采样不到玻璃** —— 容器的作用是给里面所有玻璃一个**共享的采样域**。
    /// 不包的话,取消按钮和右边那排徽标各自独立采背景:同一排上的玻璃会长得
    /// 不一样,而且每块都要单跑一遍背板采样,GPU 白花。
    /// (以前就是错的:按钮裸在外面,只有徽标那几个包了容器。)
    private var statusBar: some View {
        GlassEffectContainer(spacing: HS.Space.tight) {
            statusBarContent
        }
        .padding(.horizontal, HS.Space.base)
        .padding(.top, HS.Space.tight)
    }

    private var statusBarContent: some View {
        HStack(spacing: HS.Space.tight) {
            Button {
                // 已扫的房间/照片会被丢掉 —— 必须二次确认
                // (实测有人误以为数据已丢而点取消,反而真丢了)
                if hasProgress {
                    confirmCancel = true
                } else {
                    model.cancelScanning()
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .hsBigHit()
            }
            .buttonStyle(.glass)
            .hsLabel("退出扫描", hint: hasProgress ? "会先问你要不要丢弃已扫的内容" : nil)
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

            Spacer(minLength: HS.Space.tight)

            // 徽标按「变化频率」排:数字一直在动的放左边,状态类的放右边。
            // 这里**不再**套第二层 GlassEffectContainer —— 容器套容器等于又把
            // 采样域切开一次,正是外面那层要解决的问题。整排共用最外面那一个。
            HStack(spacing: HS.Space.hair) {
                counterChip
                if let reg = model.scanController.homeFrame, reg.ok {
                    chip("scope", String(format: "%.0fcm", reg.medianCm), HS.good)
                        .hsLabel("已对齐户型,残差 \(Int(reg.medianCm)) 厘米")
                        .transition(.scale.combined(with: .opacity))
                }
                // 降级采集(过热/低电量)是**持续状态**,所以在这儿常驻,
                // 不去和引导抢那条横幅 —— 抢了的话手机一热就再没有行走引导了
                if let reason = model.scanController.degradedReason {
                    chip("thermometer.sun.fill", "降级", HS.warn)
                        .hsLabel("正在降级采集:\(reason)")
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.snappy, value: model.scanController.homeFrame?.ok)
            .animation(.snappy, value: model.scanController.degradedReason)
        }
    }

    /// 进度计数。数字用 tabular + contentTransition,跳动时不会左右抖。
    private var counterChip: some View {
        let c = model.scanController
        return HStack(spacing: HS.Space.hair) {
            Text("\(c.roomCount)")
                .contentTransition(.numericText())
            Image(systemName: "square.split.bottomrightquarter").imageScale(.small)
            Text("\(model.poses.count)")
                .contentTransition(.numericText())
            Image(systemName: "camera").imageScale(.small)
            Text("\(c.objectShotCount)")
                .contentTransition(.numericText())
            Image(systemName: "shippingbox").imageScale(.small)
        }
        .monospacedDigit()
        .hsCapsule()
        .animation(.snappy, value: c.roomCount)
        .animation(.snappy, value: model.poses.count)
        .animation(.snappy, value: c.objectShotCount)
        // ⚠️ 必须先 .ignore 再给 label:这是个装了 6 个子元素的 HStack,
        // 光写 accessibilityLabel 是**盖不住**它们的 —— VoiceOver 会把
        // 「2」「camera」「5」「shippingbox」逐个念一遍,下面那句人话反而不生效。
        // (chip() 那几个是 Label,本来就是单元素,不需要这一步)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("已扫 \(c.roomCount) 间,\(model.poses.count) 张机位照,\(c.objectShotCount) 件家具照")
    }

    private func chip(_ icon: String, _ text: String, _ tint: Color) -> some View {
        Label(text, systemImage: icon)
            .labelStyle(.titleAndIcon)
            .monospacedDigit()
            .hsCapsule(tint: tint)
    }

    /// 底部:此刻唯一该说的那句话。
    ///
    /// 包一层 GlassEffectContainer 是 glassEffectID 生效的前提 —— 容器才是
    /// 「这些玻璃互相认识、可以融合/形变」的作用域。
    @ViewBuilder
    private var guidanceBanner: some View {
        GlassEffectContainer(spacing: HS.Space.tight) {
            guidanceContent
        }
    }

    @ViewBuilder
    private var guidanceContent: some View {
        if let g = guidance {
            Label {
                Text(g.text)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: g.icon).foregroundStyle(g.tint)
            }
            .font(.callout.weight(.medium))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(HS.Space.snug)
            .glassEffect(.regular, in: .rect(cornerRadius: 18))
            // 同一块玻璃换内容,不是「旧的消失、新的出现」。给它固定身份,
            // 文案变长变短时这块玻璃会**液态地重塑**成新形状 —— 这正是
            // Liquid Glass 区别于「一块半透明背板」的地方。
            // 引导文案一路上换很多次(走位 → 对准 → 合并中…),是全 App 最该
            // 用上这个的地方。
            .glassEffectID("guidance", in: glassNS)
            .padding(.horizontal, HS.Space.base)
            .padding(.bottom, HS.Space.tight)
            .transition(.opacity)
            .accessibilityAddTraits(.updatesFrequently)
        }
    }

    /// 底部操作栏。
    ///
    /// 以前三个按钮全是 `.borderedProminent` 并排 —— 三个都在喊,等于都没喊。
    /// 现在按「这一步最该干什么」分层:主操作 glassProminent,次要 glass,
    /// 收尾动作单独一行、绿色 —— 它是不可逆的一步(进预览),不该和常用动作挤在一起。
    @ViewBuilder
    private var actionBar: some View {
        GlassEffectContainer(spacing: HS.Space.tight) {
            VStack(spacing: HS.Space.tight) {
                if betweenRooms {
                    HStack(spacing: HS.Space.tight) {
                        shutterButton
                        Button {
                            model.scanController.startNextRoom()
                            betweenRooms = false
                        } label: {
                            Label("再扫一间", systemImage: "plus.viewfinder")
                                .frame(maxWidth: .infinity)
                                .hsBigHit()
                        }
                        .buttonStyle(.glassProminent)
                        .hsLabel("再扫一间", hint: "继续扫下一个房间")
                    }
                    Button {
                        if model.poses.isEmpty {
                            confirmNoPhotos = true
                        } else {
                            finishAll()
                        }
                    } label: {
                        Group {
                            if busy {
                                ProgressView()
                            } else {
                                Label("全部完成 · 去预览", systemImage: "checkmark")
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .hsBigHit()
                    }
                    .buttonStyle(.glassProminent)
                    .tint(HS.good)
                    .disabled(busy || model.scanController.roomCount == 0)
                    .hsLabel("全部完成,去预览")
                    .alert("还没拍机位照片", isPresented: $confirmNoPhotos) {
                        Button("好,就在这里拍") {}
                        Button("不拍了,直接完成", role: .destructive) { finishAll() }
                    } message: {
                        Text("已扫的 \(model.scanController.roomCount) 间都在,不用退回去 —— 对着想记录的地方按「拍照」即可。照片带着精确位置和朝向进 HomeOS,建议每个房间 2-3 张。")
                    }
                } else {
                    HStack(spacing: HS.Space.tight) {
                        shutterButton
                        Button {
                            busy = true
                            Task {
                                await model.scanController.finishRoomAndWait()
                                busy = false
                                betweenRooms = true
                            }
                        } label: {
                            Group {
                                if busy {
                                    ProgressView()
                                } else {
                                    Label("完成本房间", systemImage: "stop.circle")
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .hsBigHit()
                        }
                        .buttonStyle(.glassProminent)
                        .disabled(busy)
                        .hsLabel("完成本房间")
                    }
                }
            }
        }
        .padding(.horizontal, HS.Space.base)
        .padding(.bottom, HS.Space.loose)
    }

    /// 快门。房间之间 ARSession 还活着 —— 补拍不需要「再扫一间」,在这里直接拍
    /// (此前退回去补拍,取景重建像丢了建模,吓得人点取消,才真把数据丢了)。
    ///
    /// 按下去必须**有感**,两个理由:
    /// 1. 这是举着手机、眼睛在看房间的场景 —— 屏幕上那个 +1 你根本没在看。
    ///    自动抓拍一直是有震动的(AutoViewpointCapture),偏偏人**主动**按的这次没有,
    ///    反了。
    /// 2. `capture` 会返回 nil(ARSession 还没出帧)。以前失败是**彻底静默**的:
    ///    你按了,什么都没发生,连它失败了都不知道 —— 只会以为没点中,再按一次。
    private var shutterButton: some View {
        Button {
            if let pose = ViewpointCapture.capture(from: model.scanController.arSession) {
                model.poses.append(pose)
                shutterOK += 1
            } else {
                shutterFail += 1
                shutterHint = "还没抓到画面 —— 举稳一秒再按"
            }
        } label: {
            Image(systemName: "camera.fill")
                .font(.body.weight(.semibold))
                .hsBigHit()
                .padding(.horizontal, HS.Space.hair)
        }
        .buttonStyle(.glass)
        .sensoryFeedback(.impact(weight: .medium), trigger: shutterOK)
        .sensoryFeedback(.error, trigger: shutterFail)
        .hsLabel("拍机位照片", hint: "记录你此刻站的位置和朝向")
    }

    private func finishAll() {
        busy = true
        Task {
            await model.finishScanning()
            busy = false
        }
    }
}

/// 目标标记 —— 用眼睛回答「他让我拍的到底是哪一件」。
///
/// 文字引导("朝右前方走 2 米,对准床")在真实房间里不够用:屋里两张床、
/// 三个柜子的时候,用户只能挨个试。目标在画面里就套个准星,不在就在屏幕
/// 边缘画箭头指过去;取景一达标立刻变绿 —— 那是「对上了,可以停手」的信号,
/// 也是用户唯一需要的反馈。
///
/// ⚠️ 这里的尺寸**故意写死,不跟动态字体缩放**,别"顺手改掉":
/// 准星和箭头是**空间指示器**,不是文字 —— 它们锚在 AR 里那件真实家具上,
/// 92pt 的框对应的是"取景到这个程度就够了"。字号调大就把框撑开的话,
/// 它指的东西就变了(框比目标大 = 永远算"取景达标")。Apple 自己的 AR
/// 引导层同理,一律固定尺寸。
/// 需要照顾视力的人,靠的是引导横幅那句话(它跟着动态字体走)和触觉,不是把准星放大。
private struct GuideMarkerOverlay: View {
    let marker: ScanSessionController.GuideMarker

    private var tint: Color { marker.framed ? HS.good : .yellow }

    var body: some View {
        GeometryReader { geo in
            if let p = marker.screen {
                reticle
                    // 夹回画面内:目标压在边上时准星有一半在屏幕外,反而看不出指哪
                    .position(
                        x: min(max(p.x, 56), geo.size.width - 56),
                        y: min(max(p.y, 84), geo.size.height - 84)
                    )
            } else {
                edgeArrow(in: geo.size)
            }
        }
        .allowsHitTesting(false)
        // 对 VoiceOver 藏起来:准星/箭头是引导横幅那句话的**视觉重复**,
        // 念两遍只会打架。横幅带 .updatesFrequently,那才是朗读的正主。
        .accessibilityHidden(true)
        .animation(.easeOut(duration: 0.18), value: marker.framed)
    }

    private var reticle: some View {
        VStack(spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .stroke(tint, lineWidth: 3)
                    .frame(width: 92, height: 92)
                    .shadow(radius: 3)
                Image(systemName: marker.framed ? "checkmark.circle.fill" : "viewfinder")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(tint)
            }
            Text(marker.framed ? "对上了,别动" : marker.label)
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, HS.Space.tight)
                .padding(.vertical, 3)
                .glassEffect(.regular, in: .capsule)
        }
    }

    /// 屏幕边缘箭头。relativeDeg:0 = 正前(屏幕上)、+90 = 右手边、±180 = 身后(下)。
    /// 位置沿椭圆走,箭头本身也转到同一角度 —— 位置说「在那边」,朝向说「转过去」。
    private func edgeArrow(in size: CGSize) -> some View {
        let rad = marker.relativeDeg * .pi / 180
        let rx = max(size.width / 2 - 52, 1)
        let ry = max(size.height / 2 - 104, 1)
        let x = size.width / 2 + sin(rad) * rx
        let y = size.height / 2 - cos(rad) * ry
        return VStack(spacing: 4) {
            Image(systemName: "arrow.up.circle.fill")
                .font(.system(size: 42))
                .foregroundStyle(tint)
                .rotationEffect(.degrees(marker.relativeDeg))
                .shadow(radius: 3)
            Text("\(marker.label) · \(String(format: "%.1f", marker.distanceM)) 米")
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, HS.Space.tight)
                .padding(.vertical, 3)
                .glassEffect(.regular, in: .capsule)
        }
        .position(x: x, y: y)
    }
}

private struct RoomCaptureContainer: UIViewRepresentable {
    let controller: ScanSessionController

    func makeUIView(context: Context) -> RoomCaptureView {
        controller.makeCaptureView()
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}
