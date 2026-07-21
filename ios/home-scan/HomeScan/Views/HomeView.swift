import SwiftUI
import RoomPlan
import ARKit

/// 首页 —— 决定「这次要干什么」。
///
/// 排布按**紧迫度**,不按功能分类:
///   1. 没传完的扫描(有就置顶:它是会丢的东西,其它都能等)
///   2. 开扫(这个 App 存在的理由)
///   3. 寻物(日常高频,但要先有户型)
///   4. 历史扫描 / 设置(想起来才找)
///
/// 玻璃只用在**列表之上浮着的东西**(工具栏、警示条)。列表行本身走系统默认 ——
/// 玻璃靠折射背后的内容产生层次,满屏玻璃就没有"背后",层次归零(见 DesignSystem)。
struct HomeView: View {
    @Environment(AppModel.self) private var model
    /// 「柜内扫描」选中的扫描(sheet 里再挑柜子)
    @State private var containerTarget: SupabaseService.ScanRow?
    /// AR 寻物 sheet
    @State private var showFindItem = false
    /// 扫描语音引导开关(与 VoiceGuide.enabledKey 同一把钥匙)
    @AppStorage(VoiceGuide.enabledKey) private var voiceGuide = true
    /// 安静扫描偏好(默认开):关掉 = 高精度补扫,只引导系统指出的 1-3 处重点。startScanning 时读它
    @AppStorage(ScanSessionController.quietScanKey) private var quietScan = true
    /// 待确认删除的扫描
    @State private var pendingDelete: SupabaseService.ScanRow?
    /// 正在改名的扫描
    @State private var renaming: SupabaseService.ScanRow?
    @State private var renameText = ""
    /// 「丢弃没传完的扫描」的确认 —— 它删的是本机唯一一份副本
    @State private var confirmDiscardPending = false
    /// 导出的诊断日志文件(非 nil 时弹分享)
    @State private var diagnosticsFile: URL?
    /// 图标块要跟着动态字体一起长 —— 写死 34pt 的话,字号调到辅助功能档时
    /// 文字撑满整行、图标还是原来那颗小方块,比例整个垮掉(HIG:控件随字号缩放)
    @ScaledMetric(relativeTo: .headline) private var iconTile: CGFloat = 34

    private var scanSupported: Bool {
        RoomCaptureSession.isSupported
    }

    /// 柜内扫描只要普通 ARKit(模拟器 DEBUG 走 mock 联调)
    private var containerScanAvailable: Bool {
        #if DEBUG
        return true
        #else
        return ARWorldTrackingConfiguration.isSupported
        #endif
    }

