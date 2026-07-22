import SwiftUI

#if os(iOS)

/// Domain More — secondary routes + HomeScan companion actions (not on the 5-slot dock).
struct KenosDomainMoreSheet: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.dismiss) private var dismiss
    @State private var homeScanMissingAlert = false
    @State private var homeScanMissingTitle = "HomeScan"

    /// Follow Continuity shell Language (system / zh / en), not only device locale.
    private var prefersChinese: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    private var moreTitle: String { prefersChinese ? "更多" : "More" }
    private var doneTitle: String { prefersChinese ? "完成" : "Done" }

    var body: some View {
        NavigationStack {
            List {
                ForEach(Array(model.domainMoreDestinations.enumerated()), id: \.offset) { _, dest in
                    moreRow(dest)
                }
            }
            .navigationTitle(moreTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(doneTitle) { dismiss() }
                }
            }
            .alert("需要 HomeScan", isPresented: $homeScanMissingAlert) {
                Button("知道了", role: .cancel) {}
            } message: {
                Text(missingCompanionMessage)
            }
        }
        .presentationDetents([.medium, .large])
        .accessibilityIdentifier("kenos.domainMore")
    }

    private var missingCompanionMessage: String {
        "「\(homeScanMissingTitle)」在独立的 HomeScan 伴侣应用里（RoomPlan / AR）。请先安装 HomeScan，或在 Settings → Cloud scans 从网页拉取已有扫描。"
    }

    @ViewBuilder
    private func moreRow(_ dest: (title: String, systemImage: String, path: String)) -> some View {
        Button {
            activate(dest)
        } label: {
            Label(localizedTitle(dest.title), systemImage: dest.systemImage)
        }
    }

    private func activate(_ dest: (title: String, systemImage: String, path: String)) {
        if let companion = KenosHomeScanBridge.destination(fromMorePath: dest.path) {
            if KenosHomeScanBridge.open(companion) {
                dismiss()
            } else {
                homeScanMissingTitle = companion.title
                homeScanMissingAlert = true
            }
            return
        }
        model.selectDomainMorePath(dest.path)
        dismiss()
    }

    /// Manifest titles are English SSOT; localize for zh Continuity UI.
    private func localizedTitle(_ title: String) -> String {
        guard prefersChinese else {
            if title == "Discover" || title == "Explore" || title == "Resources" {
                return "Library"
            }
            return title
        }
        switch title {
        case "Search": return "搜索"
        case "Upcoming": return "即将"
        case "Triage": return "快速处理"
        case "Projects": return "项目"
        case "Completed": return "已完成"
        case "Insights": return "洞察"
        case "Settings": return "设置"
        case "Program": return "计划"
        case "Discover", "Explore", "Resources": return "资料"
        case "Library": return "资料库"
        case "Exercises": return "动作库"
        case "Workout", "Training": return "训练"
        case "Today": return "今日"
        case "Tasks": return "任务"
        case "Calendar": return "日历"
        case "Inbox": return "收件箱"
        case "Stats": return "统计"
        case "Tools": return "工具"
        case "Ask", "Assistant": return "问答"
        case "Spaces": return "Spaces"
        case "Forecast": return "预测"
        case "Stocks": return "股票"
        case "Decision": return "决策"
        case "Review": return "复盘"
        case "Timeline": return "时间线"
        case "Overview": return "总览"
        case "Playlists": return "播放列表"
        case "Liked": return "喜欢"
        case "Browse": return "浏览"
        case "Import": return "导入"
        case "Scan": return "扫描"
        case "Find": return "查找"
        case "Cabinet": return "收纳"
        case "Cloud scans": return "云端扫描"
        case "Home": return "首页"
        default: return title
        }
    }
}

#endif