    var body: some View {
        NavigationStack {
            List {
                if let name = model.justUploaded {
                    successSection(name)
                }
                if let err = model.lastError {
                    errorSection(err)
                }
                if let pending = model.pendingScan {
                    pendingSection(pending)
                }
                scanSection
                if model.canonicalHome != nil, containerScanAvailable {
                    findSection
                }
                scansSection
                settingsSection
            }
            .navigationTitle("HomeScan")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if let email = model.userEmail {
                            Text(email)
                        }
                        Button("退出登录", role: .destructive) {
                            Task { await model.signOut() }
                        }
                    } label: {
                        Image(systemName: "person.circle")
                    }
                    .hsLabel(model.userEmail.map { "账号 \($0)" } ?? "账号")
                }
            }
            .refreshable { await model.refreshScans() }
            .onAppear { model.consumePendingDeepLinkIfReady(); presentPendingDeepLinkSheets() }
            .onChange(of: model.pendingDeepLink) { _, _ in
                presentPendingDeepLinkSheets()
            }
            .sheet(item: $containerTarget) { scan in
                ContainerPickView(scan: scan)
            }
            .sheet(isPresented: $showFindItem) {
                if let home = model.canonicalHome {
                    FindItemView(home: home)
                }
            }
            // 诊断日志分享:AirDrop/微信/邮件都行 —— 真机现场不插线也能交证据
            .sheet(
                isPresented: .init(
                    get: { diagnosticsFile != nil },
                    set: { if !$0 { diagnosticsFile = nil } }
                )
            ) {
                if let url = diagnosticsFile {
                    ActivityShareSheet(items: [url])
                        .presentationDetents([.medium, .large])
                }
            }
            // 删除是不可逆的(立墓碑),必须点名删的是哪一个
            .confirmationDialog(
                "删除这次扫描?",
                isPresented: .init(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
                titleVisibility: .visible,
                presenting: pendingDelete
            ) { scan in
                Button("删除「\(scan.label ?? "未命名扫描")」", role: .destructive) {
                    let id = scan.id
                    Task { await model.deleteScan(id: id) }
                }
                Button("取消", role: .cancel) {}
            } message: { _ in
                Text("会从列表里移除,网页端也不再显示。照片仍留在你的私有存储桶里。")
            }
            .alert("重命名", isPresented: .init(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
                TextField("扫描名", text: $renameText)
                Button("保存") {
                    if let id = renaming?.id {
                        let text = renameText
                        Task { await model.renameScan(id: id, to: text) }
                    }
                }
                Button("取消", role: .cancel) {}
            }
        }
    }

    // MARK: - Kenos deep links

    /// Present find / container sheets queued by `homescan://` (scan starts in AppModel).
    private func presentPendingDeepLinkSheets() {
        guard let action = model.pendingDeepLink else { return }
        switch action {
        case .scan:
            break
        case .find:
            model.pendingDeepLink = nil
            if model.canonicalHome != nil, containerScanAvailable {
                showFindItem = true
            } else {
                model.lastError = "还没有户型副本，无法 AR 寻物。先完成一次全屋扫描。"
            }
        case .container:
            model.pendingDeepLink = nil
            if let first = model.scans.first, containerScanAvailable {
                containerTarget = first
            } else if !containerScanAvailable {
                model.lastError = "此设备不支持柜内 AR 测量。"
            } else {
                model.lastError = "还没有已上传的扫描，无法打开柜内测量。"
            }
        }
    }

    // MARK: - 分区

    /// 「传好了」。这是个**时刻**,不是状态 —— 看过就该走,所以自己会淡出。
    /// 不做成 alert:上传成功不值得拦一下人的路,它只需要被看见。
    private func successSection(_ name: String) -> some View {
        Section {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text("已上传「\(name)」")
                        .font(.subheadline.weight(.semibold))
                    Text("网页端刷新即可看到,本机副本已清理。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(HS.good)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isStaticText)
            .task {
                // 4 秒够看清,又不至于赖着不走。任务跟着视图生命周期,
                // 离开首页就取消 —— 不会在别的屏上偷偷清掉状态。
                try? await Task.sleep(for: .seconds(4))
                model.justUploaded = nil
            }
        }
        .listRowBackground(
            HS.good.opacity(0.12)
        )
    }

    /// 出错了。以前这是**列表最底下**的一行红字 —— 要滚到底才看得见,
    /// 且没法手动消掉。现在置顶,并给一个「知道了」:成功时会自动清
    /// (refreshScans/upload 里),但人想现在就把它收走也得让人收得掉。
    private func errorSection(_ err: String) -> some View {
        Section {
            HStack(alignment: .top, spacing: HS.Space.snug) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(HS.danger)
                Text(err)
                    .font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Button {
                    model.lastError = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .hsLabel("忽略这条错误")
            }
            .padding(.vertical, 2)
            .accessibilityElement(children: .combine)
        }
    }

    /// 没传完的扫描 —— 唯一会丢的东西,永远置顶
    private func pendingSection(_ pending: PendingScanStore.Manifest) -> some View {
        Section {
            VStack(alignment: .leading, spacing: HS.Space.tight) {
                Label("有一次没传完的扫描", systemImage: "tray.and.arrow.up.fill")
                    .font(.headline)
                    .labelStyle(.hsIconText)
                Text(pendingSummary(pending))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                // 这两个坐在 List row 里 —— **不是浮层**。玻璃靠折射"背后的东西"
                // 产生层次,而这里背后就是一张不动的列表卡片:折出来是一片死灰,
                // 白白多一层没有意义的模糊。玻璃属于浮在内容之上的控件(工具栏、
                // 取景器叠层),列表行里的按钮走系统常规样式才是对的。
                HStack(spacing: HS.Space.tight) {
                    Button("继续上传") { model.restorePendingScan() }
                        .buttonStyle(.borderedProminent)
                    Button("丢弃", role: .destructive) { confirmDiscardPending = true }
                        .buttonStyle(.bordered)
                }
                .padding(.top, HS.Space.hair)
                // 「丢弃」删的是本机唯一一份没传完的扫描,删完没有后悔药 ——
                // 全 App 其它三个同级破坏性动作(扫描页取消、预览页放弃、删除扫描)
                // 都有确认,只有这里是裸的。
                .confirmationDialog(
                    "丢弃这次没传完的扫描?",
                    isPresented: $confirmDiscardPending,
                    titleVisibility: .visible
                ) {
                    Button("丢弃 \(pendingSummary(pending))", role: .destructive) {
                        model.discardPendingScan()
                    }
                    Button("留着", role: .cancel) {}
                } message: {
                    Text("本机的保险副本会被永久删除,无法恢复,只能重扫一遍。")
                }
            }
            .padding(.vertical, HS.Space.hair)
        } footer: {
            Text("扫描结果已落盘保存 —— 断网、退出 App 都不会丢,传完自动清理。")
        }
    }

    private var scanSection: some View {
        Section {
            actionRow(
                title: "全屋扫描",
                subtitle: "第一次建模 / 大调整后 · 约 8-15 分钟",
                icon: "camera.metering.matrix",
                tint: HS.accent
            ) { model.startScanning() }
            .disabled(!scanSupported)

            actionRow(
                title: "房间更新",
                subtitle: "挪过家具 / 整理完一间 · 1-3 分钟,只动扫到的区域",
                icon: "arrow.triangle.2.circlepath.camera",
                tint: HS.accent
            ) { model.startScanning(scope: "partial") }
            .disabled(!scanSupported)

            #if DEBUG
            if !scanSupported {
                Button {
                    model.loadMockScan()
                } label: {
                    Label("载入模拟扫描(联调)", systemImage: "wand.and.stars")
                }
            }
            #endif
        } footer: {
            if !scanSupported {
                Label(
                    "此设备不支持 RoomPlan(需要带 LiDAR 的 iPhone Pro / iPad Pro)。",
                    systemImage: "exclamationmark.triangle"
                )
                .labelStyle(.hsIconText)
                // warnText 不是 warn:这是浅色底上的正文,系统亮橙实测只有 1.97:1
                // (AA 要 4.5)。见 DesignSystem 语义色那段。
                .foregroundStyle(HS.warnText)
            } else {
                Text("逐个房间扫描,全部完成后合并、预览并上传。")
            }
        }
    }

    private var findSection: some View {
        Section {
            actionRow(
                title: "寻找物品",
                subtitle: "搜柜内物品或家具,AR 箭头带路",
                icon: "location.magnifyingglass",
                tint: HS.good
            ) { showFindItem = true }
        }
    }

    private var scansSection: some View {
        Section {
            if model.scans.isEmpty {
                // iOS 17+ 的标准空态。以前是一行灰字「还没有扫描」——
                // 说了没有,没说该干嘛。
                ContentUnavailableView {
                    Label("还没有扫描", systemImage: "camera.metering.matrix")
                } description: {
                    Text(scanSupported
                         ? "扫一次全屋,家具、门窗和尺寸就都进 HomeOS 了。"
                         : "这台设备没有 LiDAR,扫不了 —— 换带 LiDAR 的 iPhone Pro。")
                }
                .listRowBackground(Color.clear)
            } else {
                ForEach(model.scans) { scan in
                    scanRow(scan)
                }
            }
        } header: {
            Text("已上传的扫描")
        } footer: {
            if containerScanAvailable, !model.scans.isEmpty {
                Text("左滑可改名或删除。「柜内」:打开柜门测内宽/内深/内高和层板,数据挂在这次扫描的柜子上。")
            }
        }
    }

    private func scanRow(_ scan: SupabaseService.ScanRow) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(scan.label ?? "未命名扫描")
                Text(Self.dateLabel(ms: scan.updatedAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if containerScanAvailable {
                // 开柜门量内腔:建「柜→层」容器层级,挂回这次扫描的家具
                Button {
                    containerTarget = scan
                } label: {
                    Label("柜内", systemImage: "archivebox")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .hsLabel("测量柜内", hint: "给这次扫描的柜子量内腔尺寸")
            }
        }
        // 列表能删能改,才叫列表 —— 以前这一排只能看
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                pendingDelete = scan
            } label: {
                Label("删除", systemImage: "trash")
            }
            Button {
                renameText = scan.label ?? ""
                renaming = scan
            } label: {
                Label("改名", systemImage: "pencil")
            }
            .tint(HS.accent)
        }
        .hsLabel("\(scan.label ?? "未命名扫描"),\(Self.dateLabel(ms: scan.updatedAt))")
    }

    private var settingsSection: some View {
        Section {
            Toggle(isOn: $quietScan) {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("安静扫描")
                        Text("默认开:轻松扫完,不逐件催「还差角度 / 请靠近」。关掉 = 高精度补扫,只引导系统指出的 1-3 处重点,补完即止,不重扫整个家")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "wind")
                }
            }
            Toggle(isOn: $voiceGuide) {
                Label("扫描语音引导", systemImage: "speaker.wave.2")
            }
            Button {
                CanonicalHomeCache.clear()
                Task {
                    model.canonicalHome = await model.supabase.fetchCanonicalHome()
                    model.scanController.setCanonicalHome(model.canonicalHome)
                }
            } label: {
                Label("刷新本机户型缓存", systemImage: "arrow.clockwise")
            }
            // 诊断日志:扫描/上传的结构化事件(JSONL)。真机不插线也能把
            // 现场证据(卡顿/发热降速/门控拒绝/上传失败)发出来
            Button {
                diagnosticsFile = model.exportDiagnostics()
            } label: {
                Label("导出诊断日志", systemImage: "stethoscope")
            }
        } header: {
            Text("设置")
        } footer: {
            Text("照片与扫描只上传到你自己的私有存储桶(按账号隔离,他人不可见);本机只缓存户型副本与未上传的扫描,上传成功即清理。诊断日志只记录性能与操作事件,不含照片。")
        }
    }

    // MARK: - 零件

    /// 主操作行:图标带底色圆角,标题 + 一句「什么时候用它」。
    /// 副标题不是装饰 —— 「全屋扫描」和「房间更新」光看名字选不出来,
    /// 差别在耗时和适用场景上。
    private func actionRow(
        title: String,
        subtitle: String,
        icon: String,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            // .top 而不是居中:大字号下副标题会占三行,居中会把图标推到中间飘着
            HStack(alignment: .top, spacing: HS.Space.snug) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(.white)
                    .frame(width: iconTile, height: iconTile)
                    .background(tint.gradient, in: .rect(cornerRadius: iconTile * 0.26))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .contentShape(.rect)
        }
        .hsLabel(title, hint: subtitle)
    }

    private func pendingSummary(_ m: PendingScanStore.Manifest) -> String {
        let photos = m.photoNames.compactMap { $0 }.count
            + m.objectPhotos.values.reduce(0) { $0 + $1.count }
        return "\(Self.dateLabel(m.savedAt)) · \(m.project.placements.count + m.project.fixtures.count) 件家具 · \(photos) 张照片"
    }

    /// 界面文案全是硬编码中文,日期也得是中文。
    ///
    /// 以前用的 `.formatted(date:time:)` 跟**系统语言**走 —— 手机设成英文的话,
    /// 满屏中文里蹦出一句「Jul 15, 2026 at 8:25 PM」,而旁边 AppModel.defaultScanLabel
    /// 早就写死了 zh_CN。同一个 App 里两套规矩,总有一套是错的。
    static func dateLabel(_ date: Date) -> String {
        date.formatted(
            .dateTime.locale(Locale(identifier: "zh_CN"))
                .month(.abbreviated).day().hour().minute()
        )
    }

    static func dateLabel(ms: Int64) -> String {
        dateLabel(Date(timeIntervalSince1970: TimeInterval(ms) / 1000))
    }
}

/// UIActivityViewController 的最小包装(SwiftUI 的 ShareLink 要求渲染时就有
/// 值,而诊断文件是点击才拼的 —— 用 sheet + 包装,导出动作保持惰性)
private struct ActivityShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}
